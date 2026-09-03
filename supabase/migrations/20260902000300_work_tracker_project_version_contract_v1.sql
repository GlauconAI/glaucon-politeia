begin;

alter table public.observatory_project_versions
  add column semver text,
  add column is_release_target boolean not null default false,
  add column milestone_ref text,
  add column predecessor_version_id uuid references public.observatory_project_versions(id) on delete restrict,
  add column roadmap_ref text,
  add column approved_plan_ref text,
  add column acceptance_summary text,
  add column actual_date date,
  add column dependencies_summary text,
  add column dependencies_satisfied boolean not null default false,
  add column artifacts_accepted boolean not null default false,
  add column verification_complete boolean not null default false,
  add column roadmap_reconciled boolean not null default false,
  add column user_gate_decision_ref text;

alter table public.observatory_work_items
  add column version_binding_kind text default 'optional';

update public.observatory_work_items
set version_binding_kind = 'optional'
where version_binding_kind is null;

do $preflight$
begin
  if exists (
    select 1 from public.observatory_project_versions
    where status in ('active', 'gate_ready')
    group by project_key having count(*) > 1
  ) then
    raise exception 'OBSERVATORY_MULTIPLE_EXECUTION_VERSIONS' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.observatory_work_items item
    left join public.observatory_project_versions version on version.id = item.project_version_id
    where item.project_version_id is null or version.id is null
      or version.project_key <> coalesce(item.project_key, item.project_ref)
  ) then
    raise exception 'OBSERVATORY_WORK_ITEM_VERSION_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.observatory_project_versions a
    join public.observatory_project_versions b
      on b.project_key = a.project_key and b.id <> a.id
    where not a.is_backlog and not b.is_backlog
      and a.version_label ~ '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$'
      and b.version_label ~ '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$'
      and concat_ws('.', (regexp_match(a.version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[1],
        (regexp_match(a.version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[2],
        coalesce((regexp_match(a.version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[3], '0'))
       = concat_ws('.', (regexp_match(b.version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[1],
        (regexp_match(b.version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[2],
        coalesce((regexp_match(b.version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[3], '0'))
  ) then
    raise exception 'OBSERVATORY_AMBIGUOUS_FORMAL_VERSION_LABEL' using errcode = '23514';
  end if;
end;
$preflight$;

update public.observatory_project_versions
set semver = concat_ws('.',
  (regexp_match(version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[1],
  (regexp_match(version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[2],
  coalesce((regexp_match(version_label, '^v?((?:0|[1-9][0-9]*))\.((?:0|[1-9][0-9]*))(?:\.((?:0|[1-9][0-9]*)))?$'))[3], '0'))
where not is_backlog
  and version_label ~ '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$';

-- The new flag defaults false, but normalize explicitly before enforcing the invariant.
-- This changes no Project scope or identity fields.
update public.observatory_project_versions
set is_release_target = false
where is_backlog and is_release_target is distinct from false;

-- Preserve legacy release history deterministically. Archived rows were allowed to
-- omit released_at in v0, so use their last recorded mutation time before falling
-- back to creation time; never invent a new deployment-time timestamp.
update public.observatory_project_versions
set released_at = coalesce(released_at, updated_at, created_at)
where status in ('released', 'archived') and released_at is null;

update public.observatory_project_versions
set actual_date = released_at::date
where status in ('released', 'archived') and actual_date is null;

alter table public.observatory_work_items
  alter column version_binding_kind set default 'optional',
  alter column version_binding_kind set not null,
  alter column project_version_id set not null,
  add constraint observatory_work_items_version_binding_kind_check
    check (version_binding_kind in ('required', 'optional'));

do $constraints$
declare
  prior_status_definition text;
  prior_release_definition text;
begin
  select lower(regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g'))
  into prior_status_definition
  from pg_constraint
  where conrelid = 'public.observatory_project_versions'::regclass
    and contype = 'c'
    and conname = 'observatory_project_versions_status_check';

  select lower(regexp_replace(pg_get_constraintdef(oid), '\s+', ' ', 'g'))
  into prior_release_definition
  from pg_constraint
  where conrelid = 'public.observatory_project_versions'::regclass
    and contype = 'c'
    and conname = 'observatory_project_versions_check';

  if prior_status_definition is distinct from
      'check ((status = any (array[''planned''::text, ''active''::text, ''released''::text, ''archived''::text])))'
    or prior_release_definition is distinct from
      'check (((status <> ''released''::text) or (released_at is not null)))' then
    raise exception 'OBSERVATORY_PROJECT_VERSION_PRIOR_CONSTRAINT_MISMATCH' using errcode = '55000';
  end if;

  alter table public.observatory_project_versions
    drop constraint observatory_project_versions_status_check;
  alter table public.observatory_project_versions
    drop constraint observatory_project_versions_check;
end;
$constraints$;

alter table public.observatory_project_versions
  add constraint observatory_project_versions_status_check
    check (status in ('planned', 'active', 'gate_ready', 'released', 'archived', 'cancelled')),
  add constraint observatory_project_versions_semver_check
    check ((is_backlog and semver is null) or (not is_backlog and (semver is null or semver ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'))),
  add constraint observatory_project_versions_backlog_release_target_check
    check (not (is_backlog and is_release_target)),
  add constraint observatory_project_versions_release_timestamp_check
    check (status not in ('released', 'archived') or (released_at is not null and actual_date is not null));

create unique index observatory_project_versions_one_execution_idx
on public.observatory_project_versions(project_key)
where status in ('active', 'gate_ready');

create unique index observatory_project_versions_one_release_target_idx
on public.observatory_project_versions(project_key)
where is_release_target;

create unique index observatory_project_versions_semver_idx
on public.observatory_project_versions(project_key, semver)
where semver is not null and not is_backlog;

create or replace function public.lock_observatory_project_version_graph()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Global graph key for low-volume Project Version topology mutations.
  perform pg_catalog.pg_advisory_xact_lock(20960902000300);
  return null;
end;
$$;

create trigger observatory_project_versions_lock_graph
before insert or update of project_key, semver, predecessor_version_id
on public.observatory_project_versions
for each statement execute function public.lock_observatory_project_version_graph();

create or replace function public.validate_observatory_project_version_predecessor()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  predecessor public.observatory_project_versions;
  cycle_found boolean;
  predecessor_parts numeric[];
  current_parts numeric[];
begin
  -- One transaction-scoped global graph lock serializes all low-volume inserts and
  -- project_key/semver/predecessor mutations before any counterpart validation.
  perform pg_catalog.pg_advisory_xact_lock(20960902000300);
  if new.predecessor_version_id is not null then
    if new.predecessor_version_id = new.id then
      raise exception 'OBSERVATORY_PREDECESSOR_SELF' using errcode = '23514';
    end if;
    select * into predecessor from public.observatory_project_versions
    where id = new.predecessor_version_id;
    if predecessor.id is null then
      raise exception 'OBSERVATORY_PREDECESSOR_NOT_FOUND' using errcode = '23503';
    end if;
    if predecessor.project_key <> new.project_key then
      raise exception 'OBSERVATORY_PREDECESSOR_PROJECT_MISMATCH' using errcode = '23514';
    end if;
    if predecessor.semver is null or new.semver is null then
      raise exception 'OBSERVATORY_PREDECESSOR_SEMVER_REQUIRED' using errcode = '23514';
    end if;
    predecessor_parts := string_to_array(predecessor.semver, '.')::numeric[];
    current_parts := string_to_array(new.semver, '.')::numeric[];
    if predecessor_parts >= current_parts then
      raise exception 'OBSERVATORY_PREDECESSOR_ORDER_INVALID' using errcode = '23514';
    end if;
    with recursive predecessor_chain(id, predecessor_version_id) as (
      select new.predecessor_version_id, predecessor.predecessor_version_id
      union all
      select version.id, version.predecessor_version_id
      from public.observatory_project_versions version
      join predecessor_chain chain on version.id = chain.predecessor_version_id
    )
    select exists(select 1 from predecessor_chain where id = new.id) into cycle_found;
    if cycle_found then
      raise exception 'OBSERVATORY_PREDECESSOR_CYCLE' using errcode = '23514';
    end if;
  end if;
  if exists (
    select 1 from public.observatory_project_versions successor
    where successor.predecessor_version_id = new.id
      and successor.project_key <> new.project_key
  ) then
    raise exception 'OBSERVATORY_SUCCESSOR_PROJECT_MISMATCH' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.observatory_project_versions successor
    where successor.predecessor_version_id = new.id
      and (successor.semver is null or new.semver is null)
  ) then
    raise exception 'OBSERVATORY_SUCCESSOR_SEMVER_REQUIRED' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.observatory_project_versions successor
    where successor.predecessor_version_id = new.id
      and string_to_array(new.semver, '.')::numeric[] >=
        string_to_array(successor.semver, '.')::numeric[]
  ) then
    raise exception 'OBSERVATORY_SUCCESSOR_ORDER_INVALID' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger observatory_project_versions_validate_predecessor
before insert or update of project_key, semver, predecessor_version_id
on public.observatory_project_versions
for each row execute function public.validate_observatory_project_version_predecessor();

create or replace function public.protect_observatory_project_version_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.status in ('released', 'archived') then
    if not (old.status = 'released' and new.status = 'archived'
      and (to_jsonb(new) - array['status','row_version','updated_by','updated_at'])
        = (to_jsonb(old) - array['status','row_version','updated_by','updated_at'])) then
      raise exception 'OBSERVATORY_PROJECT_VERSION_HISTORY_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger observatory_project_versions_protect_history
before update on public.observatory_project_versions
for each row execute function public.protect_observatory_project_version_history();

create or replace function public.validate_observatory_work_item_project_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  version_project_key text;
  version_status text;
  bound_version_status text;
  item_project_key text := coalesce(new.project_key, new.project_ref);
begin
  if tg_op = 'UPDATE' then
    select status into bound_version_status
    from public.observatory_project_versions where id = old.project_version_id
    for key share;
    if bound_version_status in ('released', 'archived') and (
      new.type is distinct from old.type
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.acceptance_criteria is distinct from old.acceptance_criteria
      or new.priority is distinct from old.priority
      or new.owner_id is distinct from old.owner_id
      or new.assigned_agent_id is distinct from old.assigned_agent_id
      or new.project_ref is distinct from old.project_ref
      or new.milestone_ref is distinct from old.milestone_ref
      or new.project_key is distinct from old.project_key
      or new.plan_revision is distinct from old.plan_revision
      or new.stage_id is distinct from old.stage_id
      or new.work_package_id is distinct from old.work_package_id
      or new.project_version_id is distinct from old.project_version_id
      or new.version_binding_kind is distinct from old.version_binding_kind
    ) then
      raise exception 'OBSERVATORY_WORK_ITEM_VERSION_SCOPE_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  select project_key, status into version_project_key, version_status
  from public.observatory_project_versions where id = new.project_version_id
  for key share;
  if version_project_key is null then
    raise exception 'OBSERVATORY_PROJECT_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if item_project_key is null or version_project_key <> item_project_key then
    raise exception 'OBSERVATORY_PROJECT_VERSION_MISMATCH' using errcode = '22023';
  end if;
  if version_status in ('released', 'archived', 'cancelled')
    and (tg_op = 'INSERT' or new.project_version_id is distinct from old.project_version_id) then
    raise exception 'OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists observatory_work_items_validate_project_version
on public.observatory_work_items;
create trigger observatory_work_items_validate_project_version
before insert or update of state, type, title, description, acceptance_criteria, priority, owner_id,
  assigned_agent_id, project_ref, milestone_ref, project_key, plan_revision, stage_id,
  work_package_id, project_version_id, version_binding_kind
on public.observatory_work_items
for each row execute function public.validate_observatory_work_item_project_version();

-- Replace the v0 RPC overloads so callers cannot bypass the contract.
drop function if exists public.create_observatory_project_version(text, text, text, text, date);
drop function if exists public.update_observatory_project_version(uuid, integer, text, text, text, date);
drop function if exists public.transition_observatory_project_version(uuid, integer, text);

create function public.create_observatory_project_version(
  p_project_key text, p_version_label text, p_semver text, p_title text,
  p_description text, p_target_date date, p_is_release_target boolean,
  p_milestone_ref text, p_predecessor_version_id uuid, p_roadmap_ref text,
  p_approved_plan_ref text, p_acceptance_summary text, p_actual_date date,
  p_dependencies_summary text, p_dependencies_satisfied boolean,
  p_artifacts_accepted boolean, p_verification_complete boolean,
  p_roadmap_reconciled boolean, p_user_gate_decision_ref text
)
returns public.observatory_project_versions
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); created_version public.observatory_project_versions; violated_constraint text;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_semver is null or btrim(p_semver) !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' then
    raise exception 'OBSERVATORY_PROJECT_VERSION_SEMVER_INVALID' using errcode = '22023';
  end if;
  insert into public.observatory_project_versions (
    project_key, version_label, semver, title, description, target_date,
    is_release_target, milestone_ref, predecessor_version_id, roadmap_ref,
    approved_plan_ref, acceptance_summary, actual_date, dependencies_summary,
    dependencies_satisfied, artifacts_accepted, verification_complete,
    roadmap_reconciled, user_gate_decision_ref, created_by, updated_by
  ) values (
    btrim(p_project_key), btrim(p_version_label), btrim(p_semver), btrim(p_title),
    btrim(coalesce(p_description,'')), p_target_date, coalesce(p_is_release_target,false),
    nullif(btrim(coalesce(p_milestone_ref,'')),''), p_predecessor_version_id,
    nullif(btrim(coalesce(p_roadmap_ref,'')),''), nullif(btrim(coalesce(p_approved_plan_ref,'')),''),
    nullif(btrim(coalesce(p_acceptance_summary,'')),''), p_actual_date,
    nullif(btrim(coalesce(p_dependencies_summary,'')),''), coalesce(p_dependencies_satisfied,false),
    coalesce(p_artifacts_accepted,false), coalesce(p_verification_complete,false),
    coalesce(p_roadmap_reconciled,false), nullif(btrim(coalesce(p_user_gate_decision_ref,'')),''),
    calling_user, calling_user
  ) returning * into created_version;
  insert into public.observatory_project_version_events(project_version_id,event_type,actor_id,data)
  values (created_version.id,'created',calling_user,jsonb_build_object('after',to_jsonb(created_version)));
  return created_version;
exception
  when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'observatory_project_versions_project_label_idx' then
      raise exception 'OBSERVATORY_PROJECT_VERSION_DUPLICATE' using errcode='23505';
    elsif violated_constraint = 'observatory_project_versions_semver_idx' then
      raise exception 'OBSERVATORY_PROJECT_VERSION_SEMVER_DUPLICATE' using errcode='23505';
    else
      raise;
    end if;
end;
$$;

create function public.update_observatory_project_version(
  p_project_version_id uuid, p_expected_version integer,
  p_version_label text, p_semver text, p_title text, p_description text,
  p_target_date date, p_is_release_target boolean, p_milestone_ref text,
  p_predecessor_version_id uuid, p_roadmap_ref text, p_approved_plan_ref text,
  p_acceptance_summary text, p_actual_date date, p_dependencies_summary text,
  p_dependencies_satisfied boolean, p_artifacts_accepted boolean,
  p_verification_complete boolean, p_roadmap_reconciled boolean,
  p_user_gate_decision_ref text
)
returns public.observatory_project_versions
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_version public.observatory_project_versions; updated_version public.observatory_project_versions; violated_constraint text;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  -- Match the statement trigger's global lock order before taking a row lock.
  perform pg_catalog.pg_advisory_xact_lock(20960902000300);
  select * into current_version from public.observatory_project_versions where id=p_project_version_id for update;
  if current_version.id is null then raise exception 'OBSERVATORY_PROJECT_VERSION_NOT_FOUND' using errcode='P0002'; end if;
  if p_expected_version is null then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode='40001'; end if;
  if current_version.row_version <> p_expected_version then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode='40001'; end if;
  if current_version.is_backlog or current_version.status in ('released','archived') then raise exception 'OBSERVATORY_PROJECT_VERSION_IMMUTABLE' using errcode='22023'; end if;
  if p_semver is null or btrim(p_semver) !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' then raise exception 'OBSERVATORY_PROJECT_VERSION_SEMVER_INVALID' using errcode='22023'; end if;
  update public.observatory_project_versions set
    version_label=btrim(p_version_label), semver=btrim(p_semver), title=btrim(p_title),
    description=btrim(coalesce(p_description,'')), target_date=p_target_date,
    is_release_target=coalesce(p_is_release_target,false), milestone_ref=nullif(btrim(coalesce(p_milestone_ref,'')),''),
    predecessor_version_id=p_predecessor_version_id, roadmap_ref=nullif(btrim(coalesce(p_roadmap_ref,'')),''),
    approved_plan_ref=nullif(btrim(coalesce(p_approved_plan_ref,'')),''), acceptance_summary=nullif(btrim(coalesce(p_acceptance_summary,'')),''),
    actual_date=p_actual_date, dependencies_summary=nullif(btrim(coalesce(p_dependencies_summary,'')),''),
    dependencies_satisfied=coalesce(p_dependencies_satisfied,false), artifacts_accepted=coalesce(p_artifacts_accepted,false),
    verification_complete=coalesce(p_verification_complete,false), roadmap_reconciled=coalesce(p_roadmap_reconciled,false),
    user_gate_decision_ref=nullif(btrim(coalesce(p_user_gate_decision_ref,'')),''), row_version=current_version.row_version+1,
    updated_by=calling_user, updated_at=now()
  where id=current_version.id and row_version=p_expected_version returning * into strict updated_version;
  insert into public.observatory_project_version_events(project_version_id,event_type,actor_id,data)
  values(updated_version.id,'updated',calling_user,jsonb_build_object('before',to_jsonb(current_version),'after',to_jsonb(updated_version)));
  return updated_version;
exception
  when unique_violation then
    get stacked diagnostics violated_constraint = constraint_name;
    if violated_constraint = 'observatory_project_versions_project_label_idx' then
      raise exception 'OBSERVATORY_PROJECT_VERSION_DUPLICATE' using errcode='23505';
    elsif violated_constraint = 'observatory_project_versions_semver_idx' then
      raise exception 'OBSERVATORY_PROJECT_VERSION_SEMVER_DUPLICATE' using errcode='23505';
    else
      raise;
    end if;
end;
$$;

create function public.transition_observatory_project_version(p_project_version_id uuid, p_expected_version integer, p_target_status text)
returns public.observatory_project_versions
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); target_status text := btrim(p_target_status); current_version public.observatory_project_versions; updated_version public.observatory_project_versions; incomplete_required integer;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_version from public.observatory_project_versions where id=p_project_version_id for update;
  if current_version.id is null then raise exception 'OBSERVATORY_PROJECT_VERSION_NOT_FOUND' using errcode='P0002'; end if;
  if p_expected_version is null then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode='40001'; end if;
  if current_version.row_version <> p_expected_version then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode='40001'; end if;
  if current_version.is_backlog then raise exception 'OBSERVATORY_PROJECT_VERSION_BACKLOG_IMMUTABLE' using errcode='22023'; end if;
  if not (
    (current_version.status='planned' and target_status in ('active','cancelled')) or
    (current_version.status='active' and target_status in ('gate_ready','cancelled')) or
    (current_version.status='gate_ready' and target_status in ('active','released')) or
    (current_version.status='released' and target_status='archived')
  ) then raise exception 'OBSERVATORY_PROJECT_VERSION_TRANSITION_INVALID' using errcode='22023'; end if;
  if target_status='released' then
    select count(*) into incomplete_required from public.observatory_work_items
    where project_version_id=current_version.id and version_binding_kind = 'required' and state <> 'done';
    if incomplete_required > 0 or btrim(coalesce(current_version.acceptance_summary,'')) = ''
      or not current_version.dependencies_satisfied or not current_version.artifacts_accepted
      or not current_version.verification_complete or not current_version.roadmap_reconciled
      or btrim(coalesce(current_version.user_gate_decision_ref,'')) = '' then
      raise exception 'OBSERVATORY_PROJECT_VERSION_RELEASE_GATE_INCOMPLETE' using errcode='23514';
    end if;
  end if;
  update public.observatory_project_versions set status=target_status,
    released_at=case when target_status='released' then now() else current_version.released_at end,
    actual_date=case when target_status='released' then coalesce(current_version.actual_date,current_date) else current_version.actual_date end,
    is_release_target=case when target_status in ('released','cancelled') then false else current_version.is_release_target end,
    row_version=current_version.row_version+1, updated_by=calling_user, updated_at=now()
  where id=current_version.id and row_version=p_expected_version returning * into strict updated_version;
  insert into public.observatory_project_version_events(project_version_id,event_type,actor_id,data)
  values(updated_version.id,'status_transitioned',calling_user,jsonb_build_object('before',to_jsonb(current_version),'after',to_jsonb(updated_version)));
  return updated_version;
end;
$$;

-- Work Item RPCs are extended by inserting the binding kind immediately after version id.
drop function if exists public.create_observatory_work_item(text,text,text,text,text,uuid,text);
drop function if exists public.create_observatory_work_item(text,text,text,text,text,text);
drop function if exists public.create_observatory_work_item(text,text,text,text,text);
drop function if exists public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text);
drop function if exists public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,integer,text,text);
drop function if exists public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text);
drop function if exists public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid);

create function public.create_observatory_work_item(
  p_type text, p_title text, p_description text, p_project_ref text,
  p_assigned_agent_id text, p_project_version_id uuid, p_version_binding_kind text,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); created_item public.observatory_work_items; existing_item public.observatory_work_items; selected_version public.observatory_project_versions;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_version_binding_kind not in ('required','optional') then raise exception 'OBSERVATORY_VERSION_BINDING_KIND_INVALID' using errcode='22023'; end if;
  if btrim(coalesce(p_assigned_agent_id,'')) = 'shared' or btrim(coalesce(p_assigned_agent_id,'')) !~ '^[a-z][a-z0-9-]{0,79}$' then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode='22023';
  end if;
  select * into existing_item from public.observatory_work_items
  where created_by=calling_user and idempotency_key=btrim(p_idempotency_key);
  if existing_item.id is not null then
    if existing_item.type is distinct from btrim(p_type)
      or existing_item.title is distinct from btrim(p_title)
      or existing_item.description is distinct from btrim(coalesce(p_description,''))
      or existing_item.project_ref is distinct from btrim(p_project_ref)
      or existing_item.project_version_id is distinct from p_project_version_id
      or existing_item.version_binding_kind is distinct from p_version_binding_kind
      or existing_item.assigned_agent_id is distinct from btrim(p_assigned_agent_id) then
      raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    return existing_item;
  end if;
  select * into selected_version from public.observatory_project_versions where id=p_project_version_id for key share;
  if selected_version.id is null or selected_version.project_key <> btrim(p_project_ref) then raise exception 'OBSERVATORY_PROJECT_VERSION_MISMATCH' using errcode='22023'; end if;
  if selected_version.status in ('released','archived','cancelled') then raise exception 'OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED' using errcode='22023'; end if;
  insert into public.observatory_work_items(type,title,description,state,project_ref,project_version_id,version_binding_kind,assigned_agent_id,idempotency_key,created_by)
  values(btrim(p_type),btrim(p_title),btrim(coalesce(p_description,'')),'inbox',btrim(p_project_ref),selected_version.id,p_version_binding_kind,btrim(p_assigned_agent_id),btrim(p_idempotency_key),calling_user)
  on conflict (created_by, idempotency_key) do nothing
  returning * into created_item;
  if created_item.id is null then
    select * into strict existing_item from public.observatory_work_items
    where created_by=calling_user and idempotency_key=btrim(p_idempotency_key);
    if existing_item.type is distinct from btrim(p_type)
      or existing_item.title is distinct from btrim(p_title)
      or existing_item.description is distinct from btrim(coalesce(p_description,''))
      or existing_item.project_ref is distinct from btrim(p_project_ref)
      or existing_item.project_version_id is distinct from selected_version.id
      or existing_item.version_binding_kind is distinct from p_version_binding_kind
      or existing_item.assigned_agent_id is distinct from btrim(p_assigned_agent_id) then
      raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    return existing_item;
  end if;
  insert into public.observatory_work_item_events(work_item_id,event_type,actor_id,data)
  values(created_item.id,'created',calling_user,jsonb_build_object('after',jsonb_build_object(
    'id',created_item.id,'type',created_item.type,'title',created_item.title,
    'description',created_item.description,'state',created_item.state,'version',created_item.version,
    'created_by',created_item.created_by,'created_at',created_item.created_at,'updated_at',created_item.updated_at,
    'priority',created_item.priority,'owner_id',created_item.owner_id,
    'acceptance_criteria',created_item.acceptance_criteria,'project_ref',created_item.project_ref,
    'milestone_ref',created_item.milestone_ref,'risk_level',created_item.risk_level,
    'assigned_agent_id',created_item.assigned_agent_id,'project_key',created_item.project_key,
    'plan_revision',created_item.plan_revision,'stage_id',created_item.stage_id,
    'work_package_id',created_item.work_package_id,'project_version_id',created_item.project_version_id,
    'version_binding_kind',created_item.version_binding_kind
  )));
  return created_item;
end;
$$;

create function public.update_observatory_work_item(
  p_work_item_id uuid, p_expected_version integer, p_type text, p_title text,
  p_description text, p_acceptance_criteria text, p_priority text, p_owner_id uuid,
  p_assigned_agent_id text, p_project_ref text, p_milestone_ref text, p_project_key text,
  p_plan_revision integer, p_stage_id text, p_work_package_id text,
  p_project_version_id uuid, p_version_binding_kind text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_item public.observatory_work_items; updated_item public.observatory_work_items; binding_count integer;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_item from public.observatory_work_items where id=p_work_item_id for update;
  if current_item.id is null then raise exception 'OBSERVATORY_WORK_ITEM_NOT_FOUND' using errcode='P0002'; end if;
  if p_expected_version is null then raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode='40001'; end if;
  if current_item.version <> p_expected_version then raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode='40001'; end if;
  if p_version_binding_kind not in ('required','optional') then raise exception 'OBSERVATORY_VERSION_BINDING_KIND_INVALID' using errcode='22023'; end if;
  if btrim(coalesce(p_assigned_agent_id,'')) = 'shared' or btrim(coalesce(p_assigned_agent_id,'')) !~ '^[a-z][a-z0-9-]{0,79}$' then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode='22023';
  end if;
  binding_count :=
    (nullif(btrim(coalesce(p_project_key,'')),'') is not null)::integer
    + (p_plan_revision is not null)::integer
    + (nullif(btrim(coalesce(p_stage_id,'')),'') is not null)::integer
    + (nullif(btrim(coalesce(p_work_package_id,'')),'') is not null)::integer;
  if binding_count not in (0,4) then raise exception 'OBSERVATORY_PROJECT_CONTROL_BINDING_INVALID' using errcode='22023'; end if;
  update public.observatory_work_items set type=btrim(p_type),title=btrim(p_title),description=btrim(coalesce(p_description,'')),
    acceptance_criteria=btrim(coalesce(p_acceptance_criteria,'')),priority=nullif(btrim(coalesce(p_priority,'')),''),owner_id=p_owner_id,
    assigned_agent_id=btrim(p_assigned_agent_id),project_ref=nullif(btrim(coalesce(p_project_ref,'')),''),milestone_ref=nullif(btrim(coalesce(p_milestone_ref,'')),''),
    project_key=nullif(btrim(coalesce(p_project_key,'')),''),plan_revision=p_plan_revision,stage_id=nullif(btrim(coalesce(p_stage_id,'')),''),
    work_package_id=nullif(btrim(coalesce(p_work_package_id,'')),''),project_version_id=p_project_version_id,
    version_binding_kind=p_version_binding_kind,version=current_item.version+1
  where id=current_item.id and version=p_expected_version returning * into strict updated_item;
  insert into public.observatory_work_item_events(work_item_id,event_type,actor_id,data)
  values(updated_item.id,'updated',calling_user,jsonb_build_object(
    'before',jsonb_build_object(
      'id',current_item.id,'type',current_item.type,'title',current_item.title,
      'description',current_item.description,'state',current_item.state,'version',current_item.version,
      'created_by',current_item.created_by,'created_at',current_item.created_at,'updated_at',current_item.updated_at,
      'priority',current_item.priority,'owner_id',current_item.owner_id,
      'acceptance_criteria',current_item.acceptance_criteria,'project_ref',current_item.project_ref,
      'milestone_ref',current_item.milestone_ref,'risk_level',current_item.risk_level,
      'assigned_agent_id',current_item.assigned_agent_id,'project_key',current_item.project_key,
      'plan_revision',current_item.plan_revision,'stage_id',current_item.stage_id,
      'work_package_id',current_item.work_package_id,'project_version_id',current_item.project_version_id,
      'version_binding_kind',current_item.version_binding_kind
    ),
    'after',jsonb_build_object(
      'id',updated_item.id,'type',updated_item.type,'title',updated_item.title,
      'description',updated_item.description,'state',updated_item.state,'version',updated_item.version,
      'created_by',updated_item.created_by,'created_at',updated_item.created_at,'updated_at',updated_item.updated_at,
      'priority',updated_item.priority,'owner_id',updated_item.owner_id,
      'acceptance_criteria',updated_item.acceptance_criteria,'project_ref',updated_item.project_ref,
      'milestone_ref',updated_item.milestone_ref,'risk_level',updated_item.risk_level,
      'assigned_agent_id',updated_item.assigned_agent_id,'project_key',updated_item.project_key,
      'plan_revision',updated_item.plan_revision,'stage_id',updated_item.stage_id,
      'work_package_id',updated_item.work_package_id,'project_version_id',updated_item.project_version_id,
      'version_binding_kind',updated_item.version_binding_kind
    )
  ));
  return updated_item;
end;
$$;

-- Preserve bounded prior RPC input shapes for callers that already conform to
-- v1 lifecycle semantics. These overloads do not restore the prior transition
-- graph; recovery after migration is forward-only at both schema and app level.
create function public.create_observatory_project_version(
  p_project_key text, p_version_label text, p_title text,
  p_description text, p_target_date date
)
returns public.observatory_project_versions
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  semver_parts text[];
  p_semver text;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  semver_parts := regexp_match(btrim(p_version_label), '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$');
  if semver_parts is null then raise exception 'OBSERVATORY_PROJECT_VERSION_SEMVER_INVALID' using errcode='22023'; end if;
  p_semver := semver_parts[1] || '.' || semver_parts[2] || '.' || coalesce(semver_parts[3], '0');
  return public.create_observatory_project_version(
    p_project_key, p_version_label, p_semver, p_title, p_description, p_target_date,
    false, null, null, null, null, null, null, null, false, false, false, false, null
  );
end;
$$;

create function public.update_observatory_project_version(
  p_project_version_id uuid, p_expected_version integer,
  p_version_label text, p_title text, p_description text, p_target_date date
)
returns public.observatory_project_versions
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_version public.observatory_project_versions; semver_parts text[]; normalized_semver text;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_version from public.observatory_project_versions where id=p_project_version_id;
  semver_parts := regexp_match(btrim(p_version_label), '^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:\.(0|[1-9][0-9]*))?$');
  if semver_parts is null then raise exception 'OBSERVATORY_PROJECT_VERSION_SEMVER_INVALID' using errcode='22023'; end if;
  normalized_semver := semver_parts[1] || '.' || semver_parts[2] || '.' || coalesce(semver_parts[3], '0');
  return public.update_observatory_project_version(
    p_project_version_id, p_expected_version, p_version_label, normalized_semver,
    p_title, p_description, p_target_date, current_version.is_release_target,
    current_version.milestone_ref, current_version.predecessor_version_id,
    current_version.roadmap_ref, current_version.approved_plan_ref,
    current_version.acceptance_summary, current_version.actual_date,
    current_version.dependencies_summary, current_version.dependencies_satisfied,
    current_version.artifacts_accepted, current_version.verification_complete,
    current_version.roadmap_reconciled, current_version.user_gate_decision_ref
  );
end;
$$;

create function public.create_observatory_work_item(
  p_type text, p_title text, p_description text, p_project_ref text,
  p_assigned_agent_id text, p_project_version_id uuid, p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid();
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  return public.create_observatory_work_item(
    p_type, p_title, p_description, p_project_ref, p_assigned_agent_id,
    p_project_version_id, 'optional', p_idempotency_key
  );
end;
$$;

create function public.create_observatory_work_item(
  p_type text, p_title text, p_description text, p_project_ref text,
  p_assigned_agent_id text, p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); selected_version_id uuid;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  perform public.ensure_observatory_project_backlog_versions(array[btrim(p_project_ref)]);
  select id into selected_version_id from public.observatory_project_versions
  where project_key=btrim(p_project_ref) and is_backlog;
  return public.create_observatory_work_item(
    p_type, p_title, p_description, p_project_ref, p_assigned_agent_id,
    selected_version_id, 'optional', p_idempotency_key
  );
end;
$$;

create function public.create_observatory_work_item(
  p_type text, p_title text, p_description text, p_project_ref text,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid();
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  return public.create_observatory_work_item(
    p_type, p_title, p_description, p_project_ref,
    split_part(btrim(p_project_ref), '/', 1), p_idempotency_key
  );
end;
$$;

create function public.update_observatory_work_item(
  p_work_item_id uuid, p_expected_version integer, p_type text, p_title text,
  p_description text, p_acceptance_criteria text, p_priority text,
  p_owner_id uuid, p_project_ref text, p_milestone_ref text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_item public.observatory_work_items;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_item from public.observatory_work_items where id=p_work_item_id;
  return public.update_observatory_work_item(
    p_work_item_id, p_expected_version, p_type, p_title, p_description,
    p_acceptance_criteria, p_priority, p_owner_id, current_item.assigned_agent_id,
    p_project_ref, p_milestone_ref, current_item.project_key, current_item.plan_revision,
    current_item.stage_id, current_item.work_package_id, current_item.project_version_id,
    current_item.version_binding_kind
  );
end;
$$;

create function public.update_observatory_work_item(
  p_work_item_id uuid, p_expected_version integer, p_type text, p_title text,
  p_description text, p_acceptance_criteria text, p_priority text,
  p_owner_id uuid, p_project_ref text, p_milestone_ref text, p_project_key text,
  p_plan_revision integer, p_stage_id text, p_work_package_id text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_item public.observatory_work_items;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_item from public.observatory_work_items where id=p_work_item_id;
  return public.update_observatory_work_item(
    p_work_item_id, p_expected_version, p_type, p_title, p_description,
    p_acceptance_criteria, p_priority, p_owner_id, current_item.assigned_agent_id,
    p_project_ref, p_milestone_ref, p_project_key, p_plan_revision, p_stage_id,
    p_work_package_id, current_item.project_version_id, current_item.version_binding_kind
  );
end;
$$;

create function public.update_observatory_work_item(
  p_work_item_id uuid, p_expected_version integer, p_type text, p_title text,
  p_description text, p_acceptance_criteria text, p_priority text,
  p_owner_id uuid, p_assigned_agent_id text, p_project_ref text,
  p_milestone_ref text, p_project_key text, p_plan_revision integer,
  p_stage_id text, p_work_package_id text
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_item public.observatory_work_items;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_item from public.observatory_work_items where id=p_work_item_id;
  return public.update_observatory_work_item(
    p_work_item_id, p_expected_version, p_type, p_title, p_description,
    p_acceptance_criteria, p_priority, p_owner_id, p_assigned_agent_id,
    p_project_ref, p_milestone_ref, p_project_key, p_plan_revision, p_stage_id,
    p_work_package_id, current_item.project_version_id, current_item.version_binding_kind
  );
end;
$$;

create function public.update_observatory_work_item(
  p_work_item_id uuid, p_expected_version integer, p_type text, p_title text,
  p_description text, p_acceptance_criteria text, p_priority text,
  p_owner_id uuid, p_assigned_agent_id text, p_project_ref text,
  p_milestone_ref text, p_project_key text, p_plan_revision integer,
  p_stage_id text, p_work_package_id text, p_project_version_id uuid
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare calling_user uuid := auth.uid(); current_item public.observatory_work_items;
begin
  if calling_user is null or not public.is_current_user_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into current_item from public.observatory_work_items where id=p_work_item_id;
  return public.update_observatory_work_item(
    p_work_item_id, p_expected_version, p_type, p_title, p_description,
    p_acceptance_criteria, p_priority, p_owner_id, p_assigned_agent_id,
    p_project_ref, p_milestone_ref, p_project_key, p_plan_revision, p_stage_id,
    p_work_package_id, p_project_version_id, current_item.version_binding_kind
  );
end;
$$;

revoke all privileges on function public.create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text) to authenticated;
revoke all privileges on function public.update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text) to authenticated;
revoke all privileges on function public.transition_observatory_project_version(uuid,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_observatory_project_version(uuid,integer,text) to authenticated;
revoke all privileges on function public.create_observatory_work_item(text,text,text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_observatory_work_item(text,text,text,text,text,uuid,text,text) to authenticated;
revoke all privileges on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text) to authenticated;
revoke all privileges on function public.create_observatory_project_version(text,text,text,text,date) from public,anon,authenticated,service_role;
grant execute on function public.create_observatory_project_version(text,text,text,text,date) to authenticated;
revoke all privileges on function public.update_observatory_project_version(uuid,integer,text,text,text,date) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_project_version(uuid,integer,text,text,text,date) to authenticated;
revoke all privileges on function public.create_observatory_work_item(text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_observatory_work_item(text,text,text,text,text) to authenticated;
revoke all privileges on function public.create_observatory_work_item(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.create_observatory_work_item(text,text,text,text,text,text) to authenticated;
revoke all privileges on function public.create_observatory_work_item(text,text,text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.create_observatory_work_item(text,text,text,text,text,uuid,text) to authenticated;
revoke all privileges on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text) to authenticated;
revoke all privileges on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,integer,text,text) to authenticated;
revoke all privileges on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text) to authenticated;
revoke all privileges on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid) to authenticated;

alter table public.observatory_project_versions enable row level security;
alter table public.observatory_project_version_events enable row level security;

commit;
