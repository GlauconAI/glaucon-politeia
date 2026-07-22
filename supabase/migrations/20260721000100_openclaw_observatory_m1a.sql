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

revoke all on public.observatory_snapshots from anon;
revoke insert, update, delete on public.observatory_snapshots from anon, authenticated;
grant select on public.observatory_snapshots to authenticated;
grant select on public.observatory_snapshots to service_role;
grant insert on public.observatory_snapshots to service_role;

revoke all on public.observatory_work_items from anon;
revoke delete on public.observatory_work_items from authenticated;
grant select, insert, update on public.observatory_work_items to authenticated;

revoke all on public.observatory_work_item_events from anon;
revoke update, delete on public.observatory_work_item_events from authenticated;
grant select, insert on public.observatory_work_item_events to authenticated;

create policy observatory_snapshots_select_admin
on public.observatory_snapshots for select
to authenticated
using (public.is_current_user_admin());

create policy observatory_work_items_select_admin
on public.observatory_work_items for select
to authenticated
using (public.is_current_user_admin());

create policy observatory_work_items_insert_admin
on public.observatory_work_items for insert
to authenticated
with check (
  public.is_current_user_admin()
  and created_by = auth.uid()
);

create policy observatory_work_items_update_admin
on public.observatory_work_items for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy observatory_work_item_events_select_admin
on public.observatory_work_item_events for select
to authenticated
using (public.is_current_user_admin());

create policy observatory_work_item_events_insert_admin
on public.observatory_work_item_events for insert
to authenticated
with check (
  public.is_current_user_admin()
  and actor_id = auth.uid()
);

create or replace function public.create_observatory_work_item(
  p_type text,
  p_title text,
  p_description text,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_item public.observatory_work_items;
begin
  if not public.is_current_user_admin() then
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
    p_type,
    btrim(p_title),
    btrim(coalesce(p_description, '')),
    'inbox',
    btrim(p_idempotency_key),
    auth.uid()
  )
  on conflict (created_by, idempotency_key) do nothing
  returning * into created_item;

  if created_item.id is null then
    select *
    into strict created_item
    from public.observatory_work_items
    where created_by = auth.uid()
      and idempotency_key = btrim(p_idempotency_key);

    return created_item;
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
    auth.uid(),
    jsonb_build_object(
      'type', created_item.type,
      'state', created_item.state,
      'title', created_item.title
    )
  );

  return created_item;
end;
$$;

revoke all on function public.create_observatory_work_item(text, text, text, text)
from public, anon;
grant execute on function public.create_observatory_work_item(text, text, text, text)
to authenticated;
