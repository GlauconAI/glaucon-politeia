import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import { assertConcertoProductionTarget, protectedState, verifyConcertoPublicCatalog, verifyReadOnlySavepointCommit, parseConcertoDeploymentCommand } from './deploy-concerto-public-execution-interfaces.ts';

export const MIGRATION_VERSION = '20261029000200';
const SIGNATURE = 'public.bind_observatory_work_item_execution_as_agent(text,boolean,text,uuid,integer,text,integer,text,text,text,text,text)';
const SOURCE = new URL('../../supabase/migrations/20261029000200_concerto_binding_terminal_conflicts.sql', import.meta.url);
const BASE = new URL('../../supabase/migrations/20261027000100_concerto_public_execution_interfaces.sql', import.meta.url);
type Db = Sql | TransactionSql;
class RolledBack extends Error { result: unknown; constructor(result: unknown) { super('ROLLBACK_ONLY'); this.result=result; } }
class Committed extends Error {}

export function bindingBody(source: string) {
  const match = /create (?:or replace )?function public\.bind_observatory_work_item_execution_as_agent[\s\S]*?as \$\$([\s\S]*?)\$\$;/u.exec(source);
  assert.ok(match, 'BINDING_BODY_MISSING'); return match[1];
}
export function assertMinimalConflictMigration(source: string, base: string) {
  const oldBody = bindingBody(base), newBody = bindingBody(source);
  assert.equal((oldBody.match(/errcode = '40001'/gu) ?? []).length, 2);
  assert.equal(newBody, oldBody.replaceAll("errcode = '40001'", "errcode = 'PT409'"));
  assert.equal((source.match(/create or replace function/gu) ?? []).length, 1);
  const functionBlock = /create (?:or replace )?function public\.bind_observatory_work_item_execution_as_agent[\s\S]*?\$\$;/u;
  assert.equal(functionBlock.exec(source)?.[0], functionBlock.exec(base)?.[0].replace('create function','create or replace function').replaceAll("errcode = '40001'", "errcode = 'PT409'"));
  assert.equal(source.replace(functionBlock,'').replace(/--[^\n]*/gu,'').replace(/\s/gu,''),'begin;commit;');
  return { oldBody, newBody };
}
async function recorded(db: Db) {
  const [row] = await db`select exists(select 1 from supabase_migrations.schema_migrations where version=${MIGRATION_VERSION}) applied`;
  return row.applied as boolean;
}
async function definition(db: Db) {
  const [row] = await db`select prosrc from pg_proc where oid=to_regprocedure(${SIGNATURE})`;
  assert.ok(row, 'BASE_BINDING_REQUIRED'); return row.prosrc as string;
}
async function verify(db: Db, expectedBody: string) {
  assert.equal(await definition(db), expectedBody, 'EXACT_BINDING_BODY_MISMATCH');
  return { ...await verifyConcertoPublicCatalog(db), terminalConflicts: 2, bodySha256: createHash('sha256').update(expectedBody).digest('hex') };
}
async function rejectedConflicts(tx: TransactionSql) {
  await tx`select set_config('request.jwt.claim.role','service_role',true)`;
  const [item] = await tx`select id::text,version,coalesce(project_key,project_ref) as project_ref from public.observatory_work_items order by id limit 1`;
  assert.ok(item, 'PROBE_ITEM_REQUIRED');
  const [snap] = await tx`select public.read_observatory_project_work_snapshot(${item.project_ref}) value`;
  const revision = snap.value.snapshot_revision as string;
  assert.notEqual(revision, '0'.repeat(32));
  for (const kind of ['snapshot','version']) {
    let rejected = false;
    try { await tx.savepoint(async child => {
      await child`select public.bind_observatory_work_item_execution_as_agent('plato',true,${item.project_ref},${item.id}::uuid,${kind === 'version' ? item.version+1 : item.version},${kind === 'snapshot' ? '0'.repeat(32) : revision},1,'release-negative','release-negative',${`release-conflict:${randomUUID()}`},${'a'.repeat(64)},null)`;
    }); } catch (e) {
      if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'PT409' || !('message' in e) || !String(e.message).includes(kind === 'snapshot' ? 'SNAPSHOT_DRIFT' : 'VERSION_CONFLICT')) throw e;
      rejected = true;
    }
    assert.equal(rejected, true, 'TERMINAL_CONFLICT_NOT_REJECTED');
  }
  return { rejectedConflicts: 2, businessWrites: false };
}
export async function runTerminalConflictCommand(sql: Sql, command: string, source: string, base: string) {
  parseConcertoDeploymentCommand([command]);
  const {oldBody,newBody} = assertMinimalConflictMigration(source,base);
  await verifyReadOnlySavepointCommit(sql);
  if (command === 'status') return sql.begin('read only',async tx => {
    const applied = await recorded(tx); return { applied, ...(applied ? {verified:await verify(tx,newBody)} : {}) };
  });
  const before = await protectedState(sql);
  const execute = async (tx: TransactionSql) => {
    await tx`select set_config('lock_timeout','3s',true),set_config('statement_timeout','10s',true)`;
    const applied = await recorded(tx);
    assert.equal(await definition(tx), applied ? newBody : oldBody, 'BASE_BINDING_DRIFT');
    if (!applied) {
      await tx.unsafe(source.replace(/^\s*begin;\s*/iu,'').replace(/\s*commit;\s*$/iu,''));
      await tx`insert into supabase_migrations.schema_migrations(version,statements,name) values (${MIGRATION_VERSION},${tx.array([source])},'concerto_binding_terminal_conflicts')`;
    }
    return {alreadyApplied:applied,verified:await verify(tx,newBody),probe:await rejectedConflicts(tx)};
  };
  if (command === 'check') {
    let result: unknown;
    try { await sql.begin(async tx=>{throw new RolledBack(await execute(tx));}); }
    catch(e) { if (!(e instanceof RolledBack)) throw e; result=e.result; }
    assert.deepEqual(await protectedState(sql),before,'PROTECTED_STATE_CHANGED');
    return {rolledBack:true,protectedStateUnchanged:true,result};
  }
  const result = await sql.begin(execute);
  try {
    const after=await protectedState(sql);
    const {history:_a,...a}=after, {history:_b,...b}=before;
    assert.deepEqual(a,b,'BUSINESS_STATE_CHANGED');
    const status=await sql.begin('read only',async tx=>({applied:await recorded(tx),verified:await verify(tx,newBody)}));
    assert.equal(status.applied,true);
    return {committed:true,result,status};
  } catch {throw new Committed();}
}
async function main() {
  const command=parseConcertoDeploymentCommand(process.argv.slice(2));
  const env: Record<string,string>={};
  for(const line of (await readFile(resolve(process.env.GLAUCON_POLITEIA_ENV_FILE ?? '.env.local'),'utf8')).split(/\r?\n/u)) {
    const m=/^([A-Z_][A-Z_0-9]*)=(.*)$/u.exec(line); if(m) env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/u,'$2');
  }
  const target=assertConcertoProductionTarget(env),source=await readFile(SOURCE,'utf8'),base=await readFile(BASE,'utf8');
  const sql=postgres(target.databaseUrl,{ssl:'require',max:1,connect_timeout:15,idle_timeout:5,onnotice:()=>{}});
  try { console.log(JSON.stringify({migrationVersion:MIGRATION_VERSION,migrationSha256:createHash('sha256').update(source).digest('hex'),projectRef:target.projectRef,command,...await runTerminalConflictCommand(sql,command,source,base)})); }
  finally {await sql.end({timeout:5});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {await main();} catch(e) {console.error(JSON.stringify({error:e instanceof Committed?'CONFLICT_APPLY_COMMITTED_VERIFY_STATUS':'CONFLICT_DEPLOY_FAILED'}));process.exitCode=1;}
}
