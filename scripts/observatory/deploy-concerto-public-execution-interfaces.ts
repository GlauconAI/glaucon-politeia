import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import { assertProductionSupabaseTarget } from './deploy-project-version-contract-v1.ts';

export const MIGRATION_VERSION = '20261027000100';
const MIGRATION_NAME = 'concerto_public_execution_interfaces';
const MIGRATION_URL = new URL('../../supabase/migrations/20261027000100_concerto_public_execution_interfaces.sql', import.meta.url);
const PROJECT_REF = 'fiicazfhjkviqaaaiksp';
const READ_SIGNATURE = 'public.read_observatory_agent_work_item_operation(text,boolean,text,text,text)';
const ITEM_SIGNATURE = 'public.read_observatory_work_item_for_agent_api(uuid)';
const BIND_SIGNATURE = 'public.bind_observatory_work_item_execution_as_agent(text,boolean,text,uuid,integer,text,integer,text,text,text,text,text)';
const PERMISSION_QUERY = "select public.create_observatory_work_item_as_agent('plato','feature','permission probe','','shared/probe','00000000-0000-4000-8000-000000000000'::uuid,'optional','permission:probe',repeat('a',64))";
export type ConcertoDeploymentCommand = 'check' | 'apply' | 'status';
type Database = Sql | TransactionSql;
type ProbeItem = { id: string; version: number; plan_revision: number; stage_id: string; work_package_id: string };
type ProbeResult = { workItem: ProbeItem; operation: { operationId: string; requestFingerprint: string; result: { intakeFingerprint: string } } };
class RollbackResult extends Error { result: unknown; constructor(result: unknown) { super('ROLLBACK_ONLY'); this.result = result; } }
class CommittedStatusError extends Error {}

export function parseConcertoDeploymentCommand(argv: string[]): ConcertoDeploymentCommand {
  const command = argv[0] ?? 'check';
  if (argv.length > 1 || !['check','apply','status'].includes(command)) throw new Error('Usage: deploy-concerto-public-execution-interfaces.ts [check|apply|status]');
  return command as ConcertoDeploymentCommand;
}
export function assertConcertoProductionTarget(env: Record<string,string>) {
  const target = assertProductionSupabaseTarget(env);
  const publicUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  const database = new URL(target.databaseUrl);
  const flags = [...database.searchParams.entries()];
  if (new Set(flags.map(([key]) => key)).size !== flags.length || flags.some(([key,value]) => !((key === 'pgbouncer' && value === 'true') || (key === 'sslmode' && value === 'require')))) throw new Error('TARGET_QUERY_OVERRIDE');
  if (publicUrl.hostname !== `${PROJECT_REF}.supabase.co` || publicUrl.port || publicUrl.search || publicUrl.hash ||
      !['postgres:','postgresql:'].includes(database.protocol) || database.pathname !== '/postgres' || database.hash ||
      (database.port && !['5432','6543'].includes(database.port)) ||
      (database.hostname === `db.${PROJECT_REF}.supabase.co` && decodeURIComponent(database.username) !== 'postgres')) throw new Error('TARGET_MISMATCH');
  // These two reviewed flags cannot select a host/user/database. Strip them; TLS is enforced explicitly below.
  database.search = '';
  return { ...target, databaseUrl: database.toString() };
}
export function redactConcertoDeploymentError(error: unknown) {
  return { error: error instanceof CommittedStatusError ? 'CONCERTO_PUBLIC_APPLY_COMMITTED_VERIFY_STATUS' : 'CONCERTO_PUBLIC_DEPLOY_FAILED' };
}
function parseEnv(source: string) {
  const env: Record<string,string> = {};
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.trim(); const separator = line.indexOf('=');
    if (!line || line.startsWith('#') || separator < 1) continue;
    const value = line.slice(separator+1).trim();
    env[line.slice(0,separator).trim()] = /^(["']).*\1$/u.test(value) ? value.slice(1,-1) : value;
  }
  return env;
}
async function migrationRecorded(sql: Database) {
  const [row] = await sql<{ recorded: boolean }[]>`select exists(select 1 from supabase_migrations.schema_migrations where version=${MIGRATION_VERSION}) recorded`;
  return row.recorded;
}
export async function protectedState(sql: Database) {
  const [row] = await sql`select
    (select md5(coalesce(jsonb_agg(jsonb_build_array(id,version,updated_at) order by id)::text,'[]')) from public.observatory_work_items) items,
    (select md5(coalesce(jsonb_agg(jsonb_build_array(id,created_at) order by id)::text,'[]')) from public.observatory_work_item_events) events,
    (select md5(coalesce(jsonb_agg(jsonb_build_array(id,created_at,request_fingerprint) order by id)::text,'[]')) from public.observatory_agent_work_item_operations) operations,
    (select md5(coalesce(jsonb_agg(to_jsonb(v) order by id)::text,'[]')) from public.observatory_project_versions v) versions,
    (select md5(coalesce(jsonb_agg(to_jsonb(m) order by version)::text,'[]')) from supabase_migrations.schema_migrations m) history`;
  return { ...row };
}
export async function verifyConcertoPublicCatalog(sql: Database) {
  const [metadata] = await sql<{ rpc_security: boolean; ledger_rls: boolean; unique_key: boolean; version_trigger: boolean; rows_compatible: boolean }[]>`select
    (select count(*)=3 and bool_and(prosecdef and provolatile='v' and prorettype='jsonb'::regtype and proconfig @> array['search_path=pg_catalog'])
      from pg_proc where oid in (to_regprocedure(${READ_SIGNATURE}),to_regprocedure(${BIND_SIGNATURE}),to_regprocedure(${ITEM_SIGNATURE}))) rpc_security,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.observatory_agent_work_item_operations')),false) ledger_rls,
    exists(select 1 from pg_constraint c join pg_index i on i.indexrelid=c.conindid where c.conrelid='public.observatory_agent_work_item_operations'::regclass and c.contype='u' and c.convalidated and i.indisvalid and i.indisunique
      and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='agent_id'),(select attnum from pg_attribute where attrelid=c.conrelid and attname='idempotency_key')]::smallint[]) unique_key,
    exists(select 1 from pg_trigger where tgrelid='public.observatory_work_items'::regclass and tgname='observatory_work_items_validate_project_version' and tgenabled in ('O','A') and not tgisinternal) version_trigger,
    not exists(select 1 from public.observatory_work_items w left join public.observatory_project_versions v on v.id=w.project_version_id
      where v.id is null or v.project_key is distinct from coalesce(w.project_key,w.project_ref)
      or num_nonnulls(w.project_key,w.plan_revision,w.stage_id,w.work_package_id) not in (0,4)) rows_compatible`;
  assert.ok(metadata && Object.values(metadata).every((value) => value === true), 'CATALOG_CONTRACT_FAILED');
  let grantChecks = 0;
  for (const signature of [READ_SIGNATURE,BIND_SIGNATURE,ITEM_SIGNATURE]) {
    for (const role of ['anon','authenticated','service_role']) {
      const [grant] = await sql<{ allowed: boolean }[]>`select has_function_privilege(${role},${signature},'EXECUTE') allowed`;
      assert.equal(grant.allowed, role === 'service_role', 'RPC_GRANT_FAILED'); grantChecks++;
    }
    const [acl] = await sql<{ denied: boolean }[]>`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(${signature}) and a.grantee=0 and a.privilege_type='EXECUTE') denied`;
    assert.equal(acl.denied,true,'PUBLIC_EXECUTE_FAILED'); grantChecks++;
  }
  for (const role of ['anon','authenticated','service_role']) for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
    const [grant] = await sql<{ allowed: boolean }[]>`select has_table_privilege(${role},'public.observatory_agent_work_item_operations',${privilege}) allowed`;
    assert.equal(grant.allowed,false,'DIRECT_LEDGER_GRANT_FAILED'); grantChecks++;
  }
  return { metadata, grantChecks };
}
async function expectedPgError(tx: TransactionSql, code: string, action: (child: TransactionSql) => Promise<unknown>) {
  let denied = false;
  try { await tx.savepoint(action); } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== code) throw error;
    denied = true;
  }
  assert.equal(denied,true,'EXPECTED_SQL_REJECTION_MISSING');
}
export async function verifyReadOnlySavepointCommit(sql: Sql) {
  await sql.begin('read only', async (tx) => {
    await tx`select set_config('request.jwt.claim.role','anon',true)`;
    await expectedPgError(tx,'42501',async (child) => { await child.unsafe('set local role anon'); await child.unsafe(PERMISSION_QUERY); });
    const [row] = await tx`select 1 as healthy`;
    assert.equal(row.healthy,1,'DRIVER_SCOPE_FAILED');
  });
  return true;
}
async function rpcProbe(tx: TransactionSql) {
  await tx`select set_config('request.jwt.claim.role','service_role',true)`;
  const [version] = await tx<{ id: string; project_key: string }[]>`select id::text,project_key from public.observatory_project_versions where status not in ('released','archived','cancelled') order by project_key,id limit 1`;
  assert.ok(version,'NO_OPEN_PROJECT_VERSION');
  const key = `release-probe:${randomUUID()}`;
  const digest = createHash('sha256').update(key).digest('hex');
  const [created] = await tx<{ value: { workItem: { id: string; version: number } } }[]>`select public.create_observatory_work_item_as_agent('plato','feature','Concerto public interfaces rollback probe','Rollback-only verification.',${version.project_key},${version.id}::uuid,'optional',${`${key}:create`},${digest}) value`;
  const item = created.value.workItem;
  const [snapshot] = await tx<{ value: { snapshot_revision: string; complete: boolean } }[]>`select public.read_observatory_project_work_snapshot(${version.project_key}) value`;
  assert.equal(snapshot.value.complete,true);
  const revision = snapshot.value.snapshot_revision;
  const bind = async (db: TransactionSql, owner = true, fingerprint = digest) => (await db<{ value: ProbeResult }[]>`select public.bind_observatory_work_item_execution_as_agent('plato',${owner},${version.project_key},${item.id}::uuid,${item.version},${revision},1,'release-probe','release-probe',${`${key}:bind`},${fingerprint},${digest}) value`)[0].value;
  await expectedPgError(tx,'42501',async (child) => { await bind(child,false); });
  const result = await bind(tx);
  assert.equal(result.workItem.version,item.version+1);
  const [readback] = await tx<{value: ProbeItem}[]>`select public.read_observatory_work_item_for_agent_api(${item.id}::uuid) value`;
  assert.equal(readback.value.version,result.workItem.version);
  assert.equal(readback.value.work_package_id,'release-probe');
  const [missing] = await tx`select public.read_observatory_work_item_for_agent_api('00000000-0000-4000-8000-000000000000'::uuid) value`;
  assert.equal(missing.value,null);
  for (const role of ['anon','authenticated']) await expectedPgError(tx,'42501',async child=>{await child.unsafe(`set local role ${role}`);await child`select public.read_observatory_work_item_for_agent_api(${item.id}::uuid)`;});
  assert.equal(result.workItem.plan_revision,1); assert.equal(result.workItem.stage_id,'release-probe'); assert.equal(result.workItem.work_package_id,'release-probe');
  assert.equal(result.operation.result.intakeFingerprint,digest); assert.equal(result.operation.requestFingerprint,digest);
  assert.deepEqual(await bind(tx),result);
  await expectedPgError(tx,'23505',async (child) => { await bind(child,true,'f'.repeat(64)); });
  const [receipt] = await tx<{ value: ProbeResult['operation'] }[]>`select public.read_observatory_agent_work_item_operation('plato',true,${version.project_key},${`${key}:bind`},'plato') value`;
  assert.deepEqual(receipt.value,result.operation);
  const [other] = await tx`select public.read_observatory_agent_work_item_operation('plato',true,'shared/rollback-probe-other',${`${key}:bind`},'plato') value`;
  assert.equal(other.value,null);
  for (const role of ['anon','authenticated']) await expectedPgError(tx,'42501',async (child) => { await child.unsafe(`set local role ${role}`); await child`select public.read_observatory_agent_work_item_operation('plato',false,'shared/probe','probe','plato')`; });
  const [audit] = await tx`select count(*)::int count from public.observatory_work_item_events where work_item_id=${item.id}::uuid and agent_id='plato' and actor_id is null`;
  const [operations] = await tx`select count(*)::int count from public.observatory_agent_work_item_operations where work_item_id=${item.id}::uuid`;
  assert.equal(audit.count,2); assert.equal(operations.count,2);
  const [bindingAudit] = await tx`select data from public.observatory_work_item_events where work_item_id=${item.id}::uuid and data->>'action'='bind_execution'`;
  assert.equal(bindingAudit.data.intakeFingerprint,digest); assert.equal(bindingAudit.data.requestFingerprint,digest);
  assert.equal(bindingAudit.data.before.version,item.version); assert.equal(bindingAudit.data.after.version,item.version+1);
  return { passed: true, auditEvents: 2, operationReceipts: 2, replayVerified: true, expectedErrorsIsolated: true };
}
async function rollbackProbe(tx: TransactionSql) {
  let result: unknown;
  try { await tx.savepoint(async (child) => { throw new RollbackResult(await rpcProbe(child)); }); }
  catch (error) { if (!(error instanceof RollbackResult)) throw error; result=error.result; }
  assert.ok(result,'ROLLBACK_PROBE_RESULT_MISSING'); return result;
}

// Exported for disposable local verification; the production CLI never accepts a URL override.
export async function runConcertoDatabaseCommand(sql: Sql, command: ConcertoDeploymentCommand, source: string) {
  parseConcertoDeploymentCommand([command]);
  await verifyReadOnlySavepointCommit(sql); // Separate read-only transaction actually COMMITs.
  if (command === 'status') return sql.begin('read only',async (tx) => {
    const recorded = await migrationRecorded(tx);
    return { applied: recorded, ...(recorded ? { verified: await verifyConcertoPublicCatalog(tx) } : {}) };
  });
  const before = await protectedState(sql);
  const body = source.replace(/^\s*begin;\s*/iu,'').replace(/\s*commit;\s*$/iu,'');
  const execute = async (tx: TransactionSql) => {
    await tx`select set_config('lock_timeout','3s',true),set_config('statement_timeout','20s',true)`;
    const recorded = await migrationRecorded(tx);
    if (!recorded) {
      await tx.unsafe(body);
      await tx`insert into supabase_migrations.schema_migrations(version,statements,name) values (${MIGRATION_VERSION},${tx.array([source])},${MIGRATION_NAME})`;
    }
    const verified = await verifyConcertoPublicCatalog(tx);
    assert.equal(await migrationRecorded(tx),true,'MIGRATION_HISTORY_NOT_RECORDED');
    const probe = command === 'apply' ? await rollbackProbe(tx) : await rpcProbe(tx);
    return { applied: command === 'apply', alreadyApplied: recorded, verified, probe };
  };
  if (command === 'check') {
    let result: unknown;
    try { await sql.begin(async (tx) => { throw new RollbackResult(await execute(tx)); }); }
    catch (error) { if (!(error instanceof RollbackResult)) throw error; result=error.result; }
    assert.deepEqual(await protectedState(sql),before,'PROTECTED_STATE_CHANGED');
    return { dryRun: true, rolledBack: true, protectedStateUnchanged: true, verified: result };
  }
  const result = await sql.begin(execute);
  try {
    const status = await sql.begin('read only',async (tx) => ({ applied: await migrationRecorded(tx), verified: await verifyConcertoPublicCatalog(tx) }));
    assert.equal(status.applied,true);
    const after = await protectedState(sql); const { history: _beforeHistory, ...beforeRows } = before; const { history: _afterHistory, ...afterRows } = after;
    assert.deepEqual(afterRows,beforeRows,'PROBE_ROWS_NOT_ROLLED_BACK');
    return { ...result, committed: true, status };
  } catch { throw new CommittedStatusError(); }
}
export async function deployConcertoPublicExecutionInterfaces(command: ConcertoDeploymentCommand) {
  parseConcertoDeploymentCommand([command]);
  const env = parseEnv(await readFile(resolve(process.env.GLAUCON_POLITEIA_ENV_FILE ?? '.env.local'),'utf8'));
  const target = assertConcertoProductionTarget(env);
  const source = await readFile(MIGRATION_URL,'utf8');
  const sql = postgres(target.databaseUrl,{ ssl: 'require', max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {} });
  try {
    return { migrationVersion: MIGRATION_VERSION, migrationSha256: createHash('sha256').update(source).digest('hex'), projectRef: target.projectRef, command, ...await runConcertoDatabaseCommand(sql,command,source) };
  } finally { await sql.end({ timeout: 5 }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(`${JSON.stringify(await deployConcertoPublicExecutionInterfaces(parseConcertoDeploymentCommand(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify(redactConcertoDeploymentError(error))}\n`); process.exitCode=1; }
}
