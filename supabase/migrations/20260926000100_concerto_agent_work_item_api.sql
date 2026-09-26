begin;

alter table public.observatory_work_items
  alter column created_by drop not null,
  add column created_by_agent text,
  add constraint observatory_work_items_created_by_agent_check check (
    created_by_agent is null
    or (
      length(created_by_agent) between 1 and 80
      and created_by_agent ~ '^[a-z][a-z0-9-]*$'
    )
  ),
  add constraint observatory_work_items_creator_principal_check check (
    num_nonnulls(created_by, created_by_agent) = 1
  );

create table public.observatory_agent_work_item_operations (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null check (
    length(agent_id) between 1 and 80
    and agent_id ~ '^[a-z][a-z0-9-]*$'
  ),
  idempotency_key text not null check (
    length(idempotency_key) between 1 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  action text not null check (
    action in ('create', 'update', 'transition', 'assign', 'add_evidence')
  ),
  request_fingerprint text not null check (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  work_item_id uuid not null
    references public.observatory_work_items(id) on delete restrict,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (agent_id, idempotency_key)
);

alter table public.observatory_agent_work_item_operations enable row level security;
revoke all privileges on table public.observatory_agent_work_item_operations
from public, anon, authenticated, service_role;

create function public.create_observatory_work_item_as_agent(
  p_agent_id text,
  p_type text,
  p_title text,
  p_description text,
  p_project_ref text,
  p_project_version_id uuid,
  p_version_binding_kind text,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_agent_id text := btrim(p_agent_id);
  normalized_type text := btrim(p_type);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_project_ref text := btrim(p_project_ref);
  normalized_idempotency_key text := btrim(p_idempotency_key);
  selected_version public.observatory_project_versions;
  existing_operation public.observatory_agent_work_item_operations;
  created_item public.observatory_work_items;
  operation_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if normalized_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
    or normalized_type not in ('idea', 'feature', 'bug')
    or length(normalized_title) not between 1 and 200
    or length(normalized_description) > 4000
    or normalized_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
    or p_version_binding_kind not in ('required', 'optional')
    or normalized_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_request_fingerprint !~ '^[a-f0-9]{64}$'
  then
    raise exception 'OBSERVATORY_AGENT_CREATE_BOUNDARY_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(normalized_agent_id || ':' || normalized_idempotency_key, 0)
  );
  select * into existing_operation
  from public.observatory_agent_work_item_operations
  where agent_id = normalized_agent_id
    and idempotency_key = normalized_idempotency_key;
  if existing_operation.id is not null then
    if existing_operation.action <> 'create'
      or existing_operation.request_fingerprint <> p_request_fingerprint
    then
      raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return existing_operation.result;
  end if;

  select * into selected_version
  from public.observatory_project_versions
  where id = p_project_version_id;
  if selected_version.id is null
    or selected_version.project_key <> normalized_project_ref
    or selected_version.status in ('released', 'archived', 'cancelled')
  then
    raise exception 'OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED'
      using errcode = '23514';
  end if;

  insert into public.observatory_work_items (
    type, title, description, state, project_ref,
    project_version_id, version_binding_kind, assigned_agent_id,
    idempotency_key, created_by, created_by_agent
  ) values (
    normalized_type, normalized_title, normalized_description, 'inbox',
    normalized_project_ref, selected_version.id,
    p_version_binding_kind, normalized_agent_id, normalized_idempotency_key,
    null, normalized_agent_id
  ) returning * into strict created_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    created_item.id, 'created', null, normalized_agent_id,
    jsonb_build_object(
      'type', created_item.type,
      'state', created_item.state,
      'title', created_item.title,
      'project_ref', created_item.project_ref,
      'assigned_agent_id', created_item.assigned_agent_id,
      'version', created_item.version
    )
  );

  operation_result := jsonb_build_object('workItem', to_jsonb(created_item));
  insert into public.observatory_agent_work_item_operations (
    agent_id, idempotency_key, action, request_fingerprint,
    work_item_id, result
  ) values (
    normalized_agent_id, normalized_idempotency_key, 'create',
    p_request_fingerprint, created_item.id, operation_result
  );
  return operation_result;
end;
$$;

revoke all privileges on function public.create_observatory_work_item_as_agent(
  text, text, text, text, text, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item_as_agent(
  text, text, text, text, text, uuid, text, text, text
) to service_role;

create function public.execute_observatory_agent_work_item_command(
  p_agent_id text,
  p_is_project_owner boolean,
  p_project_ref text,
  p_work_item_id uuid,
  p_expected_version integer,
  p_action text,
  p_payload jsonb,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_agent_id text := btrim(p_agent_id);
  normalized_project_ref text := btrim(p_project_ref);
  normalized_action text := btrim(p_action);
  normalized_idempotency_key text := btrim(p_idempotency_key);
  existing_operation public.observatory_agent_work_item_operations;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  created_evidence public.observatory_work_item_evidence;
  target_state text;
  assigned_agent_id text;
  transition_allowed boolean;
  event_type text;
  event_data jsonb;
  operation_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if normalized_agent_id !~ '^[a-z][a-z0-9-]{0,79}$' then
    raise exception 'OBSERVATORY_AGENT_COMMAND_AGENT_INVALID' using errcode = '22023';
  elsif normalized_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'OBSERVATORY_AGENT_COMMAND_PROJECT_INVALID' using errcode = '22023';
  elsif normalized_action not in ('update', 'transition', 'assign', 'add_evidence') then
    raise exception 'OBSERVATORY_AGENT_COMMAND_ACTION_INVALID' using errcode = '22023';
  elsif p_expected_version is null or p_expected_version < 1 then
    raise exception 'OBSERVATORY_AGENT_COMMAND_VERSION_INVALID' using errcode = '22023';
  elsif normalized_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'OBSERVATORY_AGENT_COMMAND_IDEMPOTENCY_INVALID' using errcode = '22023';
  elsif p_request_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'OBSERVATORY_AGENT_COMMAND_FINGERPRINT_INVALID' using errcode = '22023';
  elsif jsonb_typeof(p_payload) <> 'object' then
    raise exception 'OBSERVATORY_AGENT_COMMAND_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(normalized_agent_id || ':' || normalized_idempotency_key, 0)
  );
  select * into existing_operation
  from public.observatory_agent_work_item_operations
  where agent_id = normalized_agent_id
    and idempotency_key = normalized_idempotency_key;
  if existing_operation.id is not null then
    if existing_operation.action <> normalized_action
      or existing_operation.request_fingerprint <> p_request_fingerprint
    then
      raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return existing_operation.result;
  end if;

  select * into current_item
  from public.observatory_work_items
  where id = p_work_item_id
  for update;
  if current_item.id is null then
    raise exception 'OBSERVATORY_WORK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(current_item.project_key, current_item.project_ref) <> normalized_project_ref then
    raise exception 'OBSERVATORY_AGENT_FORBIDDEN' using errcode = '42501';
  end if;
  if not p_is_project_owner and current_item.assigned_agent_id <> normalized_agent_id then
    raise exception 'OBSERVATORY_AGENT_FORBIDDEN' using errcode = '42501';
  end if;
  if current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  if normalized_action = 'update' then
    if p_payload - array['title', 'description', 'acceptanceCriteria', 'priority'] <> '{}'::jsonb then
      raise exception 'OBSERVATORY_AGENT_UPDATE_BOUNDARY_INVALID' using errcode = '22023';
    end if;
    update public.observatory_work_items
    set title = coalesce(nullif(btrim(p_payload ->> 'title'), ''), current_item.title),
      description = case when p_payload ? 'description'
        then btrim(coalesce(p_payload ->> 'description', ''))
        else current_item.description end,
      acceptance_criteria = case when p_payload ? 'acceptanceCriteria'
        then btrim(coalesce(p_payload ->> 'acceptanceCriteria', ''))
        else current_item.acceptance_criteria end,
      priority = case when p_payload ? 'priority'
        then nullif(btrim(coalesce(p_payload ->> 'priority', '')), '')
        else current_item.priority end,
      version = current_item.version + 1
    where id = current_item.id and version = current_item.version
    returning * into strict updated_item;
    event_type := 'updated';
    event_data := jsonb_build_object(
      'before', jsonb_build_object(
        'title', current_item.title,
        'description', current_item.description,
        'acceptance_criteria', current_item.acceptance_criteria,
        'priority', current_item.priority,
        'version', current_item.version
      ),
      'after', jsonb_build_object(
        'title', updated_item.title,
        'description', updated_item.description,
        'acceptance_criteria', updated_item.acceptance_criteria,
        'priority', updated_item.priority,
        'version', updated_item.version
      )
    );
  elsif normalized_action = 'transition' then
    if p_payload - 'targetState' <> '{}'::jsonb then
      raise exception 'OBSERVATORY_AGENT_TRANSITION_BOUNDARY_INVALID' using errcode = '22023';
    end if;
    target_state := btrim(p_payload ->> 'targetState');
    transition_allowed :=
      (current_item.state = 'inbox' and target_state = 'triage')
      or (current_item.state = 'triage' and target_state in ('inbox', 'ready'))
      or (current_item.state = 'ready' and target_state in ('triage', 'in_progress'))
      or (current_item.state = 'in_progress' and target_state in ('review', 'blocked', 'waiting'))
      or (current_item.state = 'review' and target_state in ('in_progress', 'done', 'blocked', 'waiting'))
      or (current_item.state = 'done' and target_state = 'reopened')
      or (current_item.state = 'blocked' and target_state in ('in_progress', 'waiting'))
      or (current_item.state = 'waiting' and target_state in ('in_progress', 'blocked'))
      or (current_item.state = 'reopened' and target_state in ('ready', 'in_progress'));
    if not transition_allowed then
      raise exception 'OBSERVATORY_INVALID_TRANSITION' using errcode = '22023';
    end if;
    if target_state in ('done', 'reopened') and not p_is_project_owner then
      raise exception 'OBSERVATORY_AGENT_FORBIDDEN' using errcode = '42501';
    end if;
    if target_state = 'ready' and (
      current_item.acceptance_criteria = ''
      or current_item.priority is null
      or current_item.owner_id is null
    ) then
      raise exception 'OBSERVATORY_READY_GATE_FAILED' using errcode = '23514';
    end if;
    update public.observatory_work_items
    set state = target_state, version = current_item.version + 1
    where id = current_item.id and version = current_item.version
    returning * into strict updated_item;
    event_type := 'state_transitioned';
    event_data := jsonb_build_object(
      'from', current_item.state,
      'to', updated_item.state,
      'before_version', current_item.version,
      'after_version', updated_item.version
    );
  elsif normalized_action = 'assign' then
    if not p_is_project_owner then
      raise exception 'OBSERVATORY_AGENT_FORBIDDEN' using errcode = '42501';
    end if;
    if p_payload - 'assignedAgentId' <> '{}'::jsonb then
      raise exception 'OBSERVATORY_AGENT_ASSIGN_BOUNDARY_INVALID' using errcode = '22023';
    end if;
    assigned_agent_id := btrim(p_payload ->> 'assignedAgentId');
    if assigned_agent_id = 'shared'
      or assigned_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
    then
      raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode = '22023';
    end if;
    update public.observatory_work_items
    set assigned_agent_id = assigned_agent_id,
      version = current_item.version + 1
    where id = current_item.id and version = current_item.version
    returning * into strict updated_item;
    event_type := 'updated';
    event_data := jsonb_build_object(
      'before', jsonb_build_object(
        'assigned_agent_id', current_item.assigned_agent_id,
        'version', current_item.version
      ),
      'after', jsonb_build_object(
        'assigned_agent_id', updated_item.assigned_agent_id,
        'version', updated_item.version
      )
    );
  else
    if p_payload - array['label', 'url'] <> '{}'::jsonb
      or length(btrim(p_payload ->> 'label')) not between 1 and 200
      or length(btrim(p_payload ->> 'url')) not between 1 and 2048
      or btrim(p_payload ->> 'url') !~* '^https?://[^[:space:]]+$'
    then
      raise exception 'OBSERVATORY_AGENT_EVIDENCE_BOUNDARY_INVALID' using errcode = '22023';
    end if;
    insert into public.observatory_work_item_evidence (
      work_item_id, label, url, created_by, created_by_agent
    ) values (
      current_item.id, btrim(p_payload ->> 'label'),
      btrim(p_payload ->> 'url'), null, normalized_agent_id
    ) returning * into strict created_evidence;
    update public.observatory_work_items
    set version = current_item.version + 1
    where id = current_item.id and version = current_item.version
    returning * into strict updated_item;
    event_type := 'evidence_added';
    event_data := jsonb_build_object(
      'evidence_id', created_evidence.id,
      'label', created_evidence.label,
      'url', created_evidence.url,
      'before_version', current_item.version,
      'after_version', updated_item.version
    );
  end if;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_item.id, event_type, null, normalized_agent_id, event_data
  );

  operation_result := jsonb_build_object(
    'workItem', to_jsonb(updated_item),
    'evidence', case
      when created_evidence.id is null then null
      else to_jsonb(created_evidence)
    end
  );
  insert into public.observatory_agent_work_item_operations (
    agent_id, idempotency_key, action, request_fingerprint,
    work_item_id, result
  ) values (
    normalized_agent_id, normalized_idempotency_key, normalized_action,
    p_request_fingerprint, updated_item.id, operation_result
  );
  return operation_result;
end;
$$;

revoke all privileges on function public.execute_observatory_agent_work_item_command(
  text, boolean, text, uuid, integer, text, jsonb, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.execute_observatory_agent_work_item_command(
  text, boolean, text, uuid, integer, text, jsonb, text, text
) to service_role;

commit;
