#!/usr/bin/env node
// Disposable loopback PostgreSQL only. No .env files or production config read.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const raw = process.env.CONCERTO_DISPOSABLE_PG_URL;
if (!raw) throw new Error('Set CONCERTO_DISPOSABLE_PG_URL to the isolated loopback PostgreSQL maintenance database.');
const url = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.port || Number(url.port) < 1024 || url.pathname !== '/postgres' || url.search || url.hash) {
  throw new Error('Disposable verifier requires explicit loopback port >=1024, /postgres, and no URL query overrides.');
}
const options = { max: 4, connect_timeout: 5, idle_timeout: 2, onnotice: () => {} };
const admin = postgres(raw, options);
const database = `concerto_public_test_${process.pid}_${randomBytes(6).toString('hex')}`;
let sql;
let created = false;
const checks = [];
function record(name) { checks.push(name); process.stdout.write(`PASS ${name}\n`); }
const migration = async (name) => readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
async function denied(pattern, action) {
  await assert.rejects(action, (e) => { assert.match(e.message, pattern); return true; });
}
async function service(action, role = 'service_role') {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select set_config('request.jwt.claim.role', ${role}, true)`;
    return action(tx);
  });
}
const project = 'shared/fixture';
const actor = 'plato';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot() {
  return service(async (tx) => (await tx`select public.read_observatory_project_work_snapshot(${project}) as value`)[0].value);
}
async function bind(tx, input) {
  const original = { agentId: actor, projectRef: project, workItemId: input.id, expectedVersion: input.version,
    expectedProjectRevision: input.revision, planRevision: input.plan ?? 1, stageId: 'build', workPackageId: 'wp-1', intakeFingerprint: input.intake ?? 'b'.repeat(64) };
  return (await tx`select public.bind_observatory_work_item_execution_as_agent(
    ${actor}, ${input.owner ?? true}, ${project}, ${input.id}::uuid, ${input.version}, ${input.revision},
    ${input.plan ?? 1}, 'build', 'wp-1', ${input.key}, ${hash(original)}, ${input.intake ?? 'b'.repeat(64)}) as value`)[0].value;
}
async function readOperation(tx, key, selectedActor = actor, selectedProject = project, owner = false) {
  return (await tx`select public.read_observatory_agent_work_item_operation(${actor}, ${owner}, ${selectedProject}, ${key}, ${selectedActor}) as value`)[0].value;
}
async function waitForLock(pid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [activity] = await sql`select wait_event_type from pg_stat_activity where pid=${pid}`;
    if (activity?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected the second connection to wait on a real PostgreSQL lock.');
}
try {
  await admin.unsafe(`create database "${database}"`); created = true;
  const target = new URL(raw); target.pathname = `/${database}`;
  sql = postgres(target.toString(), options);
  await sql.unsafe(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;
    create schema auth;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.observatory_project_versions (id uuid primary key, project_key text not null, status text not null);
    create table public.observatory_work_items (
      id uuid primary key default gen_random_uuid(), type text not null default 'feature', title text not null default 'fixture',
      description text not null default '', state text not null default 'ready' check(state in ('inbox','triage','ready','in_progress','review','done','blocked','waiting','reopened')),
      priority text, owner_id uuid, assigned_agent_id text not null default 'plato', acceptance_criteria text not null default 'fixture accepted',
      project_ref text, milestone_ref text, due_on date, project_key text, plan_revision integer check(plan_revision >= 0),
      stage_id text check(length(stage_id) between 1 and 128), work_package_id text check(length(work_package_id) between 1 and 128),
      project_version_id uuid not null references public.observatory_project_versions(id), version_binding_kind text not null default 'required' check(version_binding_kind in ('required','optional')),
      idempotency_key text, version integer not null default 1 check(version>0), created_by uuid not null,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      check ((project_key is null and plan_revision is null and stage_id is null and work_package_id is null)
        or (project_key is not null and plan_revision is not null and stage_id is not null and work_package_id is not null))
    );
    create table public.observatory_work_item_events (
      id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.observatory_work_items(id),
      event_type text not null check(event_type in ('created','updated','state_transitioned','evidence_added','evidence_removed')),
      actor_id uuid, agent_id text, data jsonb not null, created_at timestamptz not null default now(),
      check(num_nonnulls(actor_id, agent_id)=1)
    );
    create table public.observatory_work_item_evidence (
      id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.observatory_work_items(id),
      label text, url text, created_by uuid, created_by_agent text, created_at timestamptz not null default now(), removed_at timestamptz, removed_by uuid
    );
    alter table public.observatory_work_items enable row level security;
    alter table public.observatory_work_item_events enable row level security;
    revoke all on public.observatory_work_items, public.observatory_work_item_events from public, anon, authenticated, service_role;
  `);
  // Faithful minimal predecessor schema above omits unrelated profiles/claims UI.
  // Execute the ACTUAL durable CRUD migration, actual version validation trigger,
  // complete-snapshot migration and candidate migration, never copies of functions.
  async function applyMigration(name) {
    const connection = await sql.reserve();
    try { await connection.unsafe(await migration(name)); } finally { connection.release(); }
  }
  await applyMigration('20260926000100_concerto_agent_work_item_api.sql');
  const versionContract = await migration('20260902000300_work_tracker_project_version_contract_v1.sql');
  const triggerStart = versionContract.indexOf('create or replace function public.validate_observatory_work_item_project_version()');
  const exactTrigger = versionContract.slice(triggerStart, versionContract.indexOf('for each row execute function public.validate_observatory_work_item_project_version();', triggerStart) + 'for each row execute function public.validate_observatory_work_item_project_version();'.length);
  assert.ok(triggerStart >= 0 && exactTrigger.endsWith('();'));
  await sql.unsafe(exactTrigger);
  await applyMigration('20261018000100_concerto_project_work_snapshot.sql');
  const versionId = randomUUID(); const id = randomUUID(); const other = randomUUID(); const creator = randomUUID();
  await sql`insert into public.observatory_project_versions values (${versionId},${project},'active')`;
  async function insert(tx, itemId) { await tx`insert into public.observatory_work_items (id, project_ref, project_version_id, created_by) values (${itemId},${project},${versionId},${creator})`; }
  await insert(sql, id); await insert(sql, other);
  await sql.unsafe('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text)');
  const launcher = await import('../observatory/deploy-concerto-public-execution-interfaces.ts');
  const candidate = await migration('20261027000100_concerto_public_execution_interfaces.sql');
  const checkResult = await launcher.runConcertoDatabaseCommand(sql, 'check', candidate);
  assert.equal(checkResult.rolledBack, true); assert.equal(checkResult.protectedStateUnchanged, true);
  const [absent] = await sql`select to_regprocedure('public.read_observatory_agent_work_item_operation(text,boolean,text,text,text)') is null as absent, (select count(*)::int from supabase_migrations.schema_migrations) history`;
  assert.equal(absent.absent,true); assert.equal(absent.history,0);
  record('launcher rollback rehearsal leaves schema/history/protected timestamps unchanged');
  const applyResult = await launcher.runConcertoDatabaseCommand(sql, 'apply', candidate);
  assert.equal(applyResult.committed,true); assert.equal(applyResult.status.applied,true);
  record('launcher LOCAL apply commits only schema/history and rolls probe rows back');
  const statusResult = await launcher.runConcertoDatabaseCommand(sql, 'status', candidate);
  assert.equal(statusResult.applied,true); assert.equal(statusResult.verified.grantChecks,33);
  assert.equal((await launcher.runConcertoDatabaseCommand(sql, 'check', candidate)).rolledBack,true);
  record('launcher status read-only commit/savepoint isolation and already-applied rehearsal pass');
  record('actual predecessor functions, version trigger, snapshot and candidate migrations apply');
  const signatures = ['read_observatory_work_item_for_agent_api(uuid)', 'read_observatory_agent_work_item_operation(text,boolean,text,text,text)', 'bind_observatory_work_item_execution_as_agent(text,boolean,text,uuid,integer,text,integer,text,text,text,text,text)'];
  for (const signature of signatures) {
    const rows = await sql`select rolname, has_function_privilege(rolname, ${signature}, 'EXECUTE') as allowed from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname`;
    assert.deepEqual(rows.map((r) => [r.rolname,r.allowed]), [['anon',false],['authenticated',false],['service_role',true]]);
  }
  for (const role of ['anon','authenticated']) await denied(/permission denied/, () => service((tx) => readOperation(tx, 'missing'), role));
  await denied(/permission denied/, () => service((tx) => tx`select * from public.observatory_agent_work_item_operations`));
  record('exact service-only EXECUTE and no direct operation-table access');

  const before = await snapshot();
  const original = { id, version: 1, revision: before.snapshot_revision, key: 'fixture:tracker' };
  for (const role of ['anon','authenticated']) await denied(/permission denied/, () => service((tx) => bind(tx, original), role));
  await denied(/Service role required/, () => service(async (tx) => { await tx`select set_config('request.jwt.claim.role','anon',true)`; return bind(tx, original); }));
  await denied(/FORBIDDEN/, () => service((tx) => bind(tx, { ...original, owner: false })));
  const result = await service((tx) => bind(tx, original));
  assert.equal(result.workItem.version, 2); assert.equal(result.workItem.stage_id, 'build');
  assert.equal(result.operation.result.intakeFingerprint, 'b'.repeat(64));
  assert.equal(result.operation.requestFingerprint.length, 64);
  const [counts] = await sql`select (select count(*)::int from public.observatory_work_item_events) events, (select count(*)::int from public.observatory_agent_work_item_operations) operations`;
  assert.deepEqual({ ...counts }, { events: 1, operations: 1 });
  const [audit] = await sql`select agent_id, event_type, data from public.observatory_work_item_events where work_item_id=${id}`;
  assert.equal(audit.agent_id, actor); assert.equal(audit.event_type, 'updated');
  assert.equal(audit.data.action, 'bind_execution');
  assert.equal(audit.data.intakeFingerprint, result.operation.result.intakeFingerprint);
  assert.equal(audit.data.requestFingerprint, result.operation.requestFingerprint);
  assert.equal(audit.data.before.version, 1); assert.equal(audit.data.after.version, 2);
  const after = await snapshot(); assert.notEqual(after.snapshot_revision, before.snapshot_revision);
  record('owner-only binding updates exact tuple/version, audit and immutable receipt atomically');
  assert.deepEqual(await service((tx) => bind(tx, original)), result);
  assert.deepEqual(await service((tx) => readOperation(tx, original.key)), result.operation);
  await denied(/IDEMPOTENCY_CONFLICT/, () => service((tx) => bind(tx, { ...original, intake: 'c'.repeat(64) })));
  await denied(/IDEMPOTENCY_CONFLICT/, () => service((tx) => bind(tx, { ...original, id: other })));
  record('identical retry replays original despite changed revision; changed hash/Item conflicts');
  assert.equal(await service((tx) => readOperation(tx, original.key, actor, 'shared/other')), null);
  assert.equal(await service((tx) => readOperation(tx, 'missing')), null);
  await denied(/FORBIDDEN/, () => service((tx) => readOperation(tx, original.key, 'aristotle')));
  await service((tx) => tx`select public.create_observatory_work_item_as_agent('aristotle', 'feature', 'Legacy scope fixture', '', ${project}, ${versionId}::uuid, 'required', ${original.key}, ${'d'.repeat(64)})`);
  const legacyReceipt = await service((tx) => readOperation(tx, original.key, 'aristotle', project, true));
  assert.equal(legacyReceipt.actorAgentId, 'aristotle'); assert.equal(legacyReceipt.operationKind, 'create');
  assert.equal(Object.hasOwn(legacyReceipt.result, 'intakeFingerprint'), false);
  assert.equal((await service((tx) => readOperation(tx, original.key))).actorAgentId, actor);
  record('cross-project and unknown receipts hidden; only owner may select another actor');

  const current = await snapshot();
  await denied(/VERSION_CONFLICT/, () => service((tx) => bind(tx, { id: other, version: 99, revision: current.snapshot_revision, key: 'bad:version' })));
  await sql`update public.observatory_work_items set version=version+1 where id=${other}`;
  await denied(/SNAPSHOT_DRIFT/, () => service((tx) => bind(tx, { id, version: 2, revision: current.snapshot_revision, key: 'bad:revision' })));
  await sql`insert into public.observatory_work_items (project_ref, project_version_id, created_by) select ${project},${versionId},${creator} from generate_series(1,505)`;
  const complete = await snapshot(); assert.equal(complete.total_count, 508); assert.equal(complete.items.length, 508);
  record('exact Item version conflict and complete 508-Item snapshot drift');
  for (const state of ['in_progress','review','done','blocked','waiting']) {
    await sql`update public.observatory_work_items set state=${state} where id=${other}`;
    await denied(/INVALID_TRANSITION/, () => service(async (tx) => bind(tx, { id: other, version: 2, revision: (await snapshot()).snapshot_revision, key: `state:${state}` })));
  }
  await sql`update public.observatory_work_items set state='ready' where id=${other}`;
  for (const status of ['released','archived','cancelled']) {
    await sql`update public.observatory_project_versions set status=${status} where id=${versionId}`;
    await denied(/PROJECT_VERSION/, () => service(async (tx) => bind(tx, { id: other, version: 2, revision: (await snapshot()).snapshot_revision, key: `status:${status}` })));
  }
  await sql`update public.observatory_project_versions set status='active' where id=${versionId}`;
  await sql`update public.observatory_project_versions set project_key='shared/wrong' where id=${versionId}`;
  await denied(/PROJECT_VERSION/, () => service(async (tx) => bind(tx, { id: other, version: 2, revision: (await snapshot()).snapshot_revision, key: 'scope:wrong' })));
  await sql`update public.observatory_project_versions set project_key=${project} where id=${versionId}`;
  record('all active/terminal states and closed/mismatched Product Versions reject without receipts');

  // A legacy writer inserts another Item while B waits for the actual table lock.
  // On A commit B must see the fresh complete snapshot, not its pre-lock snapshot.
  const raceSnapshot = await snapshot();
  let insertedResolve; const inserted = new Promise((resolve) => { insertedResolve = resolve; });
  let releaseResolve; const release = new Promise((resolve) => { releaseResolve = resolve; });
  const writer = sql.begin(async (tx) => { await insert(tx, randomUUID()); insertedResolve(); await release; });
  await inserted;
  let pidResolve; const pidReady = new Promise((resolve) => { pidResolve = resolve; });
  const racing = service(async (tx) => { pidResolve((await tx`select pg_backend_pid() as pid`)[0].pid); return bind(tx, { id: other, version: 2, revision: raceSnapshot.snapshot_revision, key: 'race:tracker' }); });
  const raceRejected = denied(/SNAPSHOT_DRIFT/, () => racing);
  try { await waitForLock(await pidReady); } finally { releaseResolve(); }
  await writer; await raceRejected;
  const [final] = await sql`select (select count(*)::int from public.observatory_work_item_events) events, (select count(*)::int from public.observatory_agent_work_item_operations) operations, (select version from public.observatory_work_items where id=${other}) version`;
  assert.deepEqual({ ...final }, { events: 2, operations: 2, version: 2 });
  record('two-connection legacy insert race waits, then detects drift with zero partial mutation');
  process.stdout.write(`CONCERTO_PUBLIC_PG_RESULT=${JSON.stringify({ ok: true, checkCount: checks.length, checks })}\n`);
} finally {
  await sql?.end({ timeout: 2 });
  if (created) await admin.unsafe(`drop database "${database}" with (force)`);
  await admin.end({ timeout: 2 });
}
