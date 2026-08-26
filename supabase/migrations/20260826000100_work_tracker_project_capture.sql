begin;

revoke all privileges on function public.create_observatory_work_item(text, text, text, text)
from public, anon, authenticated, service_role;
drop function if exists public.create_observatory_work_item(text, text, text, text);

create function public.create_observatory_work_item(
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
  calling_user uuid;
  normalized_type text := btrim(p_type);
  normalized_title text := btrim(p_title);
  normalized_description text := btrim(coalesce(p_description, ''));
  normalized_project_ref text := btrim(p_project_ref);
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
    project_ref,
    idempotency_key,
    created_by
  )
  values (
    normalized_type,
    normalized_title,
    normalized_description,
    normalized_state,
    normalized_project_ref,
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
      'project_ref', created_item.project_ref
    )
  );

  return created_item;
end;
$$;

revoke all privileges on function public.create_observatory_work_item(text, text, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_observatory_work_item(text, text, text, text, text)
to authenticated;

commit;
