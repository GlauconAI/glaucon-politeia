create or replace function public.observatory_authorized_paths_valid(
  paths text[]
)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  path text;
begin
  if cardinality(paths) < 1 or cardinality(paths) > 16 then
    return false;
  end if;
  foreach path in array paths loop
    if path is null
      or length(path) < 1
      or length(path) > 240
      or btrim(path) <> path
      or path like '/%'
      or path like '%\%'
      or path like '%//%'
      or path like '%/'
      or path ~ '(^|/)\.{1,2}(/|$)'
    then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all privileges on function public.observatory_authorized_paths_valid(text[])
from public, anon, authenticated, service_role;

alter table public.observatory_work_items
  add column risk_level text not null default 'unclassified',
  add column agent_claim_enabled boolean not null default false,
  add column authorized_paths text[] not null default '{}',
  add column allowed_action_classes text[] not null default '{}',
  add column claim_approved_by uuid references public.profiles(user_id) on delete restrict,
  add column claim_approved_at timestamptz,
  add constraint observatory_work_items_risk_level_check check (
    risk_level in ('unclassified', 'low', 'high')
  ),
  add constraint observatory_work_items_authorized_paths_check check (
    (
      agent_claim_enabled = false
      and cardinality(authorized_paths) between 0 and 16
    )
    or public.observatory_authorized_paths_valid(authorized_paths)
  ),
  add constraint observatory_work_items_action_classes_check check (
    allowed_action_classes <@ array['code_edit', 'test', 'documentation']::text[]
    and cardinality(allowed_action_classes) between 0 and 3
  ),
  add constraint observatory_work_items_claim_approval_check check (
    (
      agent_claim_enabled = false
      and claim_approved_by is null
      and claim_approved_at is null
    )
    or (
      agent_claim_enabled = true
      and risk_level = 'low'
      and type in ('feature', 'bug')
      and cardinality(authorized_paths) between 1 and 16
      and cardinality(allowed_action_classes) between 1 and 3
      and claim_approved_by is not null
      and claim_approved_at is not null
    )
  );

alter table public.observatory_work_item_events
  alter column actor_id drop not null,
  add column agent_id text,
  drop constraint observatory_work_item_events_event_type_check,
  add constraint observatory_work_item_events_agent_id_check check (
    agent_id is null
    or (
      length(agent_id) between 1 and 80
      and agent_id ~ '^[a-z][a-z0-9-]*$'
    )
  ),
  add constraint observatory_work_item_events_principal_check check (
    num_nonnulls(actor_id, agent_id) = 1
  ),
  add constraint observatory_work_item_events_event_type_check check (
    event_type in (
      'created', 'updated', 'state_transitioned',
      'evidence_added', 'evidence_removed',
      'claim_policy_updated', 'claim_started', 'claim_renewed',
      'claim_released', 'claim_expired', 'claim_completed', 'claim_cancelled'
    )
  );

alter table public.observatory_work_item_evidence
  alter column created_by drop not null,
  add column created_by_agent text,
  add constraint observatory_work_item_evidence_agent_id_check check (
    created_by_agent is null
    or (
      length(created_by_agent) between 1 and 80
      and created_by_agent ~ '^[a-z][a-z0-9-]*$'
    )
  ),
  add constraint observatory_work_item_evidence_principal_check check (
    num_nonnulls(created_by, created_by_agent) = 1
  );

create table public.observatory_work_item_claims (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.observatory_work_items(id) on delete restrict,
  agent_id text not null check (
    length(agent_id) between 1 and 80
    and agent_id ~ '^[a-z][a-z0-9-]*$'
  ),
  idempotency_key text not null check (
    length(idempotency_key) between 1 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  request_fingerprint text not null check (length(request_fingerprint) between 1 and 200),
  status text not null default 'active' check (
    status in ('active', 'completed', 'released', 'expired', 'cancelled')
  ),
  claim_version integer not null default 1 check (claim_version > 0),
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  ended_at timestamptz,
  completion_summary text check (
    completion_summary is null or length(completion_summary) between 1 and 2000
  ),
  result_evidence_url text check (
    result_evidence_url is null
    or (
      length(result_evidence_url) between 1 and 2048
      and result_evidence_url ~* '^https?://[^[:space:]]+$'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, idempotency_key),
  check (
    (status = 'active' and ended_at is null)
    or (status <> 'active' and ended_at is not null)
  )
);

create unique index observatory_work_item_claims_one_active_idx
on public.observatory_work_item_claims(work_item_id)
where status = 'active';

create index observatory_work_item_claims_item_created_idx
on public.observatory_work_item_claims(work_item_id, created_at asc);

create index observatory_work_item_claims_expiry_idx
on public.observatory_work_item_claims(lease_expires_at asc)
where status = 'active';

alter table public.observatory_work_item_claims enable row level security;

revoke all privileges on table public.observatory_work_item_claims
from public, anon, authenticated, service_role;
grant select on table public.observatory_work_item_claims to authenticated;

create policy observatory_work_item_claims_select_admin
on public.observatory_work_item_claims for select
to authenticated
using (public.is_current_user_admin());

create or replace function public.prevent_observatory_active_claim_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if coalesce(current_setting('app.observatory_claim_mutation', true), '') <> 'claim_rpc'
    and exists (
      select 1
      from public.observatory_work_item_claims
      where work_item_id = old.id
        and status = 'active'
    )
  then
    raise exception 'OBSERVATORY_CLAIM_ACTIVE' using errcode = '55006';
  end if;
  return new;
end;
$$;

create trigger observatory_work_items_active_claim_guard
before update on public.observatory_work_items
for each row execute function public.prevent_observatory_active_claim_mutation();

revoke all privileges on function public.prevent_observatory_active_claim_mutation()
from public, anon, authenticated, service_role;

create or replace function public.configure_observatory_agent_claim_policy(
  p_work_item_id uuid,
  p_expected_version integer,
  p_risk_level text,
  p_enabled boolean,
  p_authorized_paths text[],
  p_allowed_action_classes text[]
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  normalized_risk text := btrim(p_risk_level);
  normalized_paths text[] := coalesce(p_authorized_paths, '{}');
  normalized_actions text[] := coalesce(p_allowed_action_classes, '{}');
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
begin
  calling_user := auth.uid();
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select * into current_item
  from public.observatory_work_items
  where id = p_work_item_id
  for update;

  if current_item.id is null then
    raise exception 'OBSERVATORY_WORK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.observatory_work_item_claims
    where work_item_id = current_item.id and status = 'active'
  ) then
    raise exception 'OBSERVATORY_CLAIM_ACTIVE' using errcode = '55006';
  end if;
  if normalized_risk not in ('unclassified', 'low', 'high') then
    raise exception 'OBSERVATORY_CLAIM_POLICY_INVALID' using errcode = '22023';
  end if;
  if not normalized_actions <@ array['code_edit', 'test', 'documentation']::text[]
    or cardinality(normalized_actions) > 3
  then
    raise exception 'OBSERVATORY_CLAIM_POLICY_INVALID' using errcode = '22023';
  end if;
  if p_enabled and (
    current_item.type not in ('feature', 'bug')
    or normalized_risk <> 'low'
    or not public.observatory_authorized_paths_valid(normalized_paths)
    or cardinality(normalized_actions) < 1
  ) then
    raise exception 'OBSERVATORY_CLAIM_POLICY_INVALID' using errcode = '23514';
  end if;

  update public.observatory_work_items
  set risk_level = normalized_risk,
    agent_claim_enabled = p_enabled,
    authorized_paths = normalized_paths,
    allowed_action_classes = normalized_actions,
    claim_approved_by = case when p_enabled then calling_user else null end,
    claim_approved_at = case when p_enabled then now() else null end,
    version = current_item.version + 1
  where id = current_item.id and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_item.id, 'claim_policy_updated', calling_user, null,
    jsonb_build_object(
      'before_version', current_item.version,
      'after_version', updated_item.version,
      'before', jsonb_build_object(
        'risk_level', current_item.risk_level,
        'enabled', current_item.agent_claim_enabled,
        'authorized_paths', current_item.authorized_paths,
        'allowed_action_classes', current_item.allowed_action_classes
      ),
      'after', jsonb_build_object(
        'risk_level', updated_item.risk_level,
        'enabled', updated_item.agent_claim_enabled,
        'authorized_paths', updated_item.authorized_paths,
        'allowed_action_classes', updated_item.allowed_action_classes
      )
    )
  );
  return updated_item;
end;
$$;

revoke all privileges on function public.configure_observatory_agent_claim_policy(
  uuid, integer, text, boolean, text[], text[]
)
from public, anon, authenticated, service_role;
grant execute on function public.configure_observatory_agent_claim_policy(
  uuid, integer, text, boolean, text[], text[]
)
to authenticated;

create or replace function public.sweep_observatory_work_item_claims()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  stale_claim public.observatory_work_item_claims;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  swept integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  for stale_claim in
    select * from public.observatory_work_item_claims
    where status = 'active' and lease_expires_at <= now()
    order by lease_expires_at, id
    for update skip locked
  loop
    select * into current_item
    from public.observatory_work_items
    where id = stale_claim.work_item_id
    for update;

    update public.observatory_work_item_claims
    set status = 'expired',
      claim_version = stale_claim.claim_version + 1,
      ended_at = now(),
      updated_at = now()
    where id = stale_claim.id and claim_version = stale_claim.claim_version;

    insert into public.observatory_work_item_events (
      work_item_id, event_type, actor_id, agent_id, data
    ) values (
      stale_claim.work_item_id, 'claim_expired', null, stale_claim.agent_id,
      jsonb_build_object(
        'claim_id', stale_claim.id,
        'before_claim_version', stale_claim.claim_version,
        'after_claim_version', stale_claim.claim_version + 1
      )
    );

    if current_item.state = 'in_progress' then
      perform set_config('app.observatory_claim_mutation', 'claim_rpc', true);
      update public.observatory_work_items
      set state = 'ready', version = current_item.version + 1
      where id = current_item.id and version = current_item.version
      returning * into strict updated_item;
      insert into public.observatory_work_item_events (
        work_item_id, event_type, actor_id, agent_id, data
      ) values (
        updated_item.id, 'state_transitioned', null, stale_claim.agent_id,
        jsonb_build_object(
          'from', current_item.state,
          'to', updated_item.state,
          'before_version', current_item.version,
          'after_version', updated_item.version,
          'reason', 'claim_expired'
        )
      );
    end if;
    swept := swept + 1;
  end loop;
  return swept;
end;
$$;

revoke all privileges on function public.sweep_observatory_work_item_claims()
from public, anon, authenticated, service_role;
grant execute on function public.sweep_observatory_work_item_claims()
to service_role;

create or replace function public.claim_observatory_work_item(
  p_agent_id text,
  p_idempotency_key text,
  p_work_item_id uuid,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_agent text := btrim(p_agent_id);
  normalized_key text := btrim(p_idempotency_key);
  fingerprint text := coalesce(p_work_item_id::text, '*') || ':' || p_lease_seconds::text;
  existing_claim public.observatory_work_item_claims;
  selected_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  created_claim public.observatory_work_item_claims;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if normalized_agent !~ '^[a-z][a-z0-9-]{0,79}$'
    or normalized_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or not (p_lease_seconds between 300 and 3600)
  then
    raise exception 'OBSERVATORY_CLAIM_BOUNDARY_INVALID' using errcode = '22023';
  end if;

  perform public.sweep_observatory_work_item_claims();

  select * into existing_claim
  from public.observatory_work_item_claims
  where agent_id = normalized_agent and idempotency_key = normalized_key;
  if existing_claim.id is not null then
    if existing_claim.request_fingerprint <> fingerprint then
      raise exception 'OBSERVATORY_CLAIM_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    select * into selected_item
    from public.observatory_work_items
    where id = existing_claim.work_item_id;
    return jsonb_build_object(
      'claim', to_jsonb(existing_claim),
      'work_item', to_jsonb(selected_item)
    );
  end if;

  select item.* into selected_item
  from public.observatory_work_items item
  where (p_work_item_id is null or item.id = p_work_item_id)
    and item.type in ('feature', 'bug')
    and item.state = 'ready'
    and item.acceptance_criteria <> ''
    and item.priority is not null
    and item.owner_id is not null
    and item.risk_level = 'low'
    and item.agent_claim_enabled = true
    and cardinality(item.authorized_paths) between 1 and 16
    and cardinality(item.allowed_action_classes) between 1 and 3
    and not exists (
      select 1 from public.observatory_work_item_claims active_claim
      where active_claim.work_item_id = item.id
        and active_claim.status = 'active'
    )
  order by
    case item.priority
      when 'urgent' then 1
      when 'high' then 2
      when 'medium' then 3
      else 4
    end,
    item.updated_at,
    item.id
  for update skip locked
  limit 1;

  if selected_item.id is null then
    raise exception 'OBSERVATORY_CLAIM_NOT_ELIGIBLE' using errcode = 'P0002';
  end if;

  insert into public.observatory_work_item_claims (
    work_item_id, agent_id, idempotency_key, request_fingerprint,
    lease_expires_at
  ) values (
    selected_item.id, normalized_agent, normalized_key, fingerprint,
    now() + make_interval(secs => p_lease_seconds)
  )
  returning * into strict created_claim;

  perform set_config('app.observatory_claim_mutation', 'claim_rpc', true);
  update public.observatory_work_items
  set state = 'in_progress', version = selected_item.version + 1
  where id = selected_item.id and version = selected_item.version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_item.id, 'claim_started', null, normalized_agent,
    jsonb_build_object(
      'claim_id', created_claim.id,
      'claim_version', created_claim.claim_version,
      'lease_expires_at', created_claim.lease_expires_at,
      'work_item_version', updated_item.version,
      'authorized_paths', updated_item.authorized_paths,
      'allowed_action_classes', updated_item.allowed_action_classes
    )
  ), (
    updated_item.id, 'state_transitioned', null, normalized_agent,
    jsonb_build_object(
      'from', selected_item.state,
      'to', updated_item.state,
      'before_version', selected_item.version,
      'after_version', updated_item.version,
      'reason', 'claim_started'
    )
  );

  return jsonb_build_object(
    'claim', to_jsonb(created_claim),
    'work_item', to_jsonb(updated_item)
  );
end;
$$;

revoke all privileges on function public.claim_observatory_work_item(
  text, text, uuid, integer
)
from public, anon, authenticated, service_role;
grant execute on function public.claim_observatory_work_item(
  text, text, uuid, integer
)
to service_role;

create or replace function public.renew_observatory_work_item_claim(
  p_claim_id uuid,
  p_agent_id text,
  p_expected_claim_version integer,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_claim public.observatory_work_item_claims;
  updated_claim public.observatory_work_item_claims;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if not (p_lease_seconds between 300 and 3600) then
    raise exception 'OBSERVATORY_CLAIM_BOUNDARY_INVALID' using errcode = '22023';
  end if;
  select * into current_claim
  from public.observatory_work_item_claims
  where id = p_claim_id
  for update;
  if current_claim.id is null then
    raise exception 'OBSERVATORY_CLAIM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_claim.agent_id <> p_agent_id then
    raise exception 'OBSERVATORY_CLAIM_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if current_claim.claim_version <> p_expected_claim_version then
    raise exception 'OBSERVATORY_CLAIM_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if current_claim.status <> 'active' or current_claim.lease_expires_at <= now() then
    raise exception 'OBSERVATORY_CLAIM_EXPIRED' using errcode = '55000';
  end if;

  update public.observatory_work_item_claims
  set claim_version = current_claim.claim_version + 1,
    last_heartbeat_at = now(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where id = current_claim.id and claim_version = current_claim.claim_version
  returning * into strict updated_claim;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_claim.work_item_id, 'claim_renewed', null, updated_claim.agent_id,
    jsonb_build_object(
      'claim_id', updated_claim.id,
      'before_claim_version', current_claim.claim_version,
      'after_claim_version', updated_claim.claim_version,
      'lease_expires_at', updated_claim.lease_expires_at
    )
  );
  return to_jsonb(updated_claim);
end;
$$;

revoke all privileges on function public.renew_observatory_work_item_claim(
  uuid, text, integer, integer
)
from public, anon, authenticated, service_role;
grant execute on function public.renew_observatory_work_item_claim(
  uuid, text, integer, integer
)
to service_role;

create or replace function public.release_observatory_work_item_claim(
  p_claim_id uuid,
  p_agent_id text,
  p_expected_claim_version integer,
  p_expected_work_item_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_claim public.observatory_work_item_claims;
  updated_claim public.observatory_work_item_claims;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into current_claim from public.observatory_work_item_claims
  where id = p_claim_id for update;
  if current_claim.id is null then
    raise exception 'OBSERVATORY_CLAIM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_claim.agent_id <> p_agent_id then
    raise exception 'OBSERVATORY_CLAIM_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if current_claim.claim_version <> p_expected_claim_version then
    raise exception 'OBSERVATORY_CLAIM_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if current_claim.status <> 'active' or current_claim.lease_expires_at <= now() then
    raise exception 'OBSERVATORY_CLAIM_EXPIRED' using errcode = '55000';
  end if;
  select * into current_item from public.observatory_work_items
  where id = current_claim.work_item_id for update;
  if current_item.version <> p_expected_work_item_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  update public.observatory_work_item_claims
  set status = 'released',
    claim_version = current_claim.claim_version + 1,
    ended_at = now(),
    updated_at = now()
  where id = current_claim.id and claim_version = current_claim.claim_version
  returning * into strict updated_claim;

  perform set_config('app.observatory_claim_mutation', 'claim_rpc', true);
  update public.observatory_work_items
  set state = 'ready', version = current_item.version + 1
  where id = current_item.id
    and version = current_item.version
    and state = 'in_progress'
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_item.id, 'claim_released', null, updated_claim.agent_id,
    jsonb_build_object(
      'claim_id', updated_claim.id,
      'before_claim_version', current_claim.claim_version,
      'after_claim_version', updated_claim.claim_version
    )
  ), (
    updated_item.id, 'state_transitioned', null, updated_claim.agent_id,
    jsonb_build_object(
      'from', current_item.state,
      'to', updated_item.state,
      'before_version', current_item.version,
      'after_version', updated_item.version,
      'reason', 'claim_released'
    )
  );
  return jsonb_build_object(
    'claim', to_jsonb(updated_claim),
    'work_item', to_jsonb(updated_item)
  );
end;
$$;

revoke all privileges on function public.release_observatory_work_item_claim(
  uuid, text, integer, integer
)
from public, anon, authenticated, service_role;
grant execute on function public.release_observatory_work_item_claim(
  uuid, text, integer, integer
)
to service_role;

create or replace function public.complete_observatory_work_item_claim(
  p_claim_id uuid,
  p_agent_id text,
  p_expected_claim_version integer,
  p_expected_work_item_version integer,
  p_summary text,
  p_evidence_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_summary text := btrim(p_summary);
  normalized_url text := btrim(p_evidence_url);
  current_claim public.observatory_work_item_claims;
  updated_claim public.observatory_work_item_claims;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  created_evidence public.observatory_work_item_evidence;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if length(normalized_summary) not between 1 and 2000
    or length(normalized_url) not between 1 and 2048
    or normalized_url !~* '^https?://[^[:space:]]+$'
  then
    raise exception 'OBSERVATORY_CLAIM_BOUNDARY_INVALID' using errcode = '22023';
  end if;
  select * into current_claim from public.observatory_work_item_claims
  where id = p_claim_id for update;
  if current_claim.id is null then
    raise exception 'OBSERVATORY_CLAIM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_claim.agent_id <> p_agent_id then
    raise exception 'OBSERVATORY_CLAIM_OWNER_MISMATCH' using errcode = '42501';
  end if;
  if current_claim.claim_version <> p_expected_claim_version then
    raise exception 'OBSERVATORY_CLAIM_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if current_claim.status <> 'active' or current_claim.lease_expires_at <= now() then
    raise exception 'OBSERVATORY_CLAIM_EXPIRED' using errcode = '55000';
  end if;
  select * into current_item from public.observatory_work_items
  where id = current_claim.work_item_id for update;
  if current_item.version <> p_expected_work_item_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  update public.observatory_work_item_claims
  set status = 'completed',
    claim_version = current_claim.claim_version + 1,
    ended_at = now(),
    completion_summary = normalized_summary,
    result_evidence_url = normalized_url,
    updated_at = now()
  where id = current_claim.id and claim_version = current_claim.claim_version
  returning * into strict updated_claim;

  insert into public.observatory_work_item_evidence (
    work_item_id, label, url, created_by, created_by_agent
  ) values (
    current_item.id,
    'Agent completion: ' || current_claim.agent_id,
    normalized_url,
    null,
    current_claim.agent_id
  ) returning * into strict created_evidence;

  perform set_config('app.observatory_claim_mutation', 'claim_rpc', true);
  update public.observatory_work_items
  set state = 'review', version = current_item.version + 1
  where id = current_item.id
    and version = current_item.version
    and state = 'in_progress'
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_item.id, 'claim_completed', null, updated_claim.agent_id,
    jsonb_build_object(
      'claim_id', updated_claim.id,
      'before_claim_version', current_claim.claim_version,
      'after_claim_version', updated_claim.claim_version,
      'summary', normalized_summary
    )
  ), (
    updated_item.id, 'evidence_added', null, updated_claim.agent_id,
    jsonb_build_object(
      'evidence_id', created_evidence.id,
      'label', created_evidence.label,
      'url', created_evidence.url,
      'before_version', current_item.version,
      'after_version', updated_item.version
    )
  ), (
    updated_item.id, 'state_transitioned', null, updated_claim.agent_id,
    jsonb_build_object(
      'from', current_item.state,
      'to', updated_item.state,
      'before_version', current_item.version,
      'after_version', updated_item.version,
      'reason', 'claim_completed'
    )
  );
  return jsonb_build_object(
    'claim', to_jsonb(updated_claim),
    'work_item', to_jsonb(updated_item),
    'evidence', to_jsonb(created_evidence)
  );
end;
$$;

revoke all privileges on function public.complete_observatory_work_item_claim(
  uuid, text, integer, integer, text, text
)
from public, anon, authenticated, service_role;
grant execute on function public.complete_observatory_work_item_claim(
  uuid, text, integer, integer, text, text
)
to service_role;

create or replace function public.cancel_observatory_work_item_claim(
  p_claim_id uuid,
  p_expected_claim_version integer,
  p_expected_work_item_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  current_claim public.observatory_work_item_claims;
  updated_claim public.observatory_work_item_claims;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
begin
  calling_user := auth.uid();
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into current_claim from public.observatory_work_item_claims
  where id = p_claim_id for update;
  if current_claim.id is null then
    raise exception 'OBSERVATORY_CLAIM_NOT_FOUND' using errcode = 'P0002';
  end if;
  if current_claim.claim_version <> p_expected_claim_version then
    raise exception 'OBSERVATORY_CLAIM_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if current_claim.status <> 'active' then
    raise exception 'OBSERVATORY_CLAIM_EXPIRED' using errcode = '55000';
  end if;
  select * into current_item from public.observatory_work_items
  where id = current_claim.work_item_id for update;
  if current_item.version <> p_expected_work_item_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  update public.observatory_work_item_claims
  set status = 'cancelled',
    claim_version = current_claim.claim_version + 1,
    ended_at = now(),
    updated_at = now()
  where id = current_claim.id and claim_version = current_claim.claim_version
  returning * into strict updated_claim;

  perform set_config('app.observatory_claim_mutation', 'claim_rpc', true);
  update public.observatory_work_items
  set state = 'ready', version = current_item.version + 1
  where id = current_item.id
    and version = current_item.version
    and state = 'in_progress'
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, agent_id, data
  ) values (
    updated_item.id, 'claim_cancelled', calling_user, null,
    jsonb_build_object(
      'claim_id', updated_claim.id,
      'agent_id', updated_claim.agent_id,
      'before_claim_version', current_claim.claim_version,
      'after_claim_version', updated_claim.claim_version
    )
  ), (
    updated_item.id, 'state_transitioned', calling_user, null,
    jsonb_build_object(
      'from', current_item.state,
      'to', updated_item.state,
      'before_version', current_item.version,
      'after_version', updated_item.version,
      'reason', 'claim_cancelled'
    )
  );
  return jsonb_build_object(
    'claim', to_jsonb(updated_claim),
    'work_item', to_jsonb(updated_item)
  );
end;
$$;

revoke all privileges on function public.cancel_observatory_work_item_claim(
  uuid, integer, integer
)
from public, anon, authenticated, service_role;
grant execute on function public.cancel_observatory_work_item_claim(
  uuid, integer, integer
)
to authenticated;
