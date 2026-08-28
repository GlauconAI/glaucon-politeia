begin;

alter table public.observatory_work_items
  add column assigned_agent_id text;

update public.observatory_work_items
set assigned_agent_id = case
  when project_ref ~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
    then split_part(project_ref, '/', 1)
  else 'plato'
end
where assigned_agent_id is null;

alter table public.observatory_work_items
  alter column assigned_agent_id set not null,
  add constraint observatory_work_items_assigned_agent_id_check check (
    assigned_agent_id ~ '^[a-z][a-z0-9-]{0,79}$'
  );

create or replace function public.create_observatory_work_item(
  p_type text,
  p_title text,
  p_description text,
  p_project_ref text,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  normalized_type text := btrim(p_type);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_project_ref text := btrim(p_project_ref);
  normalized_assigned_agent_id text;
  normalized_state text := 'inbox';
  normalized_idempotency_key text := btrim(p_idempotency_key);
  created_item public.observatory_work_items;
  existing_item public.observatory_work_items;
begin
  calling_user := auth.uid();

  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if normalized_project_ref is null
    or length(normalized_project_ref) not between 1 and 160
    or normalized_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'OBSERVATORY_PROJECT_REQUIRED' using errcode = '22023';
  end if;

  normalized_assigned_agent_id := split_part(normalized_project_ref, '/', 1);

  insert into public.observatory_work_items (
    type,
    title,
    description,
    state,
    project_ref,
    assigned_agent_id,
    idempotency_key,
    created_by
  )
  values (
    normalized_type,
    normalized_title,
    normalized_description,
    normalized_state,
    normalized_project_ref,
    normalized_assigned_agent_id,
    normalized_idempotency_key,
    calling_user
  )
  on conflict (created_by, idempotency_key) do nothing
  returning * into created_item;

  if created_item.id is null then
    select *
    into strict existing_item
    from public.observatory_work_items
    where created_by = calling_user
      and idempotency_key = normalized_idempotency_key;

    if existing_item.type is distinct from normalized_type
      or existing_item.title is distinct from normalized_title
      or existing_item.description is distinct from normalized_description
      or existing_item.project_ref is distinct from normalized_project_ref
      or existing_item.assigned_agent_id is distinct from normalized_assigned_agent_id
      or existing_item.state is distinct from normalized_state
    then
      raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT'
        using errcode = '23505';
    end if;

    return existing_item;
  end if;

  insert into public.observatory_work_item_events (
    work_item_id,
    event_type,
    actor_id,
    data
  )
  values (
    created_item.id,
    'created',
    calling_user,
    jsonb_build_object(
      'type', created_item.type,
      'state', created_item.state,
      'title', created_item.title,
      'project_ref', created_item.project_ref,
      'assigned_agent_id', created_item.assigned_agent_id
    )
  );

  return created_item;
end;
$$;

revoke all privileges on function public.create_observatory_work_item(text, text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(text, text, text, text, text)
to authenticated;

revoke all privileges on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, integer, text, text
) from public, anon, authenticated, service_role;
drop function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, integer, text, text
);

create function public.update_observatory_work_item(
  p_work_item_id uuid,
  p_expected_version integer,
  p_type text,
  p_title text,
  p_description text,
  p_acceptance_criteria text,
  p_priority text,
  p_owner_id uuid,
  p_assigned_agent_id text,
  p_project_ref text,
  p_milestone_ref text,
  p_project_key text,
  p_plan_revision integer,
  p_stage_id text,
  p_work_package_id text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  normalized_type text := btrim(p_type);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_acceptance_criteria text := btrim(coalesce(p_acceptance_criteria, ''));
  normalized_priority text := nullif(btrim(coalesce(p_priority, '')), '');
  normalized_assigned_agent_id text := btrim(coalesce(p_assigned_agent_id, ''));
  normalized_project_ref text := nullif(btrim(coalesce(p_project_ref, '')), '');
  normalized_milestone_ref text := nullif(btrim(coalesce(p_milestone_ref, '')), '');
  normalized_project_key text := nullif(btrim(coalesce(p_project_key, '')), '');
  normalized_stage_id text := nullif(btrim(coalesce(p_stage_id, '')), '');
  normalized_work_package_id text := nullif(btrim(coalesce(p_work_package_id, '')), '');
  binding_count integer;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
begin
  calling_user := auth.uid();

  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if normalized_assigned_agent_id !~ '^[a-z][a-z0-9-]{0,79}$' then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode = '22023';
  end if;

  select * into current_item
  from public.observatory_work_items
  where id = p_work_item_id
  for update;

  if current_item.id is null then
    raise exception 'OBSERVATORY_WORK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  binding_count :=
    (normalized_project_key is not null)::integer
    + (p_plan_revision is not null)::integer
    + (normalized_stage_id is not null)::integer
    + (normalized_work_package_id is not null)::integer;
  if binding_count not in (0, 4) then
    raise exception 'OBSERVATORY_PROJECT_CONTROL_BINDING_INVALID' using errcode = '22023';
  end if;

  update public.observatory_work_items
  set type = normalized_type,
    title = normalized_title,
    description = normalized_description,
    acceptance_criteria = normalized_acceptance_criteria,
    priority = normalized_priority,
    owner_id = p_owner_id,
    assigned_agent_id = normalized_assigned_agent_id,
    project_ref = normalized_project_ref,
    milestone_ref = normalized_milestone_ref,
    project_key = normalized_project_key,
    plan_revision = p_plan_revision,
    stage_id = normalized_stage_id,
    work_package_id = normalized_work_package_id,
    version = current_item.version + 1
  where id = current_item.id and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
  ) values (
    updated_item.id,
    'updated',
    calling_user,
    jsonb_build_object(
      'before', jsonb_build_object(
        'type', current_item.type,
        'title', current_item.title,
        'description', current_item.description,
        'acceptance_criteria', current_item.acceptance_criteria,
        'priority', current_item.priority,
        'owner_id', current_item.owner_id,
        'assigned_agent_id', current_item.assigned_agent_id,
        'project_ref', current_item.project_ref,
        'milestone_ref', current_item.milestone_ref,
        'project_key', current_item.project_key,
        'plan_revision', current_item.plan_revision,
        'stage_id', current_item.stage_id,
        'work_package_id', current_item.work_package_id,
        'state', current_item.state,
        'version', current_item.version
      ),
      'after', jsonb_build_object(
        'type', updated_item.type,
        'title', updated_item.title,
        'description', updated_item.description,
        'acceptance_criteria', updated_item.acceptance_criteria,
        'priority', updated_item.priority,
        'owner_id', updated_item.owner_id,
        'assigned_agent_id', updated_item.assigned_agent_id,
        'project_ref', updated_item.project_ref,
        'milestone_ref', updated_item.milestone_ref,
        'project_key', updated_item.project_key,
        'plan_revision', updated_item.plan_revision,
        'stage_id', updated_item.stage_id,
        'work_package_id', updated_item.work_package_id,
        'state', updated_item.state,
        'version', updated_item.version
      )
    )
  );

  return updated_item;
end;
$$;

revoke all privileges on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, text, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, text, integer, text, text
) to authenticated;

commit;
