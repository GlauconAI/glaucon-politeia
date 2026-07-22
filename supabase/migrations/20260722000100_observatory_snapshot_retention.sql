alter table public.observatory_snapshots
add column release_evidence boolean not null default false;

create index observatory_snapshots_release_evidence_generated_at_idx
on public.observatory_snapshots(release_evidence, generated_at desc);

create or replace function public.prevent_observatory_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.observatory_snapshot_mutation', true) = 'retention_rpc' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Observatory snapshots are immutable';
end;
$$;

create or replace function public.prune_observatory_snapshots(p_keep integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  deleted_count integer;
begin
  if p_keep is null or p_keep < 1 or p_keep > 365 then
    raise exception 'OBSERVATORY_RETENTION_INVALID' using errcode = '22023';
  end if;

  perform set_config('app.observatory_snapshot_mutation', 'retention_rpc', true);
  with ranked as (
    select id,
      row_number() over (order by generated_at desc, created_at desc, id desc) as retention_rank
    from public.observatory_snapshots
    where release_evidence = false
  ), doomed as (
    select id from ranked where retention_rank > p_keep
  )
  delete from public.observatory_snapshots as snapshot
  using doomed
  where snapshot.id = doomed.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

create or replace function public.mark_observatory_snapshot_release(p_digest text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  updated_count integer;
begin
  if p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'OBSERVATORY_DIGEST_INVALID' using errcode = '22023';
  end if;

  perform set_config('app.observatory_snapshot_mutation', 'retention_rpc', true);
  update public.observatory_snapshots
  set release_evidence = true
  where source_digest = p_digest;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all privileges on function public.prune_observatory_snapshots(integer)
from public, anon, authenticated, service_role;
revoke all privileges on function public.mark_observatory_snapshot_release(text)
from public, anon, authenticated, service_role;
grant execute on function public.prune_observatory_snapshots(integer)
to service_role;
grant execute on function public.mark_observatory_snapshot_release(text)
to service_role;
