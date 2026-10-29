begin;

-- Association metadata only. Never UPDATE the frozen Version/Item rows.
create table public.observatory_project_associations (
 source_project_key text primary key,
 target_project_key text not null unique,
 actor_agent_id text not null check (actor_agent_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 catalog_operation_id text not null check (length(catalog_operation_id) between 1 and 128 and catalog_operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'),
 catalog_receipt_sha256 text not null check (catalog_receipt_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default statement_timestamp(),
 check (source_project_key <> target_project_key),
 check (length(source_project_key) between 3 and 160 and source_project_key ~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'),
 check (length(target_project_key) between 3 and 160 and target_project_key ~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$')
);
create table public.observatory_project_association_operations (
 id uuid primary key default gen_random_uuid(),
 actor_agent_id text not null,
 idempotency_key text not null,
 request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
 source_project_key text not null references public.observatory_project_associations(source_project_key),
 result jsonb not null,
 created_at timestamptz not null default statement_timestamp(),
 unique(actor_agent_id,idempotency_key)
);
alter table public.observatory_project_associations enable row level security;
alter table public.observatory_project_association_operations enable row level security;
revoke all on public.observatory_project_associations,public.observatory_project_association_operations from public,anon,authenticated,service_role;

create function public.read_observatory_project_association_snapshot(p_source_key text,p_target_key text)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
 with association as materialized (
   select to_jsonb(a) value from public.observatory_project_associations a
   where a.source_project_key=p_source_key and a.target_project_key=p_target_key
 ), versions as materialized (
   select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('original_project_key',v.project_key,
     'effective_project_key',case when exists(select 1 from association) then p_target_key else v.project_key end) order by v.id),'[]'::jsonb) value,
     count(*)::integer n from public.observatory_project_versions v where v.project_key in (p_source_key,p_target_key)
 ), items as materialized (
   select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('original_project_key',coalesce(w.project_key,w.project_ref),
     'effective_project_key',case when exists(select 1 from association) then p_target_key else coalesce(w.project_key,w.project_ref) end) order by w.id),'[]'::jsonb) value,
     count(*)::integer n from public.observatory_work_items w where coalesce(w.project_key,w.project_ref) in (p_source_key,p_target_key)
 )
 select case when auth.role() is distinct from 'service_role' or p_source_key is null or p_target_key is null or p_source_key=p_target_key
   or length(p_source_key)>160 or length(p_target_key)>160
   or p_source_key !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
   or p_target_key !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$' then null
 else jsonb_build_object(
  'schema_version','concerto-project-association-snapshot-v1','source_project_key',p_source_key,'target_project_key',p_target_key,
  'snapshot_revision',md5(jsonb_build_array(p_source_key,p_target_key,(select value from association),versions.value,items.value)::text),
  'snapshot_as_of',statement_timestamp(),'complete',true,'next_cursor',null,'page_count',1,
  'version_count',versions.n,'item_count',items.n,'versions',versions.value,'items',items.value,'association',(select value from association)) end
 from versions cross join items;
$$;

create function public.associate_observatory_project_as_agent(
 p_agent_id text,p_is_project_owner boolean,p_source_key text,p_target_key text,
 p_catalog_operation_id text,p_catalog_receipt_sha256 text,p_expected_revision text,p_idempotency_key text
) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare
 fingerprint text; previous public.observatory_project_association_operations%rowtype;
 association public.observatory_project_associations%rowtype; current_snapshot jsonb;
 operation_id uuid:=gen_random_uuid(); operation_time timestamptz:=statement_timestamp(); result jsonb;
begin
 if auth.role() is distinct from 'service_role' or p_is_project_owner is distinct from true then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if p_agent_id is null or p_agent_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
   or p_source_key is null or p_target_key is null or p_source_key=p_target_key
   or length(p_source_key)>160 or length(p_target_key)>160
   or p_source_key !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
   or p_target_key !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
   or p_catalog_operation_id is null or length(p_catalog_operation_id) not between 1 and 128 or p_catalog_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
   or p_catalog_receipt_sha256 is null or p_catalog_receipt_sha256 !~ '^[a-f0-9]{64}$'
   or p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{32}$'
   or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
 then raise exception 'INVALID_REQUEST' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_agent_id,p_source_key,p_target_key,p_catalog_operation_id,p_catalog_receipt_sha256,p_expected_revision)::text,'UTF8')),'hex');
 -- Serializes overlapping and same-idempotency writes. SHARE locks also cover
 -- legacy CRUD writers that do not know the new association metadata exists.
 lock table public.observatory_project_associations,public.observatory_project_association_operations in share row exclusive mode;
 select * into previous from public.observatory_project_association_operations where actor_agent_id=p_agent_id and idempotency_key=p_idempotency_key;
 if found then
   if previous.request_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
   return previous.result;
 end if;
 if exists(select 1 from public.observatory_project_associations a where
   (a.source_project_key in (p_source_key,p_target_key) or a.target_project_key in (p_source_key,p_target_key))
   and (a.source_project_key<>p_source_key or a.target_project_key<>p_target_key))
 then raise exception 'ASSOCIATION_CONFLICT' using errcode='23505'; end if;
 select * into association from public.observatory_project_associations where source_project_key=p_source_key;
 if found and (association.catalog_operation_id<>p_catalog_operation_id or association.catalog_receipt_sha256<>p_catalog_receipt_sha256)
 then raise exception 'ASSOCIATION_CONFLICT' using errcode='23505'; end if;
 lock table public.observatory_project_versions,public.observatory_work_items in share mode;
 current_snapshot:=public.read_observatory_project_association_snapshot(p_source_key,p_target_key);
 if current_snapshot->>'snapshot_revision' is distinct from p_expected_revision then raise exception 'SNAPSHOT_DRIFT' using errcode='40001'; end if;
 if exists(select 1 from public.observatory_project_versions where project_key in (p_source_key,p_target_key) group by lower(version_label) having count(*)>1)
   or (select count(*) from public.observatory_project_versions where project_key in (p_source_key,p_target_key) and is_backlog)>1
 then raise exception 'ASSOCIATION_CONFLICT' using errcode='23505'; end if;
 if association.source_project_key is null then
  insert into public.observatory_project_associations(source_project_key,target_project_key,actor_agent_id,catalog_operation_id,catalog_receipt_sha256)
  values(p_source_key,p_target_key,p_agent_id,p_catalog_operation_id,p_catalog_receipt_sha256) returning * into association;
 end if;
 result:=jsonb_build_object('association',to_jsonb(association),'operation',jsonb_build_object(
  'id',operation_id,'actor_agent_id',p_agent_id,'idempotency_key',p_idempotency_key,'request_fingerprint',fingerprint,
  'source_project_key',p_source_key,'target_project_key',p_target_key,'expected_revision',p_expected_revision,'created_at',operation_time));
 insert into public.observatory_project_association_operations(id,actor_agent_id,idempotency_key,request_fingerprint,source_project_key,result,created_at)
 values(operation_id,p_agent_id,p_idempotency_key,fingerprint,p_source_key,result,operation_time);
 return result;
end;
$$;
revoke all on function public.read_observatory_project_association_snapshot(text,text) from public,anon,authenticated,service_role;
revoke all on function public.associate_observatory_project_as_agent(text,boolean,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.read_observatory_project_association_snapshot(text,text) to service_role;
grant execute on function public.associate_observatory_project_as_agent(text,boolean,text,text,text,text,text,text) to service_role;
commit;
