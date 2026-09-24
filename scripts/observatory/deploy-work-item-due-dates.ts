import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres, { type Sql, type TransactionSql } from "postgres";

import { assertProductionSupabaseTarget } from "./deploy-project-version-contract-v1.ts";

const MIGRATION_VERSION = "20260923000100";
const MIGRATION_NAME = "work_tracker_due_dates";
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260923000100_work_tracker_due_dates.sql",
);

type DeploymentCommand = "check" | "apply" | "status";
type Database = Sql | TransactionSql;

function parseCommand(argv: string[]): DeploymentCommand {
  const command = argv[0] ?? "check";
  if (!["check", "apply", "status"].includes(command) || argv.length > 1) {
    throw new Error("Usage: deploy-work-item-due-dates.ts [check|apply|status]");
  }
  return command as DeploymentCommand;
}

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
    ) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function migrationBody(source: string): string {
  return source
    .replace(/^\s*begin;\s*/iu, "")
    .replace(/\s*commit;\s*$/iu, "");
}

async function migrationRecorded(sql: Database): Promise<boolean> {
  const [row] = await sql<{ recorded: boolean }[]>`
    select exists(
      select 1
      from supabase_migrations.schema_migrations
      where version = ${MIGRATION_VERSION}
    ) as recorded
  `;
  return row?.recorded === true;
}

async function readContractStatus(sql: Database) {
  const [row] = await sql<{
    due_column: boolean;
    due_index: boolean;
    canonical_rpc: boolean;
    compatibility_rpc: boolean;
    authenticated_execute: boolean;
    anon_execute_denied: boolean;
    service_execute_denied: boolean;
    direct_mutation_denied: boolean;
  }[]>`
    select
      exists(
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'observatory_work_items'
          and column_name = 'due_on'
          and data_type = 'date'
          and is_nullable = 'YES'
      ) as due_column,
      to_regclass('public.observatory_work_items_open_due_on_idx') is not null as due_index,
      to_regprocedure(
        'public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text,date)'
      ) is not null as canonical_rpc,
      to_regprocedure(
        'public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text)'
      ) is not null as compatibility_rpc,
      has_function_privilege(
        'authenticated',
        'public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text,date)',
        'EXECUTE'
      ) as authenticated_execute,
      not has_function_privilege(
        'anon',
        'public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text,date)',
        'EXECUTE'
      ) as anon_execute_denied,
      not has_function_privilege(
        'service_role',
        'public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text,date)',
        'EXECUTE'
      ) as service_execute_denied,
      not has_table_privilege('authenticated', 'public.observatory_work_items', 'INSERT')
        and not has_table_privilege('authenticated', 'public.observatory_work_items', 'UPDATE')
        and not has_table_privilege('authenticated', 'public.observatory_work_items', 'DELETE')
        as direct_mutation_denied
  `;
  if (!row || Object.values(row).some((value) => value !== true)) {
    throw new Error("Work Item due-date schema or privilege verification failed.");
  }
  return row;
}

async function verifyAuditedRpc(transaction: TransactionSql) {
  const [admin] = await transaction<{ user_id: string }[]>`
    select user_id::text as user_id
    from public.profiles
    where is_admin = true
    order by user_id
    limit 1
  `;
  if (!admin) throw new Error("No administrator profile is available for RPC verification.");
  await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
  await transaction`select set_config('request.jwt.claim.sub', ${admin.user_id}, true)`;
  await transaction.unsafe("set local role authenticated");

  const [current] = await transaction<{
    id: string;
    version: number;
    type: string;
    title: string;
    description: string;
    acceptance_criteria: string;
    priority: string | null;
    owner_id: string | null;
    assigned_agent_id: string;
    project_ref: string | null;
    milestone_ref: string | null;
    project_key: string | null;
    plan_revision: number | null;
    stage_id: string | null;
    work_package_id: string | null;
    project_version_id: string;
    version_binding_kind: string;
    due_on: string | null;
  }[]>`
    select id::text as id, version, type, title, description,
      acceptance_criteria, priority, owner_id::text as owner_id,
      assigned_agent_id, project_ref, milestone_ref, project_key, plan_revision,
      stage_id, work_package_id, project_version_id::text as project_version_id,
      version_binding_kind, due_on::text as due_on
    from public.observatory_work_items
    order by created_at, id
    limit 1
  `;
  if (!current) throw new Error("No Work Item is available for RPC verification.");
  const probeDueOn = current.due_on === "2099-12-31" ? null : "2099-12-31";
  const [updated] = await transaction<{ version: number; due_on: string | null }[]>`
    select version, due_on::text as due_on
    from public.update_observatory_work_item(
      p_work_item_id => ${current.id},
      p_expected_version => ${current.version},
      p_type => ${current.type},
      p_title => ${current.title},
      p_description => ${current.description},
      p_acceptance_criteria => ${current.acceptance_criteria},
      p_priority => ${current.priority},
      p_owner_id => ${current.owner_id},
      p_assigned_agent_id => ${current.assigned_agent_id},
      p_project_ref => ${current.project_ref},
      p_milestone_ref => ${current.milestone_ref},
      p_project_key => ${current.project_key},
      p_plan_revision => ${current.plan_revision},
      p_stage_id => ${current.stage_id},
      p_work_package_id => ${current.work_package_id},
      p_project_version_id => ${current.project_version_id},
      p_version_binding_kind => ${current.version_binding_kind},
      p_due_on => ${probeDueOn}
    )
  `;
  if (!updated || updated.version !== current.version + 1 || updated.due_on !== probeDueOn) {
    throw new Error("Due-date RPC did not persist the versioned update.");
  }
  const [event] = await transaction<{ before_due_on: string | null; after_due_on: string | null }[]>`
    select data -> 'before' ->> 'due_on' as before_due_on,
      data -> 'after' ->> 'due_on' as after_due_on
    from public.observatory_work_item_events
    where work_item_id = ${current.id}
      and event_type = 'updated'
    order by created_at desc, id desc
    limit 1
  `;
  if (!event || event.before_due_on !== current.due_on || event.after_due_on !== probeDueOn) {
    throw new Error("Due-date RPC audit evidence is incomplete.");
  }
  return { workItemId: current.id, before: current.due_on, after: probeDueOn };
}

async function verifyRpcWithRollback(sql: Sql) {
  await sql.unsafe("begin");
  try {
    const result = await verifyAuditedRpc(sql as unknown as TransactionSql);
    return result;
  } finally {
    await sql.unsafe("rollback");
  }
}

export async function deployWorkItemDueDates(command: DeploymentCommand) {
  const envPath = process.env.GLAUCON_POLITEIA_ENV_FILE ?? ".env.local";
  const env = parseEnv(await readFile(resolve(envPath), "utf8"));
  const target = assertProductionSupabaseTarget(env);
  const source = await readFile(MIGRATION_PATH, "utf8");
  const body = migrationBody(source);
  const sql = postgres(target.databaseUrl, {
    ssl: "require",
    max: 1,
    connect_timeout: 15,
    idle_timeout: 10,
    onnotice: () => undefined,
  });

  try {
    const recorded = await migrationRecorded(sql);
    if (command === "status") {
      if (!recorded) return { status: "pass" as const, applied: false, projectRef: target.projectRef };
      return {
        status: "pass" as const,
        applied: true,
        projectRef: target.projectRef,
        verified: await readContractStatus(sql),
        rpcProbe: await verifyRpcWithRollback(sql),
      };
    }
    if (recorded) {
      return {
        status: "pass" as const,
        alreadyApplied: true,
        projectRef: target.projectRef,
        verified: await readContractStatus(sql),
        rpcProbe: await verifyRpcWithRollback(sql),
      };
    }
    if (command === "check") {
      await sql.unsafe("begin");
      try {
        await sql.unsafe(body);
        await sql`
          insert into supabase_migrations.schema_migrations(version, statements, name)
          values (${MIGRATION_VERSION}, ${sql.array([source])}, ${MIGRATION_NAME})
        `;
        return {
          status: "pass" as const,
          dryRun: true,
          projectRef: target.projectRef,
          verified: await readContractStatus(sql),
          rpcProbe: await verifyAuditedRpc(sql as unknown as TransactionSql),
        };
      } finally {
        await sql.unsafe("rollback");
      }
    }

    let verifiedBeforeCommit;
    await sql.begin(async (transaction) => {
      await transaction.unsafe(body);
      await transaction`
        insert into supabase_migrations.schema_migrations(version, statements, name)
        values (${MIGRATION_VERSION}, ${transaction.array([source])}, ${MIGRATION_NAME})
      `;
      verifiedBeforeCommit = await readContractStatus(transaction);
    });
    return {
      status: "pass" as const,
      applied: true,
      projectRef: target.projectRef,
      verifiedBeforeCommit,
      verified: await readContractStatus(sql),
      rpcProbe: await verifyRpcWithRollback(sql),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  try {
    const result = await deployWorkItemDueDates(parseCommand(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `WORK_TRACKER_DUE_DATES_DEPLOY_FAILED: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
