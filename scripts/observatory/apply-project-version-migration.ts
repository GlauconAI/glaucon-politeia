import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres, { type Sql, type TransactionSql } from "postgres";

const migrationVersion = "20260902000200";
const migrationName = "work_tracker_project_versions";
const migrationPath = resolve(
  "supabase/migrations/20260902000200_work_tracker_project_versions.sql",
);

function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function migrationBody(source: string): string {
  return source
    .replace(/^\s*begin;\s*/iu, "")
    .replace(/\s*commit;\s*$/iu, "");
}

async function readState(sql: Sql | TransactionSql) {
  const [state] = await sql<{
    versions_table: boolean;
    events_table: boolean;
    work_item_column: boolean;
    ensure_rpc: boolean;
    create_rpc: boolean;
    update_rpc: boolean;
    transition_rpc: boolean;
    migration_recorded: boolean;
  }[]>`
    select
      to_regclass('public.observatory_project_versions') is not null as versions_table,
      to_regclass('public.observatory_project_version_events') is not null as events_table,
      exists(
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'observatory_work_items'
          and column_name = 'project_version_id'
          and is_nullable = 'NO'
      ) as work_item_column,
      to_regprocedure('public.ensure_observatory_project_backlog_versions(text[])') is not null as ensure_rpc,
      to_regprocedure('public.create_observatory_project_version(text,text,text,text,date)') is not null as create_rpc,
      to_regprocedure('public.update_observatory_project_version(uuid,integer,text,text,text,date)') is not null as update_rpc,
      to_regprocedure('public.transition_observatory_project_version(uuid,integer,text)') is not null as transition_rpc,
      exists(
        select 1 from supabase_migrations.schema_migrations
        where version = ${migrationVersion}
      ) as migration_recorded
  `;
  const [counts] = state.versions_table && state.work_item_column
    ? await sql<{
        work_item_count: number;
        missing_version_count: number;
        mismatched_version_count: number;
        backlog_project_count: number;
      }[]>`
        select
          (select count(*)::integer from public.observatory_work_items) as work_item_count,
          (select count(*)::integer from public.observatory_work_items where project_version_id is null) as missing_version_count,
          (
            select count(*)::integer
            from public.observatory_work_items item
            join public.observatory_project_versions version
              on version.id = item.project_version_id
            where version.project_key <> coalesce(item.project_key, item.project_ref)
          ) as mismatched_version_count,
          (
            select count(distinct project_key)::integer
            from public.observatory_project_versions
            where is_backlog
          ) as backlog_project_count
      `
    : [{
        work_item_count: 0,
        missing_version_count: 0,
        mismatched_version_count: 0,
        backlog_project_count: 0,
      }];
  return { ...state, ...counts };
}

function assertComplete(state: Awaited<ReturnType<typeof readState>>) {
  const checks = {
    versionsTable: state?.versions_table === true,
    eventsTable: state?.events_table === true,
    workItemColumn: state?.work_item_column === true,
    boundedRpcs:
      state?.ensure_rpc === true &&
      state?.create_rpc === true &&
      state?.update_rpc === true &&
      state?.transition_rpc === true,
    allItemsAssigned: state?.missing_version_count === 0,
    projectConsistency: state?.mismatched_version_count === 0,
  };
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error("Project Version migration verification failed.");
  }
  return checks;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "check";
  if (!new Set(["check", "apply", "status"]).has(command)) {
    throw new Error("Usage: apply-project-version-migration.ts [check|apply|status]");
  }

  const envPath = process.env.GLAUCON_POLITEIA_ENV_FILE ?? ".env.local";
  const env = parseEnv(await readFile(resolve(envPath), "utf8"));
  const publicUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const databaseUrl = new URL(env.SUPABASE_DB_URL ?? "");
  const projectRef = publicUrl.hostname.split(".")[0];
  if (
    publicUrl.protocol !== "https:" ||
    !publicUrl.hostname.endsWith(".supabase.co") ||
    !databaseUrl.protocol.startsWith("postgres") ||
    !projectRef ||
    (!databaseUrl.hostname.includes(projectRef) &&
      !decodeURIComponent(databaseUrl.username).includes(projectRef))
  ) {
    throw new Error("Production Supabase target identity mismatch.");
  }

  const source = await readFile(migrationPath, "utf8");
  const body = migrationBody(source);
  const sql = postgres(env.SUPABASE_DB_URL, {
    ssl: "require",
    max: 1,
    connect_timeout: 15,
  });

  try {
    const before = await readState(sql);
    const objectStates = [
      before.versions_table,
      before.events_table,
      before.work_item_column,
      before.ensure_rpc,
      before.create_rpc,
      before.update_rpc,
      before.transition_rpc,
    ];
    const isAbsent = objectStates.every((value) => !value);
    const isComplete = objectStates.every(Boolean);
    if (!isAbsent && !isComplete) {
      throw new Error("Partial Project Version migration detected.");
    }

    if (command === "status") {
      const checks = isComplete ? assertComplete(before) : null;
      process.stdout.write(`${JSON.stringify({ status: "pass", applied: isComplete, checks }, null, 2)}\n`);
      return;
    }

    if (isAbsent) {
      const invalidProjects = await sql<{
        project_key: string | null;
        project_ref: string | null;
        item_count: number;
      }[]>`
        select project_key, project_ref, count(*)::integer as item_count
        from public.observatory_work_items
        where (
          coalesce(project_key, project_ref) is null
          or coalesce(project_key, project_ref) !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
        )
          and not (project_key is null and btrim(project_ref) = 'Dashboard')
        group by project_key, project_ref
        order by item_count desc, project_key nulls first, project_ref nulls first
      `;
      const [{ invalid_project_count: invalidProjectCount }] = await sql<{
        invalid_project_count: number;
      }[]>`
        select count(*)::integer as invalid_project_count
        from public.observatory_work_items
        where (
          coalesce(project_key, project_ref) is null
          or coalesce(project_key, project_ref) !~ '^[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*$'
        )
          and not (project_key is null and btrim(project_ref) = 'Dashboard')
      `;
      if (invalidProjectCount !== 0) {
        throw new Error(
          `Existing Work Items contain invalid Project references: ${JSON.stringify(invalidProjects)}.`,
        );
      }
    }

    if (command === "check") {
      if (isComplete) {
        process.stdout.write(`${JSON.stringify({ status: "pass", alreadyApplied: true, checks: assertComplete(before) }, null, 2)}\n`);
        return;
      }
      await sql.unsafe("begin");
      try {
        await sql.unsafe(body);
        const candidate = await readState(sql);
        const checks = assertComplete(candidate);
        process.stdout.write(`${JSON.stringify({ status: "pass", dryRun: true, workItems: candidate.work_item_count, checks }, null, 2)}\n`);
      } finally {
        await sql.unsafe("rollback");
      }
      return;
    }

    if (!isComplete) {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(body);
        assertComplete(await readState(transaction));
        await transaction`
          insert into supabase_migrations.schema_migrations (version, statements, name)
          values (${migrationVersion}, ${transaction.array([body])}, ${migrationName})
          on conflict (version) do nothing
        `;
      });
    }
    const after = await readState(sql);
    const checks = assertComplete(after);
    if (!after.migration_recorded) {
      throw new Error("Project Version migration history was not recorded.");
    }
    process.stdout.write(`${JSON.stringify({ status: "pass", applied: !isComplete, workItems: after.work_item_count, checks }, null, 2)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : "Unknown migration error.";
  process.stderr.write(`PROJECT_VERSION_MIGRATION_FAILED: ${detail}\n`);
  process.exitCode = 1;
});
