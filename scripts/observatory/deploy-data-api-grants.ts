import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import postgres, { type TransactionSql } from "postgres";

import { assertProductionSupabaseTarget, parseDeploymentCommand } from "./deploy-project-version-contract-v1.ts";

const VERSION = "20261023000100";
const NAME = "explicit_data_api_grants";
const TABLES = ["profiles", "posts", "tags", "post_tags", "prompts"];
const PRIVATE_TABLES = [
  "observatory_work_items", "observatory_work_item_events",
  "observatory_work_item_evidence", "observatory_work_item_claims",
  "observatory_project_versions", "observatory_project_version_events",
  "observatory_agent_work_item_operations",
];
const GRANTS = [
  "grant select, insert on table public.prompts to anon",
  "grant select, insert, update, delete on table public.prompts to authenticated",
  ...TABLES.map((table) => `grant select, insert, update, delete on table public.${table} to service_role`),
];

export function validateGrantMigration(source: string) {
  const actual = source.replace(/--[^\r\n]*/gu, "").split(";")
    .map((statement) => statement.trim().replace(/\s+/gu, " ").toLowerCase())
    .filter(Boolean).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...GRANTS].sort())) {
    throw new Error("Migration differs from the reviewed seven-grant allowlist.");
  }
  return `${GRANTS.join(";\n")};`;
}

function parseEnv(source: string) {
  const env: Record<string, string> = {};
  for (const line of source.split(/\r?\n/u)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  return env;
}

async function recorded(tx: TransactionSql) {
  const [row] = await tx`select exists(select 1 from supabase_migrations.schema_migrations where version=${VERSION}) as ok`;
  return row.ok === true;
}

async function protectedState(tx: TransactionSql) {
  // Do not export row contents, identities, credentials or catalog DDL.
  const [state] = await tx`
    select
      (select md5(coalesce(jsonb_agg(jsonb_build_array(id,version,updated_at) order by id)::text,'')) from public.observatory_work_items) as work_items,
      (select md5(coalesce(jsonb_agg(jsonb_build_array(id,updated_at) order by id)::text,'')) from public.posts) as posts,
      (select md5(coalesce(jsonb_agg(jsonb_build_array(id,deleted_at) order by id)::text,'')) from public.prompts) as prompts,
      (select count(*)::text from public.observatory_work_item_events) as audit_count,
      (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname)::text,'')) from pg_policies p where p.schemaname='public') as policies,
      (select md5(coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,c.relforcerowsecurity,
        case when c.relname = any(${tx.array(TABLES)}) then null else c.relacl::text end) order by c.relname)::text,''))
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','S')) as table_boundaries
  `;
  return JSON.stringify(state);
}

async function verify(tx: TransactionSql) {
  let required = 0;
  const roles = [
    ...TABLES.map((table) => ({ table, role: "service_role", actions: ["SELECT", "INSERT", "UPDATE", "DELETE"] })),
    { table: "prompts", role: "authenticated", actions: ["SELECT", "INSERT", "UPDATE", "DELETE"] },
    { table: "prompts", role: "anon", actions: ["SELECT", "INSERT"] },
  ];
  for (const { table, role, actions } of roles) {
    for (const action of actions) {
      const [row] = await tx`select has_table_privilege(${role},${`public.${table}`},${action}) as ok`;
      if (!row.ok) throw new Error("Required table privilege is missing.");
      required++;
    }
  }
  for (const table of PRIVATE_TABLES) {
    for (const role of ["anon", "service_role"]) {
      for (const action of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const [row] = await tx`select has_table_privilege(${role},${`public.${table}`},${action}) as allowed`;
        if (row.allowed) throw new Error("Private Tracker table became directly accessible.");
      }
    }
  }
  const [rls] = await tx`select bool_and(c.relrowsecurity) as ok from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`;
  if (!rls.ok) throw new Error("A public application table has RLS disabled.");
  if (!await recorded(tx)) throw new Error("Migration history missing.");
  return { requiredPrivileges: required, privateDenials: PRIVATE_TABLES.length * 8, rls: true };
}

async function probes(tx: TransactionSql) {
  await tx.unsafe("savepoint grant_probe");
  try {
    const [admin] = await tx`select user_id::text as id from public.profiles where is_admin=true order by user_id limit 1`;
    if (!admin) throw new Error("Administrator fixture unavailable.");
    await tx`select set_config('request.jwt.claim.sub',${admin.id},true),set_config('request.jwt.claim.role','authenticated',true)`;
    await tx.unsafe("set local role authenticated");
    const nonce = randomUUID();
    const [row] = await tx`
      insert into public.prompts(user_id,client_session_id,source_url,content,idempotency_key)
      values(${admin.id},${nonce},'https://402v.com','Rollback-only grant verification',${nonce}) returning id
    `;
    if (!row?.id) throw new Error("Authenticated INSERT RETURNING failed.");
    await tx.unsafe("reset role");
    await tx`select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','anon',true)`;
    await tx.unsafe("set local role anon");
    const visible = await tx`select id from public.prompts where id=${row.id}`;
    if (visible.length !== 0) throw new Error("Anonymous role can see private probe row.");
    await tx.unsafe("reset role");
    let anonymousReturningDenied = false;
    try {
      // Expected SQL errors must belong to a postgres.js child scope. A raw
      // SQL SAVEPOINT restores PG state but leaves the parent driver's error
      // flag set, preventing COMMIT even when the error was caught.
      await tx.savepoint(async (probeTx) => {
        await probeTx.unsafe("set local role anon");
        const anonymousNonce = randomUUID();
        await probeTx`insert into public.prompts(client_session_id,source_url,content,idempotency_key)
          values(${anonymousNonce},'https://402v.com','Rollback-only anonymous boundary probe',${anonymousNonce}) returning id,created_at`;
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "42501") anonymousReturningDenied = true;
      else throw error;
    }
    if (!anonymousReturningDenied) throw new Error("Anonymous RETURNING RLS boundary changed.");
    await tx`select set_config('request.jwt.claim.role','service_role',true)`;
    await tx.unsafe("set local role service_role");
    const [service] = await tx`select id from public.prompts where id=${row.id}`;
    if (!service) throw new Error("Service administration query failed.");
    const rpc = await tx`select * from public.prompt_hourly_stats(now() - interval '1 hour')`;
    if (rpc.length !== 24) throw new Error("Prompt statistics RPC probe failed.");
    return { authenticatedInsertReturning: true, anonymousPrivateReadDenied: true, anonymousReturningDenied, serviceRead: true, statisticsRpc: true, rolledBack: true };
  } finally {
    await tx.unsafe("rollback to savepoint grant_probe");
    await tx.unsafe("release savepoint grant_probe");
  }
}

export async function deployDataApiGrants(command: "check" | "apply" | "status") {
  const env = parseEnv(await readFile(resolve(process.env.GLAUCON_POLITEIA_ENV_FILE ?? ".env.local"), "utf8"));
  const target = assertProductionSupabaseTarget(env);
  const source = await readFile(resolve(`supabase/migrations/${VERSION}_${NAME}.sql`), "utf8");
  const canonicalSql = validateGrantMigration(source);
  const sql = postgres(target.databaseUrl, { ssl: "require", max: 1, connect_timeout: 15, idle_timeout: 10, onnotice: () => undefined });
  const rollback = new Error("rollback-only rehearsal");
  let result;
  try {
    if (command === "status") {
      return await sql.begin("read only", async (tx) => {
        const applied = await recorded(tx);
        return { ok: true, command, version: VERSION, applied, verified: applied ? await verify(tx) : null };
      });
    }
    const baseline = await sql.begin("read only", protectedState);
    const previouslyRecorded = await sql.begin("read only", recorded);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe("set local lock_timeout='5s'");
        await tx.unsafe("set local statement_timeout='30s'");
        await tx`select pg_advisory_xact_lock(hashtext('402v-explicit-data-api-grants'))`;
        const before = await protectedState(tx);
        if (!await recorded(tx)) {
          await tx.unsafe(canonicalSql);
          await tx`insert into supabase_migrations.schema_migrations(version,statements,name) values(${VERSION},${tx.array([source])},${NAME})`;
        }
        const verified = await verify(tx);
        const probe = await probes(tx);
        if (before !== await protectedState(tx)) throw new Error("Protected state changed.");
        result = { ok: true, command, version: VERSION, verified, probe, applied: command === "apply", rolledBack: command === "check" };
        if (command === "check") throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    if (command === "check") {
      if (baseline !== await sql.begin("read only", protectedState) || previouslyRecorded !== await sql.begin("read only", recorded)) throw new Error("Rehearsal did not restore protected state/history.");
    }
    return result;
  } finally { await sql.end({ timeout: 5 }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await deployDataApiGrants(parseDeploymentCommand(process.argv.slice(2))))); }
  catch { console.error("DATA_API_GRANTS_DEPLOY_FAILED: target, migration, or verification rejected; no credentials disclosed."); process.exitCode = 1; }
}
