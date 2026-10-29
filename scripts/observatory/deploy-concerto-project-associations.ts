import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import postgres,{type Sql,type TransactionSql} from 'postgres';
import {assertConcertoProductionTarget} from './deploy-concerto-public-execution-interfaces.ts';

export const ASSOCIATION_MIGRATION_VERSION='20261029000100';
type Command='check'|'status'|'apply';
type Database=Sql|TransactionSql;
class Rollback extends Error {readonly result:unknown;constructor(result:unknown){super('ROLLBACK_ONLY');this.result=result;}}
class CommittedStatusError extends Error {}
export function parseAssociationDeploymentCommand(args:string[]):Command {
 if(args.length>1 || (args[0] && !['check','status','apply'].includes(args[0])))throw new Error('Usage: deploy-concerto-project-associations.ts [check|status|apply]');
 return (args[0]??'check') as Command;
}
export function redactAssociationDeploymentError(error:unknown){return {error:error instanceof CommittedStatusError?'CONCERTO_ASSOCIATION_APPLY_COMMITTED_VERIFY_STATUS':'CONCERTO_ASSOCIATION_DEPLOY_FAILED'};}
async function businessState(sql:Database){
 const [state]=await sql`select
  (select md5(coalesce(jsonb_agg(to_jsonb(v) order by id),'[]')::text) from public.observatory_project_versions v) versions,
  (select md5(coalesce(jsonb_agg(to_jsonb(w) order by id),'[]')::text) from public.observatory_work_items w) items`;
 return {...state};
}
async function recorded(sql:Database,source:string){
 const [row]=await sql`select statements from supabase_migrations.schema_migrations where version=${ASSOCIATION_MIGRATION_VERSION}`;
 if(row)assert.deepEqual(row.statements,[source],'RECORDED_MIGRATION_BYTES_DIFFER');
 return !!row;
}
async function verify(sql:Database){
 const signatures=['public.read_observatory_project_association_snapshot(text,text)','public.associate_observatory_project_as_agent(text,boolean,text,text,text,text,text,text)'];
 for(const signature of signatures){
  const [metadata]=await sql`select prosecdef and prorettype='jsonb'::regtype and proconfig @> array['search_path=pg_catalog'] safe from pg_proc where oid=to_regprocedure(${signature})`;
  assert.equal(metadata?.safe,true,'RPC_SECURITY');
  for(const role of ['anon','authenticated','service_role']){const [grant]=await sql`select has_function_privilege(${role},${signature},'EXECUTE') allowed`;assert.equal(grant.allowed,role==='service_role','RPC_GRANT');}
  const [acl]=await sql`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(${signature}) and a.grantee=0 and a.privilege_type='EXECUTE') denied`;
  assert.equal(acl.denied,true,'PUBLIC_EXECUTE');
 }
 for(const table of ['observatory_project_associations','observatory_project_association_operations']){
  const [metadata]=await sql`select relrowsecurity rls from pg_class where oid=to_regclass(${'public.'+table})`;assert.equal(metadata?.rls,true,'TABLE_RLS');
  for(const role of ['anon','authenticated','service_role'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
   const [grant]=await sql`select has_table_privilege(${role},${'public.'+table},${privilege}) allowed`;assert.equal(grant.allowed,false,'DIRECT_TABLE_GRANT');
  }
 }
 return {serviceOnlyRpc:true,rls:true,noDirectTableGrants:true};
}
export async function runProjectAssociationMigration(sql:Sql,command:Command,source:string):Promise<Record<string,unknown>>{
 parseAssociationDeploymentCommand([command]);
 if(command==='status')return sql.begin('read only',async(tx)=>{const applied=await recorded(tx,source);return {applied,...(applied?{verified:await verify(tx)}:{})};});
 const before=await businessState(sql);
 const body=source.replace(/^\s*begin;\s*/iu,'').replace(/\s*commit;\s*$/iu,'');
 const execute=async(tx:TransactionSql)=>{
  await tx`select set_config('lock_timeout','3s',true),set_config('statement_timeout','20s',true)`;
  const alreadyApplied=await recorded(tx,source);
  if(!alreadyApplied){await tx.unsafe(body);await tx`insert into supabase_migrations.schema_migrations(version,statements,name) values (${ASSOCIATION_MIGRATION_VERSION},${tx.array([source])},'concerto_project_associations')`;}
  const verified=await verify(tx);assert.deepEqual(await businessState(tx),before,'BUSINESS_ROWS_CHANGED');
  return {alreadyApplied,verified};
 };
 if(command==='check'){
  let result:unknown;
  try{await sql.begin(async(tx)=>{throw new Rollback(await execute(tx));});}catch(error){if(!(error instanceof Rollback))throw error;result=error.result;}
  assert.deepEqual(await businessState(sql),before,'ROLLBACK_CHANGED_BUSINESS');
  return {rolledBack:true,protectedStateUnchanged:true,verified:result};
 }
 const result=await sql.begin(execute);
 try{assert.deepEqual(await businessState(sql),before,'APPLY_CHANGED_BUSINESS');return {...result,committed:true,status:await runProjectAssociationMigration(sql,'status',source)};}
 catch{throw new CommittedStatusError();}
}
function parseEnv(source:string){
 const env:Record<string,string>={};for(const line of source.split(/\r?\n/u)){const text=line.trim(),i=text.indexOf('=');if(!text||text.startsWith('#')||i<1)continue;const value=text.slice(i+1).trim();env[text.slice(0,i).trim()]=/^(["']).*\1$/u.test(value)?value.slice(1,-1):value;}return env;
}
async function main(){
 const command=parseAssociationDeploymentCommand(process.argv.slice(2));
 const env=parseEnv(await readFile(resolve(process.env.GLAUCON_POLITEIA_ENV_FILE??'.env.local'),'utf8'));
 const target=assertConcertoProductionTarget(env);
 const source=await readFile(new URL('../../supabase/migrations/20261029000100_concerto_project_associations.sql',import.meta.url),'utf8');
 const sql=postgres(target.databaseUrl,{ssl:'require',max:1,connect_timeout:15,idle_timeout:5,onnotice:()=>{}});
 try{return {command,migrationVersion:ASSOCIATION_MIGRATION_VERSION,migrationSha256:createHash('sha256').update(source).digest('hex'),projectRef:target.projectRef,...await runProjectAssociationMigration(sql,command,source)};}finally{await sql.end({timeout:5});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{process.stdout.write(JSON.stringify(await main())+'\n');}catch(error){process.stderr.write(JSON.stringify(redactAssociationDeploymentError(error))+'\n');process.exitCode=1;}
}
