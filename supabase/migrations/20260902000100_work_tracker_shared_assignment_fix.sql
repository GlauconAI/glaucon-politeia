begin;

with canonical_assignments(work_item_id, assigned_agent_id) as (
  values
    ('7ec24fc2-4517-45e8-9fff-59da9660532c'::uuid, 'socrates'),
    ('62993283-3d3c-4884-bb56-ac4d5e5911af'::uuid, 'aristotle'),
    ('80cb0af9-fdcc-41ab-9ddd-0dc08fd747ee'::uuid, 'socrates'),
    ('53680244-b2bc-472b-ad0e-4b18a2e073b9'::uuid, 'plato'),
    ('456cc011-9f30-4794-913e-a2fd92ed5f0d'::uuid, 'socrates'),
    ('d833544e-befc-4eac-b847-b291f94a9fa9'::uuid, 'aristotle'),
    ('2a83974d-198b-4af3-a261-0dcefd8d7087'::uuid, 'amou'),
    ('0b929723-a59a-4c28-a326-bf4cc27d1a10'::uuid, 'herodotus'),
    ('5ef3c519-d465-40b0-b7ae-38e9dc82a58d'::uuid, 'aristotle'),
    ('e7844d81-8666-48da-92b7-b17459773bc5'::uuid, 'plato'),
    ('41aa98d5-b8a8-41e6-a94b-ee59201bf03a'::uuid, 'amou'),
    ('0c260835-468a-46e5-a902-6a9e18cc64d3'::uuid, 'herodotus'),
    ('c027673f-1ed5-49a8-b73e-2260ca8efe36'::uuid, 'alfred'),
    ('8f269a10-573a-471b-8492-84536cfc163b'::uuid, 'alfred'),
    ('44c2536f-0956-4f96-b014-fd31d1cd9580'::uuid, 'amou'),
    ('a60c07b0-caf9-4619-aeab-96881f821d78'::uuid, 'socrates'),
    ('ace3691d-dad9-4574-a32b-843a4491c2ab'::uuid, 'socrates'),
    ('c6e0a361-37bc-45e4-90a9-29bed78ec067'::uuid, 'plato'),
    ('fb3c9b95-dfd5-45fb-828f-997c010d94ee'::uuid, 'socrates'),
    ('39a0f72a-45d3-4c88-9c29-3ea36fe3e0f0'::uuid, 'socrates')
), corrected as (
  update public.observatory_work_items as item
  set assigned_agent_id = assignment.assigned_agent_id,
    version = item.version + 1
  from canonical_assignments as assignment
  where item.id = assignment.work_item_id
    and coalesce(item.project_key, item.project_ref) = 'shared/asgard-archaea-gacha-game'
    and item.assigned_agent_id = 'shared'
  returning item.id, item.created_by, item.assigned_agent_id, item.version
)
insert into public.observatory_work_item_events (
  work_item_id,
  event_type,
  actor_id,
  data
)
select
  corrected.id,
  'updated',
  corrected.created_by,
  jsonb_build_object(
    'reason', 'work-tracker-shared-assignment-fix',
    'before', jsonb_build_object(
      'assigned_agent_id', 'shared',
      'version', corrected.version - 1
    ),
    'after', jsonb_build_object(
      'assigned_agent_id', corrected.assigned_agent_id,
      'version', corrected.version
    )
  )
from corrected;

do $$
declare
  corrected_count integer;
begin
  select count(*)::integer
  into corrected_count
  from public.observatory_work_item_events
  where data ->> 'reason' = 'work-tracker-shared-assignment-fix';

  if corrected_count <> 20 then
    raise exception 'Expected 20 audited assignment corrections, found %', corrected_count;
  end if;
end;
$$;

alter table public.observatory_work_items
  add constraint observatory_work_items_assigned_agent_not_shared_check check (
    assigned_agent_id <> 'shared'
  );

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
  calling_user uuid;
  normalized_type text := btrim(p_type);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_project_ref text := btrim(p_project_ref);
  normalized_assigned_agent_id text := btrim(coalesce(p_assigned_agent_id, ''));
  normalized_state text := 'inbox';
  normalized_idempotency_key text := btrim(p_idempotency_key);
  created_item public.observatory_work_items;
  existing_item public.observatory_work_items;
begin
  calling_user := auth.uid();

  if calling_user is null or not public.is_current_user_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if normalized_project_ref is null
    or length(normalized_project_ref) not between 1 and 160
    or normalized_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'OBSERVATORY_PROJECT_REQUIRED' using errcode = '22023';
  end if;

  if normalized_assigned_agent_id = 'shared'
    or normalized_assigned_agent_id !~ '^[a-z][a-z0-9-]{0,79}$'
  then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_INVALID' using errcode = '22023';
  end if;

  insert into public.observatory_work_items (
    type,
    title,
    description,
    state,
    project_ref,
    assigned_agent_id,
    idempotency_key,
    created_by
  )
  values (
    normalized_type,
    normalized_title,
    normalized_description,
    normalized_state,
    normalized_project_ref,
    normalized_assigned_agent_id,
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
      or existing_item.project_ref is distinct from normalized_project_ref
      or existing_item.assigned_agent_id is distinct from normalized_assigned_agent_id
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
      'title', created_item.title,
      'project_ref', created_item.project_ref,
      'assigned_agent_id', created_item.assigned_agent_id
    )
  );

  return created_item;
end;
$$;

revoke all privileges on function public.create_observatory_work_item(
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(
  text, text, text, text, text, text
) to authenticated;

create or replace function public.create_observatory_work_item(
  p_type text,
  p_title text,
  p_description text,
  p_project_ref text,
  p_idempotency_key text
)
returns public.observatory_work_items
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_project_ref text := btrim(p_project_ref);
  inferred_assigned_agent_id text := split_part(btrim(p_project_ref), '/', 1);
begin
  if inferred_assigned_agent_id = 'shared' then
    raise exception 'OBSERVATORY_ASSIGNED_AGENT_REQUIRED' using errcode = '22023';
  end if;

  return public.create_observatory_work_item(
    p_type,
    p_title,
    p_description,
    normalized_project_ref,
    inferred_assigned_agent_id,
    p_idempotency_key
  );
end;
$$;

revoke all privileges on function public.create_observatory_work_item(
  text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(
  text, text, text, text, text
) to authenticated;

commit;
