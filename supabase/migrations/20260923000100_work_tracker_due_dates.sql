begin;

alter table public.observatory_work_items
  add column due_on date;

create index observatory_work_items_open_due_on_idx
  on public.observatory_work_items (due_on, priority, project_ref)
  where due_on is not null and state <> 'done';

drop function if exists public.update_observatory_work_item(
  uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text
);

create function public.update_observatory_work_item(
  p_work_item_id uuid, p_expected_version integer, p_type text, p_title text,
  p_description text, p_acceptance_criteria text, p_priority text, p_owner_id uuid,
  p_assigned_agent_id text, p_project_ref text, p_milestone_ref text, p_project_key text,
  p_plan_revision integer, p_stage_id text, p_work_package_id text,
  p_project_version_id uuid, p_version_binding_kind text, p_due_on date
)
returns public.observatory_work_items
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  calling_user uuid := auth.uid();
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  binding_count integer;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into current_item
  from public.observatory_work_items
  where id=p_work_item_id
  for update;
  if current_item.id is null then
    raise exception 'OBSERVATORY_WORK_ITEM_NOT_FOUND' using errcode='P0002';
  end if;
  if p_expected_version is null or current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode='40001';
  end if;
  if p_version_binding_kind not in ('required','optional') then
    raise exception 'OBSERVATORY_VERSION_BINDING_KIND_INVALID' using errcode='22023';
  end if;
  if btrim(coalesce(p_assigned_agent_id,'')) = 'shared'
    or btrim(coalesce(p_assigned_agent_id,'')) !~ '^[a-z][a-z0-9-]{0,79}$' then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode='22023';
  end if;
  binding_count :=
    (nullif(btrim(coalesce(p_project_key,'')),'') is not null)::integer
    + (p_plan_revision is not null)::integer
    + (nullif(btrim(coalesce(p_stage_id,'')),'') is not null)::integer
    + (nullif(btrim(coalesce(p_work_package_id,'')),'') is not null)::integer;
  if binding_count not in (0,4) then
    raise exception 'OBSERVATORY_PROJECT_CONTROL_BINDING_INVALID' using errcode='22023';
  end if;

  update public.observatory_work_items
  set type=btrim(p_type),
    title=btrim(p_title),
    description=btrim(coalesce(p_description,'')),
    acceptance_criteria=btrim(coalesce(p_acceptance_criteria,'')),
    priority=nullif(btrim(coalesce(p_priority,'')),''),
    owner_id=p_owner_id,
    assigned_agent_id=btrim(p_assigned_agent_id),
    project_ref=nullif(btrim(coalesce(p_project_ref,'')),''),
    milestone_ref=nullif(btrim(coalesce(p_milestone_ref,'')),''),
    project_key=nullif(btrim(coalesce(p_project_key,'')),''),
    plan_revision=p_plan_revision,
    stage_id=nullif(btrim(coalesce(p_stage_id,'')),''),
    work_package_id=nullif(btrim(coalesce(p_work_package_id,'')),''),
    project_version_id=p_project_version_id,
    version_binding_kind=p_version_binding_kind,
    due_on=p_due_on,
    version=current_item.version+1
  where id=current_item.id and version=p_expected_version
  returning * into strict updated_item;

  insert into public.observatory_work_item_events(work_item_id,event_type,actor_id,data)
  values(updated_item.id,'updated',calling_user,jsonb_build_object(
    'before',jsonb_build_object(
      'id',current_item.id,'type',current_item.type,'title',current_item.title,
      'description',current_item.description,'state',current_item.state,'version',current_item.version,
      'created_by',current_item.created_by,'created_at',current_item.created_at,'updated_at',current_item.updated_at,
      'priority',current_item.priority,'owner_id',current_item.owner_id,
      'acceptance_criteria',current_item.acceptance_criteria,'project_ref',current_item.project_ref,
      'milestone_ref',current_item.milestone_ref,'due_on',current_item.due_on,'risk_level',current_item.risk_level,
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
      'milestone_ref',updated_item.milestone_ref,'due_on',updated_item.due_on,'risk_level',updated_item.risk_level,
      'assigned_agent_id',updated_item.assigned_agent_id,'project_key',updated_item.project_key,
      'plan_revision',updated_item.plan_revision,'stage_id',updated_item.stage_id,
      'work_package_id',updated_item.work_package_id,'project_version_id',updated_item.project_version_id,
      'version_binding_kind',updated_item.version_binding_kind
    )
  ));
  return updated_item;
end;
$$;

-- Preserve the previous canonical signature for already-deployed callers. It
-- retains the current due date while the new signature makes due_on explicit.
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
declare
  calling_user uuid := auth.uid();
  current_item public.observatory_work_items;
begin
  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  select * into current_item
  from public.observatory_work_items
  where id=p_work_item_id;
  return public.update_observatory_work_item(
    p_work_item_id, p_expected_version, p_type, p_title, p_description,
    p_acceptance_criteria, p_priority, p_owner_id, p_assigned_agent_id,
    p_project_ref, p_milestone_ref, p_project_key, p_plan_revision, p_stage_id,
    p_work_package_id, p_project_version_id, p_version_binding_kind, current_item.due_on
  );
end;
$$;

revoke all privileges on function public.update_observatory_work_item(
  uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text,date
) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(
  uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text,date
) to authenticated;

revoke all privileges on function public.update_observatory_work_item(
  uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.update_observatory_work_item(
  uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text
) to authenticated;

commit;
