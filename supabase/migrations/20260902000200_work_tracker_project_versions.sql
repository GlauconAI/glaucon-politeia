begin;

create table public.observatory_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_key text not null check (
    length(project_key) between 3 and 160
    and array_length(string_to_array(project_key, '/'), 1) = 2
    and split_part(project_key, '/', 1) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and btrim(split_part(project_key, '/', 2)) <> ''
    and split_part(project_key, '/', 2) not in ('.', '..')
    and position(chr(92) in split_part(project_key, '/', 2)) = 0
    and split_part(project_key, '/', 2) !~ '[[:cntrl:]]'
  ),
  version_label text not null check (length(btrim(version_label)) between 1 and 64),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  status text not null default 'planned' check (
    status in ('planned', 'active', 'released', 'archived')
  ),
  target_date date,
  released_at timestamptz,
  is_backlog boolean not null default false,
  row_version integer not null default 1 check (row_version >= 1),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (status <> 'released' or released_at is not null)
);

create unique index observatory_project_versions_project_label_idx
on public.observatory_project_versions(project_key, lower(version_label));

create unique index observatory_project_versions_one_backlog_idx
on public.observatory_project_versions(project_key)
where is_backlog;

create index observatory_project_versions_project_status_idx
on public.observatory_project_versions(project_key, status, target_date, created_at);

create table public.observatory_project_version_events (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid not null references public.observatory_project_versions(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'updated', 'status_transitioned')),
  actor_id uuid not null references public.profiles(user_id) on delete restrict,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index observatory_project_version_events_version_created_idx
on public.observatory_project_version_events(project_version_id, created_at);

alter table public.observatory_project_versions enable row level security;
alter table public.observatory_project_version_events enable row level security;

revoke all privileges on table public.observatory_project_versions
from public, anon, authenticated, service_role;
revoke all privileges on table public.observatory_project_version_events
from public, anon, authenticated, service_role;

grant select on table public.observatory_project_versions to authenticated;
grant select on table public.observatory_project_version_events to authenticated;

create policy observatory_project_versions_select_admin
on public.observatory_project_versions for select
to authenticated
using (public.is_current_user_admin());

create policy observatory_project_version_events_select_admin
on public.observatory_project_version_events for select
to authenticated
using (public.is_current_user_admin());

alter table public.observatory_work_items
  disable trigger observatory_work_items_set_updated_at;

update public.observatory_work_items
set project_ref = 'plato/dashboard'
where project_key is null and btrim(project_ref) = 'Dashboard';

insert into public.observatory_project_versions (
  project_key,
  version_label,
  title,
  description,
  status,
  is_backlog,
  created_by,
  updated_by
)
select distinct
  coalesce(item.project_key, item.project_ref),
  'Backlog',
  '待规划',
  '系统保留版本，用于承接版本体系上线前创建的 Work Items。',
  'planned',
  true,
  item.created_by,
  item.created_by
from public.observatory_work_items item
where length(coalesce(item.project_key, item.project_ref)) between 3 and 160
  and array_length(string_to_array(coalesce(item.project_key, item.project_ref), '/'), 1) = 2
  and split_part(coalesce(item.project_key, item.project_ref), '/', 1) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and btrim(split_part(coalesce(item.project_key, item.project_ref), '/', 2)) <> ''
  and split_part(coalesce(item.project_key, item.project_ref), '/', 2) not in ('.', '..')
  and position(chr(92) in split_part(coalesce(item.project_key, item.project_ref), '/', 2)) = 0
  and split_part(coalesce(item.project_key, item.project_ref), '/', 2) !~ '[[:cntrl:]]'
on conflict do nothing;

insert into public.observatory_project_version_events (
  project_version_id,
  event_type,
  actor_id,
  data
)
select
  version.id,
  'created',
  version.created_by,
  jsonb_build_object('reason', 'work-tracker-project-version-backfill')
from public.observatory_project_versions version
where version.is_backlog;

alter table public.observatory_work_items
  add column project_version_id uuid references public.observatory_project_versions(id) on delete restrict;

update public.observatory_work_items item
set project_version_id = version.id
from public.observatory_project_versions version
where version.project_key = coalesce(item.project_key, item.project_ref)
  and version.is_backlog
  and item.project_version_id is null;

alter table public.observatory_work_items
  enable trigger observatory_work_items_set_updated_at;

create or replace function public.validate_observatory_work_item_project_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  version_project_key text;
  version_status text;
  item_project_key text := coalesce(new.project_key, new.project_ref);
begin
  select project_key, status into version_project_key, version_status
  from public.observatory_project_versions
  where id = new.project_version_id;
  if version_project_key is null then
    raise exception 'OBSERVATORY_PROJECT_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if item_project_key is null or version_project_key <> item_project_key then
    raise exception 'OBSERVATORY_PROJECT_VERSION_MISMATCH' using errcode = '22023';
  end if;
  if version_status = 'archived' then
    raise exception 'OBSERVATORY_PROJECT_VERSION_ARCHIVED' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger observatory_work_items_validate_project_version
before insert or update of project_ref, project_key, project_version_id
on public.observatory_work_items
for each row execute function public.validate_observatory_work_item_project_version();

create index observatory_work_items_project_version_idx
on public.observatory_work_items(project_version_id);

create or replace function public.create_observatory_project_version(
  p_project_key text,
  p_version_label text,
  p_title text,
  p_description text,
  p_target_date date
)
returns public.observatory_project_versions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  normalized_project_key text := btrim(p_project_key);
  normalized_version_label text := btrim(p_version_label);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  created_version public.observatory_project_versions;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not (
    length(normalized_project_key) between 3 and 160
    and array_length(string_to_array(normalized_project_key, '/'), 1) = 2
    and split_part(normalized_project_key, '/', 1) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and btrim(split_part(normalized_project_key, '/', 2)) <> ''
    and split_part(normalized_project_key, '/', 2) not in ('.', '..')
    and position(chr(92) in split_part(normalized_project_key, '/', 2)) = 0
    and split_part(normalized_project_key, '/', 2) !~ '[[:cntrl:]]'
  ) then
    raise exception 'OBSERVATORY_PROJECT_REQUIRED' using errcode = '22023';
  end if;
  if length(normalized_version_label) not between 1 and 64
    or length(normalized_title) not between 1 and 200
    or length(normalized_description) > 4000
  then
    raise exception 'OBSERVATORY_PROJECT_VERSION_INVALID' using errcode = '22023';
  end if;

  insert into public.observatory_project_versions (
    project_key, version_label, title, description, target_date, created_by, updated_by
  ) values (
    normalized_project_key, normalized_version_label, normalized_title,
    normalized_description, p_target_date, calling_user, calling_user
  ) returning * into created_version;

  insert into public.observatory_project_version_events (
    project_version_id, event_type, actor_id, data
  ) values (
    created_version.id, 'created', calling_user,
    jsonb_build_object('after', to_jsonb(created_version))
  );
  return created_version;
exception
  when unique_violation then
    raise exception 'OBSERVATORY_PROJECT_VERSION_DUPLICATE' using errcode = '23505';
end;
$$;

create or replace function public.ensure_observatory_project_backlog_versions(
  p_project_keys text[]
)
returns setof public.observatory_project_versions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  invalid_key text;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select project_key into invalid_key
  from unnest(coalesce(p_project_keys, array[]::text[])) project_key
  where not (
    length(project_key) between 3 and 160
    and array_length(string_to_array(project_key, '/'), 1) = 2
    and split_part(project_key, '/', 1) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and btrim(split_part(project_key, '/', 2)) <> ''
    and split_part(project_key, '/', 2) not in ('.', '..')
    and position(chr(92) in split_part(project_key, '/', 2)) = 0
    and split_part(project_key, '/', 2) !~ '[[:cntrl:]]'
  )
  limit 1;
  if invalid_key is not null then
    raise exception 'OBSERVATORY_PROJECT_REQUIRED' using errcode = '22023';
  end if;

  with inserted as (
    insert into public.observatory_project_versions (
      project_key, version_label, title, description, status, is_backlog,
      created_by, updated_by
    )
    select distinct
      project_key, 'Backlog', '待规划',
      '系统保留版本，用于承接尚未归入正式版本的 Work Items。',
      'planned', true, calling_user, calling_user
    from unnest(coalesce(p_project_keys, array[]::text[])) project_key
    on conflict do nothing
    returning *
  )
  insert into public.observatory_project_version_events (
    project_version_id, event_type, actor_id, data
  )
  select id, 'created', calling_user,
    jsonb_build_object('reason', 'work-tracker-project-version-canonical-sync')
  from inserted;

  return query
  select version.*
  from public.observatory_project_versions version
  where version.project_key = any(coalesce(p_project_keys, array[]::text[]))
  order by version.project_key, version.created_at;
end;
$$;

create or replace function public.update_observatory_project_version(
  p_project_version_id uuid,
  p_expected_version integer,
  p_version_label text,
  p_title text,
  p_description text,
  p_target_date date
)
returns public.observatory_project_versions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  current_version public.observatory_project_versions;
  updated_version public.observatory_project_versions;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into current_version
  from public.observatory_project_versions
  where id = p_project_version_id
  for update;
  if current_version.id is null then
    raise exception 'OBSERVATORY_PROJECT_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_version is null or current_version.row_version <> p_expected_version then
    raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if current_version.is_backlog then
    raise exception 'OBSERVATORY_PROJECT_VERSION_BACKLOG_IMMUTABLE' using errcode = '22023';
  end if;

  update public.observatory_project_versions
  set version_label = btrim(p_version_label),
    title = btrim(p_title),
    description = btrim(coalesce(p_description, '')),
    target_date = p_target_date,
    row_version = current_version.row_version + 1,
    updated_by = calling_user,
    updated_at = now()
  where id = current_version.id and row_version = p_expected_version
  returning * into strict updated_version;

  insert into public.observatory_project_version_events (
    project_version_id, event_type, actor_id, data
  ) values (
    updated_version.id, 'updated', calling_user,
    jsonb_build_object('before', to_jsonb(current_version), 'after', to_jsonb(updated_version))
  );
  return updated_version;
exception
  when unique_violation then
    raise exception 'OBSERVATORY_PROJECT_VERSION_DUPLICATE' using errcode = '23505';
end;
$$;

create or replace function public.transition_observatory_project_version(
  p_project_version_id uuid,
  p_expected_version integer,
  p_target_status text
)
returns public.observatory_project_versions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  target_status text := btrim(p_target_status);
  current_version public.observatory_project_versions;
  updated_version public.observatory_project_versions;
  transition_allowed boolean := false;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select * into current_version
  from public.observatory_project_versions
  where id = p_project_version_id
  for update;
  if current_version.id is null then
    raise exception 'OBSERVATORY_PROJECT_VERSION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_expected_version is null or current_version.row_version <> p_expected_version then
    raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if current_version.is_backlog then
    raise exception 'OBSERVATORY_PROJECT_VERSION_BACKLOG_IMMUTABLE' using errcode = '22023';
  end if;

  transition_allowed :=
    (current_version.status = 'planned' and target_status in ('active', 'archived'))
    or (current_version.status = 'active' and target_status in ('released', 'archived'))
    or (current_version.status = 'released' and target_status = 'archived');
  if not transition_allowed then
    raise exception 'OBSERVATORY_PROJECT_VERSION_TRANSITION_INVALID' using errcode = '22023';
  end if;

  update public.observatory_project_versions
  set status = target_status,
    released_at = case
      when target_status = 'released' then now()
      else current_version.released_at
    end,
    row_version = current_version.row_version + 1,
    updated_by = calling_user,
    updated_at = now()
  where id = current_version.id and row_version = p_expected_version
  returning * into strict updated_version;

  insert into public.observatory_project_version_events (
    project_version_id, event_type, actor_id, data
  ) values (
    updated_version.id, 'status_transitioned', calling_user,
    jsonb_build_object(
      'before_status', current_version.status,
      'after_status', updated_version.status,
      'before_version', current_version.row_version,
      'after_version', updated_version.row_version
    )
  );
  return updated_version;
end;
$$;

revoke all privileges on function public.create_observatory_project_version(text, text, text, text, date)
from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_project_version(text, text, text, text, date)
to authenticated;
revoke all privileges on function public.ensure_observatory_project_backlog_versions(text[])
from public, anon, authenticated, service_role;
grant execute on function public.ensure_observatory_project_backlog_versions(text[])
to authenticated;
revoke all privileges on function public.update_observatory_project_version(uuid, integer, text, text, text, date)
from public, anon, authenticated, service_role;
grant execute on function public.update_observatory_project_version(uuid, integer, text, text, text, date)
to authenticated;
revoke all privileges on function public.transition_observatory_project_version(uuid, integer, text)
from public, anon, authenticated, service_role;
grant execute on function public.transition_observatory_project_version(uuid, integer, text)
to authenticated;

create or replace function public.create_observatory_work_item(
  p_type text,
  p_title text,
  p_description text,
  p_project_ref text,
  p_assigned_agent_id text,
  p_project_version_id uuid,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  normalized_type text := btrim(p_type);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_project_ref text := btrim(p_project_ref);
  normalized_assigned_agent_id text := btrim(coalesce(p_assigned_agent_id, ''));
  normalized_idempotency_key text := btrim(p_idempotency_key);
  selected_version public.observatory_project_versions;
  created_item public.observatory_work_items;
  existing_item public.observatory_work_items;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if not (
    length(normalized_project_ref) between 3 and 160
    and array_length(string_to_array(normalized_project_ref, '/'), 1) = 2
    and split_part(normalized_project_ref, '/', 1) ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and btrim(split_part(normalized_project_ref, '/', 2)) <> ''
    and split_part(normalized_project_ref, '/', 2) not in ('.', '..')
    and position(chr(92) in split_part(normalized_project_ref, '/', 2)) = 0
    and split_part(normalized_project_ref, '/', 2) !~ '[[:cntrl:]]'
  ) then
    raise exception 'OBSERVATORY_PROJECT_REQUIRED' using errcode = '22023';
  end if;
  if normalized_assigned_agent_id = 'shared'
    or normalized_assigned_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
  then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode = '22023';
  end if;
  select * into selected_version
  from public.observatory_project_versions
  where id = p_project_version_id;
  if selected_version.id is null then
    raise exception 'OBSERVATORY_PROJECT_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if selected_version.project_key <> normalized_project_ref then
    raise exception 'OBSERVATORY_PROJECT_VERSION_MISMATCH' using errcode = '22023';
  end if;
  if selected_version.status = 'archived' then
    raise exception 'OBSERVATORY_PROJECT_VERSION_ARCHIVED' using errcode = '22023';
  end if;

  insert into public.observatory_work_items (
    type, title, description, state, project_ref, project_version_id,
    assigned_agent_id, idempotency_key, created_by
  ) values (
    normalized_type, normalized_title, normalized_description, 'inbox',
    normalized_project_ref, selected_version.id, normalized_assigned_agent_id,
    normalized_idempotency_key, calling_user
  )
  on conflict (created_by, idempotency_key) do nothing
  returning * into created_item;

  if created_item.id is null then
    select * into strict existing_item
    from public.observatory_work_items
    where created_by = calling_user and idempotency_key = normalized_idempotency_key;
    if existing_item.type is distinct from normalized_type
      or existing_item.title is distinct from normalized_title
      or existing_item.description is distinct from normalized_description
      or existing_item.project_ref is distinct from normalized_project_ref
      or existing_item.project_version_id is distinct from selected_version.id
      or existing_item.assigned_agent_id is distinct from normalized_assigned_agent_id
      or existing_item.state is distinct from 'inbox'
    then
      raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return existing_item;
  end if;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
  ) values (
    created_item.id, 'created', calling_user,
    jsonb_build_object(
      'type', created_item.type,
      'state', created_item.state,
      'title', created_item.title,
      'project_ref', created_item.project_ref,
      'project_version_id', created_item.project_version_id,
      'assigned_agent_id', created_item.assigned_agent_id
    )
  );
  return created_item;
end;
$$;

revoke all privileges on function public.create_observatory_work_item(text, text, text, text, text, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(text, text, text, text, text, uuid, text)
to authenticated;

create or replace function public.create_observatory_work_item(
  p_type text,
  p_title text,
  p_description text,
  p_project_ref text,
  p_assigned_agent_id text,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  selected_version_id uuid;
begin
  perform public.ensure_observatory_project_backlog_versions(array[btrim(p_project_ref)]);
  select id into selected_version_id
  from public.observatory_project_versions
  where project_key = btrim(p_project_ref) and is_backlog;
  return public.create_observatory_work_item(
    p_type,
    p_title,
    p_description,
    p_project_ref,
    p_assigned_agent_id,
    selected_version_id,
    p_idempotency_key
  );
end;
$$;

revoke all privileges on function public.create_observatory_work_item(text, text, text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(text, text, text, text, text, text)
to authenticated;

create or replace function public.update_observatory_work_item(
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
  p_work_package_id text,
  p_project_version_id uuid
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  normalized_project_ref text := nullif(btrim(coalesce(p_project_ref, '')), '');
  normalized_project_key text := nullif(btrim(coalesce(p_project_key, '')), '');
  effective_project_key text;
  selected_version public.observatory_project_versions;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  binding_count integer;
begin
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
  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;
  if btrim(coalesce(p_assigned_agent_id, '')) = 'shared'
    or btrim(coalesce(p_assigned_agent_id, '')) !~ '^[a-z][a-z0-9-]{0,79}$'
  then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode = '22023';
  end if;

  binding_count :=
    (normalized_project_key is not null)::integer
    + (p_plan_revision is not null)::integer
    + (nullif(btrim(coalesce(p_stage_id, '')), '') is not null)::integer
    + (nullif(btrim(coalesce(p_work_package_id, '')), '') is not null)::integer;
  if binding_count not in (0, 4) then
    raise exception 'OBSERVATORY_PROJECT_CONTROL_BINDING_INVALID' using errcode = '22023';
  end if;

  effective_project_key := coalesce(normalized_project_key, normalized_project_ref);
  select * into selected_version
  from public.observatory_project_versions
  where id = p_project_version_id;
  if selected_version.id is null then
    raise exception 'OBSERVATORY_PROJECT_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if selected_version.project_key <> effective_project_key then
    raise exception 'OBSERVATORY_PROJECT_VERSION_MISMATCH' using errcode = '22023';
  end if;
  if selected_version.status = 'archived' then
    raise exception 'OBSERVATORY_PROJECT_VERSION_ARCHIVED' using errcode = '22023';
  end if;

  update public.observatory_work_items
  set type = btrim(p_type),
    title = btrim(p_title),
    description = btrim(coalesce(p_description, '')),
    acceptance_criteria = btrim(coalesce(p_acceptance_criteria, '')),
    priority = nullif(btrim(coalesce(p_priority, '')), ''),
    owner_id = p_owner_id,
    assigned_agent_id = btrim(p_assigned_agent_id),
    project_ref = normalized_project_ref,
    milestone_ref = nullif(btrim(coalesce(p_milestone_ref, '')), ''),
    project_key = normalized_project_key,
    plan_revision = p_plan_revision,
    stage_id = nullif(btrim(coalesce(p_stage_id, '')), ''),
    work_package_id = nullif(btrim(coalesce(p_work_package_id, '')), ''),
    project_version_id = selected_version.id,
    version = current_item.version + 1
  where id = current_item.id and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
  ) values (
    updated_item.id, 'updated', calling_user,
    jsonb_build_object(
      'before', jsonb_build_object(
        'type', current_item.type,
        'title', current_item.title,
        'description', current_item.description,
        'acceptance_criteria', current_item.acceptance_criteria,
        'priority', current_item.priority,
        'owner_id', current_item.owner_id,
        'project_ref', current_item.project_ref,
        'milestone_ref', current_item.milestone_ref,
        'project_key', current_item.project_key,
        'plan_revision', current_item.plan_revision,
        'stage_id', current_item.stage_id,
        'work_package_id', current_item.work_package_id,
        'project_version_id', current_item.project_version_id,
        'assigned_agent_id', current_item.assigned_agent_id,
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
        'project_ref', updated_item.project_ref,
        'milestone_ref', updated_item.milestone_ref,
        'project_key', updated_item.project_key,
        'plan_revision', updated_item.plan_revision,
        'stage_id', updated_item.stage_id,
        'work_package_id', updated_item.work_package_id,
        'project_version_id', updated_item.project_version_id,
        'assigned_agent_id', updated_item.assigned_agent_id,
        'state', updated_item.state,
        'version', updated_item.version
      )
    )
  );
  return updated_item;
end;
$$;

revoke all privileges on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, text,
  integer, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, text,
  integer, text, text, uuid
) to authenticated;

commit;
