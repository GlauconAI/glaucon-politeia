import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import postgres, { type Sql } from "postgres";

const MIGRATION_VERSION = "20260902000300";
const DEFAULT_MIGRATION_PATH = resolve(
  "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql",
);
export const ROLLBACK_GUIDANCE =
  "Forward-only rollback: roll back the application to the prior RPC contract; no destructive schema drop. Apply a new corrective migration when schema repair is required.";

type Mode = "source" | "status" | "apply";
export type VerifierOptions = {
  mode: Mode;
  confirmLocalApply?: true;
};

export function assertLocalProjectVersionApplyTarget(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (
    parsed.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error("Apply mode is restricted to the disposable loopback database on port 54322.");
  }
}

export function parseProjectVersionVerifierArgs(argv: string[]): VerifierOptions {
  let mode: Mode = "source";
  let confirmLocalApply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      const value = argv[++index];
      if (!value || !["source", "status", "apply"].includes(value)) {
        throw new Error("--mode must be source, status, or apply.");
      }
      mode = value as Mode;
    } else if (argument === "--confirm-local-apply") {
      confirmLocalApply = true;
    } else {
      throw new Error(`unknown verifier option: ${argument}`);
    }
  }
  if (mode === "apply") {
    if (!confirmLocalApply) throw new Error("Apply mode requires --confirm-local-apply.");
  }
  return {
    mode,
    ...(confirmLocalApply ? { confirmLocalApply: true as const } : {}),
  };
}

function requirePattern(source: string, label: string, pattern: RegExp) {
  if (!pattern.test(source)) throw new Error(`Source verification failed: ${label}.`);
}

export async function verifyProjectVersionContractSource(
  migrationPath = DEFAULT_MIGRATION_PATH,
) {
  const source = await readFile(migrationPath, "utf8");
  const checks: string[] = [];
  requirePattern(source, "transaction boundary", /^\s*begin;[\s\S]*commit;\s*$/iu);
  checks.push("transaction boundary");
  requirePattern(source, "schema contract", /add column semver[\s\S]*version_binding_kind[\s\S]*project_version_id set not null/iu);
  checks.push("schema contract");
  requirePattern(source, "preflight guards", /OBSERVATORY_MULTIPLE_EXECUTION_VERSIONS[\s\S]*OBSERVATORY_WORK_ITEM_VERSION_REQUIRED/iu);
  checks.push("preflight guards");
  requirePattern(source, "portfolio indexes", /one_execution_idx[\s\S]*one_release_target_idx[\s\S]*semver_idx/iu);
  checks.push("portfolio indexes");
  requirePattern(source, "predecessor integrity", /with recursive predecessor_chain[\s\S]*OBSERVATORY_PREDECESSOR_CYCLE/iu);
  checks.push("predecessor integrity");
  requirePattern(source, "lifecycle and release gates", /gate_ready[\s\S]*version_binding_kind = 'required'[\s\S]*RELEASE_GATE_INCOMPLETE/iu);
  checks.push("lifecycle and release gates");
  requirePattern(source, "security and audit", /security definer[\s\S]*jsonb_build_object\('before'[\s\S]*grant execute/iu);
  checks.push("security and audit");
  checks.push("rollback guidance");
  return { mode: "source" as const, ok: true, checks, rollbackGuidance: ROLLBACK_GUIDANCE };
}

async function readDatabaseStatus(sql: Sql) {
  const [status] = await sql<Record<string, boolean | number>[]>`
    select
      (select count(*) = 15 from information_schema.columns where table_schema='public'
        and table_name='observatory_project_versions' and column_name = any(array[
          'semver','is_release_target','milestone_ref','predecessor_version_id','roadmap_ref',
          'approved_plan_ref','acceptance_summary','actual_date','dependencies_summary',
          'dependencies_satisfied','artifacts_accepted','verification_complete',
          'roadmap_reconciled','user_gate_decision_ref','version_label'
        ])) as version_columns,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_work_items' and column_name='version_binding_kind' and is_nullable='NO') as binding_column,
      to_regclass('public.observatory_project_versions_one_execution_idx') is not null as execution_index,
      to_regclass('public.observatory_project_versions_one_release_target_idx') is not null as release_target_index,
      to_regclass('public.observatory_project_versions_semver_idx') is not null as semver_index,
      exists(select 1 from pg_constraint where conrelid='public.observatory_project_versions'::regclass
        and conname='observatory_project_versions_status_check' and contype='c') as status_constraint,
      exists(select 1 from pg_constraint where conrelid='public.observatory_work_items'::regclass
        and conname='observatory_work_items_version_binding_kind_check' and contype='c') as binding_constraint,
      exists(select 1 from pg_trigger where tgname='observatory_project_versions_validate_predecessor' and not tgisinternal) as predecessor_trigger,
      exists(select 1 from pg_trigger where tgname='observatory_project_versions_protect_history' and not tgisinternal) as history_trigger,
      to_regprocedure('public.create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)') is not null
        and to_regprocedure('public.update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)') is not null
        and to_regprocedure('public.transition_observatory_project_version(uuid,integer,text)') is not null
        and to_regprocedure('public.create_observatory_work_item(text,text,text,text,text,uuid,text,text)') is not null
        and to_regprocedure('public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text)') is not null
        as bounded_rpcs,
      exists(select 1 from pg_class where oid='public.observatory_project_versions'::regclass and relrowsecurity)
        and exists(select 1 from pg_class where oid='public.observatory_project_version_events'::regclass and relrowsecurity)
        as versions_and_events_rls,
      has_table_privilege('authenticated','public.observatory_project_versions','SELECT')
        and has_table_privilege('authenticated','public.observatory_project_version_events','SELECT')
        and not has_table_privilege('authenticated','public.observatory_project_versions','INSERT')
        and not has_table_privilege('authenticated','public.observatory_project_versions','UPDATE')
        and not has_table_privilege('authenticated','public.observatory_project_versions','DELETE')
        and not has_table_privilege('anon','public.observatory_project_versions','SELECT')
        and not has_table_privilege('anon','public.observatory_project_version_events','SELECT') as table_grants,
      has_function_privilege('authenticated','public.transition_observatory_project_version(uuid,integer,text)','EXECUTE')
        and not has_function_privilege('anon','public.transition_observatory_project_version(uuid,integer,text)','EXECUTE')
        as rpc_grants,
      exists(select 1 from supabase_migrations.schema_migrations where version=${MIGRATION_VERSION}) as migration_recorded,
      not exists(select 1 from public.observatory_work_items item left join public.observatory_project_versions version
        on version.id=item.project_version_id where item.project_version_id is null
        or version.id is null or version.project_key<>coalesce(item.project_key,item.project_ref)) as bindings_valid,
      not exists(select 1 from public.observatory_project_versions where status in ('active','gate_ready')
        group by project_key having count(*)>1) as execution_versions_valid,
      not exists(select 1 from public.observatory_project_versions where is_release_target
        group by project_key having count(*)>1) as release_targets_valid,
      not exists(select 1 from public.observatory_project_versions where semver is not null
        and semver !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') as semver_valid,
      not exists(select 1 from public.observatory_project_versions version
        join public.observatory_project_versions predecessor on predecessor.id=version.predecessor_version_id
        where predecessor.project_key<>version.project_key or predecessor.semver is null or version.semver is null
          or string_to_array(predecessor.semver,'.')::integer[] >= string_to_array(version.semver,'.')::integer[])
        and not exists(
          with recursive predecessor_chain(origin, id, predecessor_version_id, path, cycle) as (
            select id, id, predecessor_version_id, array[id], false
            from public.observatory_project_versions where predecessor_version_id is not null
            union all
            select chain.origin, version.id, version.predecessor_version_id,
              chain.path || version.id, version.id = any(chain.path)
            from predecessor_chain chain
            join public.observatory_project_versions version on version.id=chain.predecessor_version_id
            where not chain.cycle
          )
          select 1 from predecessor_chain where cycle
        ) as predecessors_valid
  `;
  if (!status || Object.values(status).some((value) => value !== true)) {
    const failed = Object.entries(status ?? {}).filter(([, value]) => value !== true).map(([key]) => key);
    throw new Error(`Database status verification failed: ${failed.join(", ") || "unavailable"}.`);
  }
  return { mode: "status" as const, ok: true, checks: Object.keys(status), rollbackGuidance: ROLLBACK_GUIDANCE };
}

async function applyMigration(sql: Sql) {
  const source = await readFile(DEFAULT_MIGRATION_PATH, "utf8");
  const body = source.replace(/^\s*begin;\s*/iu, "").replace(/\s*commit;\s*$/iu, "");
  await sql.begin(async (transaction) => {
    await transaction.unsafe(body);
    await transaction`
      insert into supabase_migrations.schema_migrations(version, statements, name)
      values (${MIGRATION_VERSION}, array[${source}], 'work_tracker_project_version_contract_v1')
      on conflict (version) do nothing
    `;
  });
}

export async function runProjectVersionContractVerifier(options: VerifierOptions) {
  if (options.mode === "source") return verifyProjectVersionContractSource();
  const databaseUrl = process.env.OBSERVATORY_DATABASE_URL ?? process.env.OBSERVATORY_LOCAL_DB_URL;
  if (!databaseUrl) throw new Error("Database status mode requires OBSERVATORY_DATABASE_URL or OBSERVATORY_LOCAL_DB_URL.");
  if (options.mode === "apply") assertLocalProjectVersionApplyTarget(databaseUrl);
  const sql = postgres(databaseUrl, { connect_timeout: 10, idle_timeout: 5, max: 1, onnotice: () => undefined });
  try {
    if (options.mode === "apply") await applyMigration(sql);
    return await readDatabaseStatus(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function formatProjectVersionVerifierError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown verifier failure.";
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "[DATABASE_URL_REDACTED]");
}

async function main() {
  try {
    const options = parseProjectVersionVerifierArgs(process.argv.slice(2));
    const result = await runProjectVersionContractVerifier(options);
    process.stdout.write(`${JSON.stringify(result)}\n${ROLLBACK_GUIDANCE}\n`);
  } catch (error) {
    const message = formatProjectVersionVerifierError(error);
    process.stderr.write(`OBSERVATORY_PROJECT_VERSION_CONTRACT_V1_VERIFY_FAILED: ${message}\n${ROLLBACK_GUIDANCE}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
