alter table public.observatory_work_items
  drop constraint observatory_work_items_state_check,
  add column priority text,
  add column owner_id uuid references public.profiles(user_id) on delete restrict,
  add column acceptance_criteria text not null default '',
  add column project_ref text,
  add column milestone_ref text,
  add constraint observatory_work_items_state_check check (
    state in (
      'inbox', 'triage', 'ready', 'in_progress', 'review',
      'done', 'blocked', 'waiting', 'reopened'
    )
  ),
  add constraint observatory_work_items_priority_check check (
    priority is null or priority in ('low', 'medium', 'high', 'urgent')
  ),
  add constraint observatory_work_items_acceptance_criteria_check check (
    length(acceptance_criteria) <= 4000
  ),
  add constraint observatory_work_items_project_ref_check check (
    project_ref is null or length(project_ref) between 1 and 160
  ),
  add constraint observatory_work_items_milestone_ref_check check (
    milestone_ref is null or length(milestone_ref) between 1 and 160
  );

alter table public.observatory_work_item_events
  drop constraint observatory_work_item_events_event_type_check,
  add constraint observatory_work_item_events_event_type_check check (
    event_type in (
      'created', 'updated', 'state_transitioned',
      'evidence_added', 'evidence_removed'
    )
  );

create table public.observatory_work_item_evidence (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.observatory_work_items(id) on delete restrict,
  label text not null check (length(btrim(label)) between 1 and 200),
  url text not null check (
    length(url) between 1 and 2048
    and url ~* '^https?://[^[:space:]]+$'
  ),
  created_by uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(user_id) on delete restrict,
  check (
    (removed_at is null and removed_by is null)
    or (removed_at is not null and removed_by is not null)
  )
);

create index observatory_work_item_evidence_item_created_at_idx
on public.observatory_work_item_evidence(work_item_id, created_at asc);

create unique index observatory_work_item_evidence_active_url_idx
on public.observatory_work_item_evidence(work_item_id, url)
where removed_at is null;

alter table public.observatory_work_item_evidence enable row level security;

revoke all privileges on table public.observatory_work_item_evidence
from public, anon, authenticated, service_role;

grant select on table public.observatory_work_item_evidence to authenticated;

create policy observatory_work_item_evidence_select_admin
on public.observatory_work_item_evidence for select
to authenticated
using (public.is_current_user_admin());

drop function public.update_observatory_work_item(
  uuid, integer, text, text, text
);

create or replace function public.update_observatory_work_item(
  p_work_item_id uuid,
  p_expected_version integer,
  p_type text,
  p_title text,
  p_description text,
  p_acceptance_criteria text,
  p_priority text,
  p_owner_id uuid,
  p_project_ref text,
  p_milestone_ref text
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
  normalized_project_ref text := nullif(btrim(coalesce(p_project_ref, '')), '');
  normalized_milestone_ref text := nullif(btrim(coalesce(p_milestone_ref, '')), '');
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

  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  update public.observatory_work_items
  set type = normalized_type,
    title = normalized_title,
    description = normalized_description,
    acceptance_criteria = normalized_acceptance_criteria,
    priority = normalized_priority,
    owner_id = p_owner_id,
    project_ref = normalized_project_ref,
    milestone_ref = normalized_milestone_ref,
    version = current_item.version + 1
  where id = current_item.id
    and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
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
        'acceptance_criteria', current_item.acceptance_criteria,
        'priority', current_item.priority,
        'owner_id', current_item.owner_id,
        'project_ref', current_item.project_ref,
        'milestone_ref', current_item.milestone_ref,
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
        'state', updated_item.state,
        'version', updated_item.version
      )
    )
  );

  return updated_item;
end;
$$;

revoke all privileges on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text
)
from public, anon, authenticated, service_role;
grant execute on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text
)
to authenticated;

create or replace function public.transition_observatory_work_item(
  p_work_item_id uuid,
  p_expected_version integer,
  p_target_state text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  target_state text := btrim(p_target_state);
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  transition_allowed boolean;
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

  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

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

  if (
    target_state = 'ready'
    or (current_item.state = 'reopened' and target_state = 'in_progress')
  ) and (
    current_item.acceptance_criteria = ''
    or current_item.priority is null
    or current_item.owner_id is null
  ) then
    raise exception 'OBSERVATORY_READY_GATE_FAILED' using errcode = '23514';
  end if;

  update public.observatory_work_items
  set state = target_state,
    version = current_item.version + 1
  where id = current_item.id
    and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
  )
  values (
    updated_item.id,
    'state_transitioned',
    calling_user,
    jsonb_build_object(
      'from', current_item.state,
      'to', updated_item.state,
      'before_version', current_item.version,
      'after_version', updated_item.version
    )
  );

  return updated_item;
end;
$$;

revoke all privileges on function public.transition_observatory_work_item(
  uuid, integer, text
)
from public, anon, authenticated, service_role;
grant execute on function public.transition_observatory_work_item(
  uuid, integer, text
)
to authenticated;

create or replace function public.add_observatory_work_item_evidence(
  p_work_item_id uuid,
  p_expected_version integer,
  p_label text,
  p_url text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  normalized_label text := btrim(p_label);
  normalized_url text := btrim(p_url);
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  created_evidence public.observatory_work_item_evidence;
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

  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  insert into public.observatory_work_item_evidence (
    work_item_id, label, url, created_by
  )
  values (
    current_item.id, normalized_label, normalized_url, calling_user
  )
  returning * into strict created_evidence;

  update public.observatory_work_items
  set version = current_item.version + 1
  where id = current_item.id
    and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
  )
  values (
    updated_item.id,
    'evidence_added',
    calling_user,
    jsonb_build_object(
      'evidence_id', created_evidence.id,
      'label', created_evidence.label,
      'url', created_evidence.url,
      'before_version', current_item.version,
      'after_version', updated_item.version
    )
  );

  return updated_item;
end;
$$;

revoke all privileges on function public.add_observatory_work_item_evidence(
  uuid, integer, text, text
)
from public, anon, authenticated, service_role;
grant execute on function public.add_observatory_work_item_evidence(
  uuid, integer, text, text
)
to authenticated;

create or replace function public.remove_observatory_work_item_evidence(
  p_work_item_id uuid,
  p_evidence_id uuid,
  p_expected_version integer
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  calling_user uuid;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  current_evidence public.observatory_work_item_evidence;
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

  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001';
  end if;

  select *
  into current_evidence
  from public.observatory_work_item_evidence
  where id = p_evidence_id
    and work_item_id = current_item.id
    and removed_at is null
  for update;

  if current_evidence.id is null then
    raise exception 'OBSERVATORY_EVIDENCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.observatory_work_item_evidence
  set removed_at = now(), removed_by = calling_user
  where id = current_evidence.id;

  update public.observatory_work_items
  set version = current_item.version + 1
  where id = current_item.id
    and version = p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events (
    work_item_id, event_type, actor_id, data
  )
  values (
    updated_item.id,
    'evidence_removed',
    calling_user,
    jsonb_build_object(
      'evidence_id', current_evidence.id,
      'label', current_evidence.label,
      'url', current_evidence.url,
      'before_version', current_item.version,
      'after_version', updated_item.version
    )
  );

  return updated_item;
end;
$$;

revoke all privileges on function public.remove_observatory_work_item_evidence(
  uuid, uuid, integer
)
from public, anon, authenticated, service_role;
grant execute on function public.remove_observatory_work_item_evidence(
  uuid, uuid, integer
)
to authenticated;
