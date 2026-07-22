create table public.observatory_snapshots (
  id uuid primary key default gen_random_uuid(),
  schema_version text not null check (length(btrim(schema_version)) between 1 and 64),
  generated_at timestamptz not null,
  source_digest text not null unique check (source_digest ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  collector_version text not null check (length(btrim(collector_version)) between 1 and 64),
  status text not null default 'success' check (status = 'success'),
  created_at timestamptz not null default now()
);

create index observatory_snapshots_generated_at_desc_idx
on public.observatory_snapshots(generated_at desc);

create table public.observatory_work_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('idea', 'feature', 'bug')),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  state text not null default 'inbox' check (state in ('inbox')),
  idempotency_key text not null check (
    length(idempotency_key) between 1 and 128
    and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, idempotency_key)
);

create index observatory_work_items_state_created_at_idx
on public.observatory_work_items(state, created_at desc);

create table public.observatory_work_item_events (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.observatory_work_items(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'updated')),
  actor_id uuid not null references public.profiles(user_id) on delete restrict,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);

create index observatory_work_item_events_item_created_at_idx
on public.observatory_work_item_events(work_item_id, created_at asc);

create unique index observatory_work_item_events_one_created_idx
on public.observatory_work_item_events(work_item_id)
where event_type = 'created';

create trigger observatory_work_items_set_updated_at
before update on public.observatory_work_items
for each row execute function public.set_updated_at();

create or replace function public.prevent_observatory_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Observatory snapshots are immutable';
end;
$$;

create trigger prevent_observatory_snapshot_mutation
before update or delete on public.observatory_snapshots
for each row execute function public.prevent_observatory_snapshot_mutation();

create or replace function public.prevent_observatory_work_item_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Observatory work-item events are append-only';
end;
$$;

create trigger prevent_observatory_work_item_event_mutation
before update or delete on public.observatory_work_item_events
for each row execute function public.prevent_observatory_work_item_event_mutation();

alter table public.observatory_snapshots enable row level security;
alter table public.observatory_work_items enable row level security;
alter table public.observatory_work_item_events enable row level security;

revoke all privileges on table public.observatory_snapshots
from public, anon, authenticated, service_role;
revoke all privileges on table public.observatory_work_items
from public, anon, authenticated, service_role;
revoke all privileges on table public.observatory_work_item_events
from public, anon, authenticated, service_role;

grant select on table public.observatory_snapshots to authenticated;
grant select, insert on table public.observatory_snapshots to service_role;
grant select on table public.observatory_work_items to authenticated;
grant select on table public.observatory_work_item_events to authenticated;

create policy observatory_snapshots_select_admin
on public.observatory_snapshots for select
to authenticated
using (public.is_current_user_admin());

create policy observatory_work_items_select_admin
on public.observatory_work_items for select
to authenticated
using (public.is_current_user_admin());

create policy observatory_work_item_events_select_admin
on public.observatory_work_item_events for select
to authenticated
using (public.is_current_user_admin());

create or replace function public.create_observatory_work_item(
  p_type text,
  p_title text,
  p_description text,
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
  normalized_state text := 'inbox';
  normalized_idempotency_key text := btrim(p_idempotency_key);
  created_item public.observatory_work_items;
  existing_item public.observatory_work_items;
begin
  calling_user := auth.uid();

  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  insert into public.observatory_work_items (
    type,
    title,
    description,
    state,
    idempotency_key,
    created_by
  )
  values (
    normalized_type,
    normalized_title,
    normalized_description,
    normalized_state,
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
      'title', created_item.title
    )
  );

  return created_item;
end;
$$;

revoke all privileges on function public.create_observatory_work_item(text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(text, text, text, text)
to authenticated;

create or replace function public.update_observatory_work_item(
  p_work_item_id uuid,
  p_expected_version integer,
  p_type text,
  p_title text,
  p_description text
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
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
begin
  calling_user := auth.uid();

  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select *
  into current_item
  from public.observatory_work_items
  where id = p_work_item_id
  for update;

  if current_item.id is null then
    raise exception 'OBSERVATORY_WORK_ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_expected_version is null then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  if current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  update public.observatory_work_items
  set type = normalized_type,
    title = normalized_title,
    description = normalized_description,
    version = current_item.version + 1
  where id = current_item.id
    and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id,
    event_type,
    actor_id,
    data
  )
  values (
    updated_item.id,
    'updated',
    calling_user,
    jsonb_build_object(
      'before', jsonb_build_object(
        'type', current_item.type,
        'title', current_item.title,
        'description', current_item.description,
        'state', current_item.state,
        'version', current_item.version
      ),
      'after', jsonb_build_object(
        'type', updated_item.type,
        'title', updated_item.title,
        'description', updated_item.description,
        'state', updated_item.state,
        'version', updated_item.version
      )
    )
  );

  return updated_item;
end;
$$;

revoke all privileges on function public.update_observatory_work_item(uuid, integer, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.update_observatory_work_item(uuid, integer, text, text, text)
to authenticated;
