#!/usr/bin/env node
// Explicit disposable loopback database only. Never reads repository .env files.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const raw = process.env.CONCERTO_DISPOSABLE_PG_URL;
const url = new URL(raw ?? 'https://invalid');
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || +url.port < 1024 || url.pathname !== '/postgres' || url.search || url.hash) throw new Error('Explicit disposable loopback PostgreSQL /postgres required');
const options = { max: 5, connect_timeout: 5, idle_timeout: 2, onnotice: () => {} };
const admin = postgres(raw, options);
const database = `concerto_assoc_test_${process.pid}_${randomBytes(6).toString('hex')}`;
let sql; let created = false;
const source = 'socrates/fixture'; const target = 'shared/fixture';
const checks = [];
const pass = (name) => { checks.push(name); process.stdout.write(`PASS ${name}\n`); };
const migration = (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const denied = (pattern, action) => assert.rejects(action, (e) => { assert.match(e.message, pattern); return true; });
async function service(action, role = 'service_role') {
  return sql.begin(async (tx) => { await tx.unsafe(`set local role ${role}`); await tx`select set_config('request.jwt.claim.role',${role},true)`; return action(tx); });
}
async function snapshot(s = source, t = target) { return service(async (tx) => (await tx`select public.read_observatory_project_association_snapshot(${s},${t}) as value`)[0].value); }
async function associate(tx, input) {
  return (await tx`select public.associate_observatory_project_as_agent('main', ${input.owner ?? true}, ${input.source ?? source}, ${input.target ?? target}, ${input.operation ?? 'catalog:fixture'}, ${'a'.repeat(64)}, ${input.revision}, ${input.key}) as value`)[0].value;
}
async function protectedState() { return (await sql`select
 md5((select coalesce(jsonb_agg(to_jsonb(v) order by id),'[]')::text from public.observatory_project_versions v)) versions,
 md5((select coalesce(jsonb_agg(to_jsonb(w) order by id),'[]')::text from public.observatory_work_items w)) items`)[0]; }
try {
  await admin.unsafe(`create database "${database}"`); created = true;
  const connection = new URL(raw); connection.pathname = `/${database}`; sql = postgres(connection.toString(), options);
  await sql.unsafe(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
  end $$;
  create schema auth; grant usage on schema auth,public to anon,authenticated,service_role;
  create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
  create table public.observatory_project_versions(id uuid primary key, project_key text not null, version_label text not null, status text not null, row_version integer not null default 1, is_backlog boolean not null default false, updated_by uuid, updated_at timestamptz not null default now());
  create table public.observatory_work_items(id uuid primary key, project_key text, project_ref text, project_version_id uuid references public.observatory_project_versions, version integer not null default 1, state text not null default 'done',
   type text default 'feature',title text default 'fixture',description text default '',acceptance_criteria text default '',priority text,owner_id uuid,assigned_agent_id text,milestone_ref text,plan_revision integer,stage_id text,work_package_id text,version_binding_kind text default 'required',updated_at timestamptz not null default now());
  revoke all on public.observatory_project_versions,public.observatory_work_items from public,anon,authenticated,service_role;`);
  const versionId = randomUUID();
  await sql`insert into public.observatory_project_versions(id,project_key,version_label,status) values (${versionId},${source},'1.0.0','released')`;
  await sql`insert into public.observatory_work_items(id,project_key,project_version_id) select gen_random_uuid(),${source},${versionId} from generate_series(1,501)`;
  const contract = await migration('20260902000300_work_tracker_project_version_contract_v1.sql');
  for (const [start, end] of [
    ['create or replace function public.protect_observatory_project_version_history()', 'for each row execute function public.protect_observatory_project_version_history();'],
    ['create or replace function public.validate_observatory_work_item_project_version()', 'for each row execute function public.validate_observatory_work_item_project_version();'],
  ]) { const a = contract.indexOf(start); const b = contract.indexOf(end, a); assert.ok(a >= 0 && b > a); await sql.unsafe(contract.slice(a,b+end.length)); }
  const before = await protectedState();
  // The first red run fails here because this candidate migration does not yet exist.
  await sql.unsafe('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,statements text[],name text)');
  const {runProjectAssociationMigration}=await import('../observatory/deploy-concerto-project-associations.ts');
  const candidate=await migration('20261029000100_concerto_project_associations.sql');
  assert.equal((await runProjectAssociationMigration(sql,'check',candidate)).rolledBack,true);
  assert.equal((await sql`select to_regclass('public.observatory_project_associations') is null absent,(select count(*)::int from supabase_migrations.schema_migrations) history`)[0].absent,true);
  assert.equal((await sql`select count(*)::int n from supabase_migrations.schema_migrations`)[0].n,0);
  assert.equal((await runProjectAssociationMigration(sql,'apply',candidate)).committed,true);
  assert.equal((await runProjectAssociationMigration(sql,'status',candidate)).applied,true);
  assert.equal((await runProjectAssociationMigration(sql,'check',candidate)).rolledBack,true);
  pass('exact migration launcher rollback/apply/status preserve business rows and verify grants');
  assert.deepEqual(await protectedState(), before);
  const initial = await snapshot(); assert.equal(initial.item_count,501); assert.equal(initial.items.length,501); assert.equal(initial.version_count,1); assert.equal(initial.versions[0].status,'released');
  pass('actual frozen triggers remain installed; full 501-item/released-version snapshot');
  for (const role of ['anon','authenticated']) {
    await denied(/permission denied/, () => service((tx) => tx`select public.read_observatory_project_association_snapshot(${source},${target})`,role));
    await denied(/permission denied/, () => service((tx) => associate(tx,{revision:initial.snapshot_revision,key:'denied'}),role));
  }
  for (const table of ['observatory_project_associations','observatory_project_association_operations']) await denied(/permission denied/, () => service((tx) => tx.unsafe(`select * from public.${table}`)));
  await denied(/FORBIDDEN/, () => service((tx) => associate(tx,{owner:false,revision:initial.snapshot_revision,key:'not-owner'})));
  pass('service-only functions, no direct ledger/table grants and explicit owner guard');
  const request = {revision:initial.snapshot_revision,key:'fixture:associate'};
  const result = await service((tx) => associate(tx,request));
  assert.equal(result.association.target_project_key,target); assert.equal(result.operation.actor_agent_id,'main');
  assert.deepEqual(await service((tx) => associate(tx,request)), result);
  await denied(/IDEMPOTENCY_CONFLICT/, () => service((tx) => associate(tx,{...request,operation:'catalog:changed'})));
  const after = await snapshot(); assert.notEqual(after.snapshot_revision,initial.snapshot_revision);
  assert.equal(after.items.every((r) => r.original_project_key===source && r.effective_project_key===target),true);
  assert.equal(after.versions[0].effective_project_key,target);
  const repeat = await service((tx) => associate(tx,{revision:after.snapshot_revision,key:'fixture:again'}));
  assert.deepEqual(repeat.association,result.association);
  assert.deepEqual(await protectedState(), before);
  pass('association/replay keep original IDs, full rows, timestamps and frozen history byte-identical');
  await denied(/SNAPSHOT_DRIFT/, () => service((tx) => associate(tx,{revision:initial.snapshot_revision,key:'stale'})));
  for (const pair of [[target,source],[source,'shared/other'],['socrates/other',target],[target,'shared/other']]) await denied(/ASSOCIATION_CONFLICT/, () => service((tx) => associate(tx,{source:pair[0],target:pair[1],revision:'b'.repeat(32),key:`conflict:${randomUUID()}`})));
  pass('stale revision, reverse mapping, chain and overlapping identities fail closed');

  const s2='socrates/rollback',t2='shared/rollback'; const rollbackInitial=await snapshot(s2,t2);
  await sql.unsafe(`create function public.inject_association_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_AUDIT_FAILURE'; end $$; create trigger inject_association_audit_failure before insert on public.observatory_project_association_operations for each row execute function public.inject_association_audit_failure()`);
  await denied(/INJECTED_AUDIT_FAILURE/, () => service((tx) => associate(tx,{source:s2,target:t2,revision:rollbackInitial.snapshot_revision,key:'rollback'})));
  assert.equal((await snapshot(s2,t2)).association,null);
  assert.equal((await sql`select count(*)::int n from public.observatory_project_association_operations where idempotency_key='rollback'`)[0].n,0);
  await sql.unsafe('drop trigger inject_association_audit_failure on public.observatory_project_association_operations');
  pass('injected audit failure rolls mapping and operation back atomically');
  await denied(/HISTORY_IMMUTABLE/, () => sql`update public.observatory_project_versions set project_key=${target} where id=${versionId}`);
  await denied(/SCOPE_IMMUTABLE/, () => sql`update public.observatory_work_items set project_key=${target}`);
  assert.deepEqual(await protectedState(),before);
  pass('ordinary frozen Version and Item rewrites still rejected after association');
  const s3='socrates/duplicate',t3='shared/duplicate';
  await sql`insert into public.observatory_project_versions(id,project_key,version_label,status) values (${randomUUID()},${s3},'1.0.0','planned'),(${randomUUID()},${t3},'1.0.0','planned')`;
  await denied(/ASSOCIATION_CONFLICT/, () => service(async (tx) => associate(tx,{source:s3,target:t3,revision:(await snapshot(s3,t3)).snapshot_revision,key:'duplicate'})));
  pass('duplicate Version label cannot silently merge two project identities');
  const raceSource='socrates/race',raceTarget='shared/race';const race=await snapshot(raceSource,raceTarget);
  let lockedResolve, releaseResolve; const locked=new Promise((r)=>{lockedResolve=r;}); const release=new Promise((r)=>{releaseResolve=r;});
  const writer=sql.begin(async(tx)=>{await tx`insert into public.observatory_project_versions(id,project_key,version_label,status) values (${randomUUID()},${raceSource},'2.0.0','planned')`;lockedResolve();await release;});
  await locked;
  let pidResolve;const pidReady=new Promise((r)=>{pidResolve=r;});
  const contender=service(async(tx)=>{pidResolve((await tx`select pg_backend_pid() pid`)[0].pid);return associate(tx,{source:raceSource,target:raceTarget,revision:race.snapshot_revision,key:'race'});});
  const rejected=denied(/SNAPSHOT_DRIFT/,()=>contender);
  try {
    const pid=await pidReady;const deadline=Date.now()+5000;let waited=false;
    while(Date.now()<deadline){if((await sql`select wait_event_type from pg_stat_activity where pid=${pid}`)[0]?.wait_event_type==='Lock'){waited=true;break;}await new Promise((r)=>setTimeout(r,20));}
    assert.equal(waited,true,'second connection must really wait for a PostgreSQL lock');
  } finally {releaseResolve();}
  await writer;await rejected;
  assert.equal((await snapshot(raceSource,raceTarget)).association,null);
  pass('real two-connection legacy writer race rechecks fresh snapshot after lock');
  process.stdout.write(`CONCERTO_ASSOCIATIONS_PG_RESULT=${JSON.stringify({ok:true,checks:checks.length,names:checks})}\n`);
} finally { await sql?.end({timeout:2});if(created)await admin.unsafe(`drop database "${database}" with (force)`);await admin.end({timeout:2}); }
