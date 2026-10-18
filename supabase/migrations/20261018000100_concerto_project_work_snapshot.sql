begin;

-- One RPC call returns one PostgreSQL statement snapshot. No LIMIT or
-- cross-request cursor can silently truncate the Project's Work universe.
create function public.read_observatory_project_work_snapshot(p_project_key text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  with items as materialized (
    select jsonb_build_object(
      'id', w.id,
      'version', w.version,
      'state', w.state,
      'project_key', coalesce(w.project_key, w.project_ref),
      'project_version_id', w.project_version_id,
      'version_binding_kind', w.version_binding_kind,
      'plan_revision', w.plan_revision,
      'stage_id', w.stage_id,
      'work_package_id', w.work_package_id,
      'assigned_agent_id', w.assigned_agent_id,
      'owner_id', w.owner_id,
      'updated_at', w.updated_at
    ) as item, w.id
    from public.observatory_work_items w
    where coalesce(w.project_key, w.project_ref) = p_project_key
  ), complete as (
    select count(*)::integer as total_count,
      coalesce(jsonb_agg(item order by id), '[]'::jsonb) as all_items
    from items
  )
  select case
    when auth.role() <> 'service_role'
      or p_project_key is null
      or p_project_key !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
    then null
    else jsonb_build_object(
      'schema_version', 'concerto-project-work-snapshot-v1',
      'project_key', p_project_key,
      'snapshot_revision', md5(p_project_key || ':' || all_items::text),
      'snapshot_as_of', statement_timestamp(),
      'total_count', total_count,
      'page_count', 1,
      'complete', true,
      'next_cursor', null,
      'items', all_items
    )
  end
  from complete;
$$;

revoke all on function public.read_observatory_project_work_snapshot(text)
from public, anon, authenticated, service_role;
grant execute on function public.read_observatory_project_work_snapshot(text)
to service_role;

commit;
