alter table public.observatory_work_items
  add column project_key text,
  add column plan_revision integer,
  add column stage_id text,
  add column work_package_id text,
  add constraint observatory_work_items_project_control_binding_check check (
    (
      project_key is null and plan_revision is null
      and stage_id is null and work_package_id is null
    ) or (
      project_key is not null and plan_revision is not null
      and stage_id is not null and work_package_id is not null
    )
  ),
  add constraint observatory_work_items_project_key_check check (
    project_key is null or length(project_key) between 3 and 256
  ),
  add constraint observatory_work_items_plan_revision_check check (
    plan_revision is null or plan_revision >= 0
  ),
  add constraint observatory_work_items_stage_id_check check (
    stage_id is null or length(stage_id) between 1 and 128
  ),
  add constraint observatory_work_items_work_package_id_check check (
    work_package_id is null or length(work_package_id) between 1 and 128
  );

create index observatory_work_items_project_control_binding_idx
on public.observatory_work_items(project_key, plan_revision, stage_id, work_package_id)
where project_key is not null;

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
  uuid, integer, text, text, text, text, text, uuid, text, text, text, integer, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.update_observatory_work_item(
  uuid, integer, text, text, text, text, text, uuid, text, text, text, integer, text, text
) to authenticated;
