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
    versions_rls: boolean;
    events_rls: boolean;
    versions_admin_policy: boolean;
    events_admin_policy: boolean;
    authenticated_versions_select: boolean;
    authenticated_events_select: boolean;
    authenticated_direct_mutation_denied: boolean;
    anon_table_access_denied: boolean;
    authenticated_rpc_execute: boolean;
    anon_rpc_execute_denied: boolean;
    validation_trigger: boolean;
    work_item_version_fk: boolean;
    project_label_unique_index: boolean;
    one_backlog_unique_index: boolean;
    lifecycle_status_constraint: boolean;
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
      ) as work_item_column,
      to_regprocedure('public.ensure_observatory_project_backlog_versions(text[])') is not null as ensure_rpc,
      to_regprocedure('public.create_observatory_project_version(text,text,text,text,date)') is not null as create_rpc,
      to_regprocedure('public.update_observatory_project_version(uuid,integer,text,text,text,date)') is not null as update_rpc,
      to_regprocedure('public.transition_observatory_project_version(uuid,integer,text)') is not null as transition_rpc,
      exists(
        select 1 from pg_class
        where oid = to_regclass('public.observatory_project_versions') and relrowsecurity
      ) as versions_rls,
      exists(
        select 1 from pg_class
        where oid = to_regclass('public.observatory_project_version_events') and relrowsecurity
      ) as events_rls,
      exists(
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'observatory_project_versions'
          and policyname = 'observatory_project_versions_select_admin'
          and cmd = 'SELECT' and roles @> array['authenticated']::name[]
      ) as versions_admin_policy,
      exists(
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'observatory_project_version_events'
          and policyname = 'observatory_project_version_events_select_admin'
          and cmd = 'SELECT' and roles @> array['authenticated']::name[]
      ) as events_admin_policy,
      case when to_regclass('public.observatory_project_versions') is not null
        then has_table_privilege('authenticated', 'public.observatory_project_versions', 'SELECT')
        else false end as authenticated_versions_select,
      case when to_regclass('public.observatory_project_version_events') is not null
        then has_table_privilege('authenticated', 'public.observatory_project_version_events', 'SELECT')
        else false end as authenticated_events_select,
      case when to_regclass('public.observatory_project_versions') is not null
          and to_regclass('public.observatory_project_version_events') is not null
        then not has_table_privilege('authenticated', 'public.observatory_project_versions', 'INSERT')
          and not has_table_privilege('authenticated', 'public.observatory_project_versions', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.observatory_project_versions', 'DELETE')
          and not has_table_privilege('authenticated', 'public.observatory_project_version_events', 'INSERT')
          and not has_table_privilege('authenticated', 'public.observatory_project_version_events', 'UPDATE')
          and not has_table_privilege('authenticated', 'public.observatory_project_version_events', 'DELETE')
        else false end as authenticated_direct_mutation_denied,
      case when to_regclass('public.observatory_project_versions') is not null
          and to_regclass('public.observatory_project_version_events') is not null
        then not has_table_privilege('anon', 'public.observatory_project_versions', 'SELECT')
          and not has_table_privilege('anon', 'public.observatory_project_version_events', 'SELECT')
        else false end as anon_table_access_denied,
      case when to_regprocedure('public.ensure_observatory_project_backlog_versions(text[])') is not null
        then has_function_privilege('authenticated', 'public.ensure_observatory_project_backlog_versions(text[])', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.create_observatory_project_version(text,text,text,text,date)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.update_observatory_project_version(uuid,integer,text,text,text,date)', 'EXECUTE')
          and has_function_privilege('authenticated', 'public.transition_observatory_project_version(uuid,integer,text)', 'EXECUTE')
        else false end as authenticated_rpc_execute,
      case when to_regprocedure('public.ensure_observatory_project_backlog_versions(text[])') is not null
        then not has_function_privilege('anon', 'public.ensure_observatory_project_backlog_versions(text[])', 'EXECUTE')
          and not has_function_privilege('anon', 'public.create_observatory_project_version(text,text,text,text,date)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.update_observatory_project_version(uuid,integer,text,text,text,date)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.transition_observatory_project_version(uuid,integer,text)', 'EXECUTE')
        else false end as anon_rpc_execute_denied,
      exists(
        select 1 from pg_trigger
        where tgrelid = to_regclass('public.observatory_work_items')
          and tgname = 'observatory_work_items_validate_project_version'
          and tgenabled <> 'D' and not tgisinternal
      ) as validation_trigger,
      exists(
        select 1 from pg_constraint
        where conrelid = to_regclass('public.observatory_work_items')
          and confrelid = to_regclass('public.observatory_project_versions')
          and contype = 'f'
      ) as work_item_version_fk,
      to_regclass('public.observatory_project_versions_project_label_idx') is not null
        as project_label_unique_index,
      to_regclass('public.observatory_project_versions_one_backlog_idx') is not null
        as one_backlog_unique_index,
      exists(
        select 1 from pg_constraint
        where conrelid = to_regclass('public.observatory_project_versions')
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%planned%active%released%archived%'
      ) as lifecycle_status_constraint,
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
        missing_backlog_project_count: number;
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
          ) as backlog_project_count,
          (
            select count(*)::integer
            from (
              select distinct coalesce(item.project_key, item.project_ref) as project_key
              from public.observatory_work_items item
              where coalesce(item.project_key, item.project_ref) is not null
            ) item_project
            where not exists (
              select 1 from public.observatory_project_versions version
              where version.project_key = item_project.project_key and version.is_backlog
            )
          ) as missing_backlog_project_count
      `
    : [{
        work_item_count: 0,
        missing_version_count: 0,
        mismatched_version_count: 0,
        backlog_project_count: 0,
        missing_backlog_project_count: 0,
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
    rowLevelSecurity: state?.versions_rls === true && state?.events_rls === true,
    adminSelectPolicies: state?.versions_admin_policy === true && state?.events_admin_policy === true,
    tablePrivileges:
      state?.authenticated_versions_select === true &&
      state?.authenticated_events_select === true &&
      state?.authenticated_direct_mutation_denied === true &&
      state?.anon_table_access_denied === true,
    rpcPrivileges:
      state?.authenticated_rpc_execute === true && state?.anon_rpc_execute_denied === true,
    validationTrigger: state?.validation_trigger === true,
    foreignKey: state?.work_item_version_fk === true,
    uniqueIndexes:
      state?.project_label_unique_index === true && state?.one_backlog_unique_index === true,
    lifecycleConstraint: state?.lifecycle_status_constraint === true,
    backlogCoverage: state?.missing_backlog_project_count === 0,
    projectConsistency: state?.mismatched_version_count === 0,
  };
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error("Project Version migration verification failed.");
  }
  return checks;
}

async function exerciseBacklogRpc(sql: Sql | TransactionSql): Promise<void> {
  const [admin] = await sql<{ user_id: string }[]>`
    select user_id::text as user_id
    from public.profiles
    where is_admin = true
    order by created_at
    limit 1
  `;
  if (!admin?.user_id) throw new Error("No administrator is available for RPC verification.");
  await sql`select set_config('request.jwt.claim.sub', ${admin.user_id}, true)`;
  const rows = await sql<{ project_key: string; is_backlog: boolean }[]>`
    select project_key, is_backlog
    from public.ensure_observatory_project_backlog_versions(array['plato/dashboard'])
  `;
  if (!rows.some((row) => row.project_key === "plato/dashboard" && row.is_backlog)) {
    throw new Error("Backlog synchronization RPC verification failed.");
  }
}

async function exerciseArchivedVersionGuard(sql: Sql | TransactionSql): Promise<void> {
  const [version] = await sql<{ id: string; row_version: number }[]>`
    select id::text as id, row_version
    from public.create_observatory_project_version(
      'plato/dashboard',
      'migration-check',
      'Migration guard check',
      '',
      null
    )
  `;
  if (!version) throw new Error("Unable to create the archived-version guard fixture.");
  await sql`
    select id
    from public.transition_observatory_project_version(
      ${version.id}::uuid,
      ${version.row_version},
      'archived'
    )
  `;

  await sql`select set_config('app.migration_version_id', ${version.id}, true)`;
  await sql.unsafe(`
    do $guard$
    declare
      rejected boolean := false;
    begin
      begin
        perform public.create_observatory_work_item(
          'idea',
          'Migration guard check',
          '',
          'plato/dashboard',
          'plato',
          current_setting('app.migration_version_id')::uuid,
          'project-version-migration-guard'
        );
      exception when sqlstate '22023' then
        if position('OBSERVATORY_PROJECT_VERSION_ARCHIVED' in sqlerrm) > 0 then
          rejected := true;
        else
          raise;
        end if;
      end;
      if not rejected then
        raise exception 'Archived Project Version assignment was not rejected.';
      end if;
    end
    $guard$;
  `);
}

async function exerciseNonAdminDenial(sql: Sql | TransactionSql): Promise<void> {
  await sql`select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000099', true)`;
  await sql.unsafe(`
    do $guard$
    declare
      rejected boolean := false;
    begin
      begin
        perform public.ensure_observatory_project_backlog_versions(array['plato/dashboard']);
      exception when insufficient_privilege then
        rejected := true;
      end;
      if not rejected then
        raise exception 'Non-admin Project Version mutation was not rejected.';
      end if;
    end
    $guard$;
  `);
}

async function exerciseWorkItemAuditContract(sql: Sql | TransactionSql): Promise<void> {
  const [admin] = await sql<{ user_id: string }[]>`
    select user_id::text as user_id
    from public.profiles
    where is_admin = true
    order by created_at
    limit 1
  `;
  if (!admin?.user_id) throw new Error("No administrator is available for audit verification.");
  await sql`select set_config('request.jwt.claim.sub', ${admin.user_id}, true)`;
  const [backlog] = await sql<{ id: string }[]>`
    select id::text as id
    from public.observatory_project_versions
    where project_key = 'plato/dashboard' and is_backlog
    limit 1
  `;
  if (!backlog?.id) throw new Error("No Backlog version is available for audit verification.");
  const [created] = await sql<{ id: string; version: number }[]>`
    select id::text as id, version
    from public.create_observatory_work_item(
      'idea',
      'Migration audit check',
      '',
      'plato/dashboard',
      'plato',
      ${backlog.id}::uuid,
      'project-version-migration-audit-check'
    )
  `;
  if (!created) throw new Error("Unable to create the Work Item audit fixture.");
  await sql`
    select id
    from public.update_observatory_work_item(
      ${created.id}::uuid,
      ${created.version},
      'bug',
      'Migration audit check updated',
      'Updated description',
      'Updated acceptance criteria',
      'high',
      ${admin.user_id}::uuid,
      'plato',
      'plato/dashboard',
      'migration-check',
      null::text,
      null::integer,
      null::text,
      null::text,
      ${backlog.id}::uuid
    )
  `;
  const [event] = await sql<{ data: { before?: Record<string, unknown>; after?: Record<string, unknown> } }[]>`
    select data
    from public.observatory_work_item_events
    where work_item_id = ${created.id}::uuid and event_type = 'updated'
    order by created_at desc
    limit 1
  `;
  const requiredFields = [
    "type", "title", "description", "acceptance_criteria", "priority", "owner_id",
    "project_ref", "milestone_ref", "project_key", "plan_revision", "stage_id",
    "work_package_id", "project_version_id", "assigned_agent_id", "state", "version",
  ];
  if (!event?.data?.before || !event.data.after) {
    throw new Error("Work Item update audit event was not recorded.");
  }
  for (const field of requiredFields) {
    if (!(field in event.data.before) || !(field in event.data.after)) {
      throw new Error(`Work Item update audit event is missing ${field}.`);
    }
  }
  if (
    event.data.before.description !== "" ||
    event.data.after.description !== "Updated description" ||
    event.data.after.project_version_id !== backlog.id
  ) {
    throw new Error("Work Item update audit event did not preserve before/after values.");
  }
}

async function readWorkItemTimestamps(sql: Sql | TransactionSql) {
  return sql<{ id: string; updated_at: string }[]>`
    select id::text as id, updated_at::text as updated_at
    from public.observatory_work_items
    order by id
  `;
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

    if (command === "check") {
      if (isComplete) {
        process.stdout.write(`${JSON.stringify({ status: "pass", alreadyApplied: true, checks: assertComplete(before) }, null, 2)}\n`);
        return;
      }
      const timestampsBefore = await readWorkItemTimestamps(sql);
      await sql.unsafe("begin");
      try {
        await sql.unsafe(body);
        const timestampsAfterMigration = await readWorkItemTimestamps(sql);
        if (JSON.stringify(timestampsAfterMigration) !== JSON.stringify(timestampsBefore)) {
          throw new Error("Work Item timestamps changed during migration backfill.");
        }
        await exerciseBacklogRpc(sql);
        await exerciseArchivedVersionGuard(sql);
        await exerciseNonAdminDenial(sql);
        await exerciseWorkItemAuditContract(sql);
        const candidate = await readState(sql);
        const checks = assertComplete(candidate);
        process.stdout.write(`${JSON.stringify({ status: "pass", dryRun: true, workItems: candidate.work_item_count, unassignedLegacyItems: candidate.missing_version_count, checks }, null, 2)}\n`);
      } finally {
        await sql.unsafe("rollback");
      }
      return;
    }

    if (!isComplete) {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(body);
        await exerciseBacklogRpc(transaction);
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
    process.stdout.write(`${JSON.stringify({ status: "pass", applied: !isComplete, workItems: after.work_item_count, unassignedLegacyItems: after.missing_version_count, checks }, null, 2)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : "Unknown migration error.";
  process.stderr.write(`PROJECT_VERSION_MIGRATION_FAILED: ${detail}\n`);
  process.exitCode = 1;
});
