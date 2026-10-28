begin;

-- Reuse the durable operation ledger; existing CRUD action names remain valid.
alter table public.observatory_agent_work_item_operations
  drop constraint observatory_agent_work_item_operations_action_check,
  add constraint observatory_agent_work_item_operations_action_check check (
    action in ('create', 'update', 'transition', 'assign', 'add_evidence', 'bind_execution')
  );

create function public.read_observatory_agent_work_item_operation(
  p_agent_id text, p_is_project_owner boolean, p_project_ref text,
  p_idempotency_key text, p_operation_agent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  receipt jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_agent_id is null or p_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
    or p_operation_agent_id is null or p_operation_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
    or p_project_ref is null or length(p_project_ref) > 160
    or p_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
  then raise exception 'OBSERVATORY_OPERATION_BOUNDARY_INVALID' using errcode = '22023'; end if;
  -- Owner authority is attested only by the authenticated server's current Registry.
  if p_operation_agent_id <> p_agent_id and p_is_project_owner is distinct from true then
    raise exception 'OBSERVATORY_FORBIDDEN' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'operationId', o.id, 'operationKind', o.action, 'actorAgentId', o.agent_id,
    'projectRef', p_project_ref, 'idempotencyKey', o.idempotency_key,
    'requestFingerprint', o.request_fingerprint, 'workItemId', o.work_item_id,
    'result', o.result, 'createdAt', o.created_at
  ) into receipt
  from public.observatory_agent_work_item_operations o
  join public.observatory_work_items w on w.id = o.work_item_id
  where o.agent_id = p_operation_agent_id and o.idempotency_key = p_idempotency_key
    and coalesce(w.project_key, w.project_ref) = p_project_ref
    and coalesce(o.result #>> '{workItem,project_key}', o.result #>> '{workItem,project_ref}') = p_project_ref;
  -- Missing, cross-project, or invisible operations all return null, never raw rows.
  return receipt;
end;
$$;

create function public.bind_observatory_work_item_execution_as_agent(
  p_agent_id text, p_is_project_owner boolean, p_project_ref text,
  p_work_item_id uuid, p_expected_version integer, p_expected_project_revision text,
  p_plan_revision integer, p_stage_id text, p_work_package_id text,
  p_idempotency_key text, p_request_fingerprint text, p_intake_fingerprint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_operation public.observatory_agent_work_item_operations;
  current_item public.observatory_work_items;
  updated_item public.observatory_work_items;
  selected_version public.observatory_project_versions;
  operation_result jsonb;
  receipt jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_is_project_owner is distinct from true then
    raise exception 'OBSERVATORY_FORBIDDEN' using errcode = '42501';
  end if;
  if p_agent_id is null or p_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
    or p_project_ref is null or length(p_project_ref) > 160
    or p_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
    or p_work_item_id is null or p_expected_version is null or p_expected_version < 1
    or p_expected_project_revision is null or p_expected_project_revision !~ '^[a-f0-9]{32}$'
    or p_plan_revision is null or p_plan_revision < 0
    or p_stage_id is null or length(btrim(p_stage_id)) not between 1 and 128
    or p_work_package_id is null or length(btrim(p_work_package_id)) not between 1 and 128
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[a-f0-9]{64}$'
    or (p_intake_fingerprint is not null and p_intake_fingerprint !~ '^[a-f0-9]{64}$')
  then raise exception 'OBSERVATORY_BINDING_BOUNDARY_INVALID' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_agent_id || ':' || p_idempotency_key, 0));
  select * into existing_operation from public.observatory_agent_work_item_operations
    where agent_id = p_agent_id and idempotency_key = p_idempotency_key;
  if existing_operation.id is not null then
    if existing_operation.action <> 'bind_execution'
      or existing_operation.work_item_id <> p_work_item_id
      or existing_operation.request_fingerprint is distinct from p_request_fingerprint
      or coalesce(existing_operation.result #>> '{workItem,project_key}', existing_operation.result #>> '{workItem,project_ref}') is distinct from p_project_ref
    then raise exception 'OBSERVATORY_IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    receipt := public.read_observatory_agent_work_item_operation(p_agent_id, true, p_project_ref, p_idempotency_key, p_agent_id);
    if receipt is null then raise exception 'OBSERVATORY_NOT_FOUND' using errcode = 'P0002'; end if;
    -- Replay the immutable original result before checking stale concurrency tokens.
    return existing_operation.result || jsonb_build_object('operation', receipt);
  end if;

  -- Blocks INSERT/UPDATE/DELETE, including legacy RPCs that know no project lock.
  -- Acquire before reading the complete revision, retain until transaction commit.
  lock table public.observatory_work_items in share row exclusive mode;
  if (public.read_observatory_project_work_snapshot(p_project_ref) ->> 'snapshot_revision')
    is distinct from p_expected_project_revision then
    raise exception 'OBSERVATORY_SNAPSHOT_DRIFT' using errcode = '40001';
  end if;
  select * into current_item from public.observatory_work_items where id = p_work_item_id for update;
  if current_item.id is null then raise exception 'OBSERVATORY_NOT_FOUND' using errcode = 'P0002'; end if;
  if coalesce(current_item.project_key, current_item.project_ref) is distinct from p_project_ref then
    raise exception 'OBSERVATORY_FORBIDDEN' using errcode = '42501'; end if;
  if current_item.version <> p_expected_version then
    raise exception 'OBSERVATORY_VERSION_CONFLICT' using errcode = '40001'; end if;
  if current_item.state in ('in_progress', 'review', 'done')
    or current_item.state in ('blocked', 'waiting') then
    raise exception 'OBSERVATORY_INVALID_TRANSITION' using errcode = '23514'; end if;
  select * into selected_version from public.observatory_project_versions
    where id = current_item.project_version_id for share;
  if selected_version.id is null or selected_version.project_key is distinct from p_project_ref
    or selected_version.status in ('released', 'archived', 'cancelled') then
    raise exception 'OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED' using errcode = '23514'; end if;

  update public.observatory_work_items set project_key = p_project_ref,
    plan_revision = p_plan_revision, stage_id = btrim(p_stage_id), work_package_id = btrim(p_work_package_id),
    version = current_item.version + 1
    where id = p_work_item_id and version = p_expected_version returning * into strict updated_item;
  operation_result := jsonb_build_object('workItem', to_jsonb(updated_item), 'intakeFingerprint', p_intake_fingerprint);
  insert into public.observatory_work_item_events (work_item_id, event_type, actor_id, agent_id, data)
    values (updated_item.id, 'updated', null, p_agent_id,
      jsonb_build_object('action', 'bind_execution', 'before', to_jsonb(current_item),
        'after', to_jsonb(updated_item), 'idempotencyKey', p_idempotency_key,
        'requestFingerprint', p_request_fingerprint, 'intakeFingerprint', p_intake_fingerprint,
        'expectedProjectRevision', p_expected_project_revision));
  insert into public.observatory_agent_work_item_operations
    (agent_id, idempotency_key, action, request_fingerprint, work_item_id, result)
    values (p_agent_id, p_idempotency_key, 'bind_execution', p_request_fingerprint, updated_item.id, operation_result);
  receipt := public.read_observatory_agent_work_item_operation(p_agent_id, true, p_project_ref, p_idempotency_key, p_agent_id);
  return operation_result || jsonb_build_object('operation', receipt);
end;
$$;

revoke all on function public.read_observatory_agent_work_item_operation(text, boolean, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.read_observatory_agent_work_item_operation(text, boolean, text, text, text) to service_role;
revoke all on function public.bind_observatory_work_item_execution_as_agent(text, boolean, text, uuid, integer, text, integer, text, text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.bind_observatory_work_item_execution_as_agent(text, boolean, text, uuid, integer, text, integer, text, text, text, text, text) to service_role;

commit;
