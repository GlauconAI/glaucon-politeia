import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres, { type Sql, type TransactionSql } from "postgres";

import { assertProductionSupabaseTarget } from "./deploy-project-version-contract-v1.ts";

const MIGRATION_VERSION = "20260926000100";
const MIGRATION_NAME = "concerto_agent_work_item_api";
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260926000100_concerto_agent_work_item_api.sql",
);

type DeploymentCommand = "check" | "apply" | "status";
type Database = Sql | TransactionSql;

function parseCommand(argv: string[]): DeploymentCommand {
  const command = argv[0] ?? "check";
  if (!["check", "apply", "status"].includes(command) || argv.length > 1) {
    throw new Error(
      "Usage: deploy-concerto-agent-work-item-api.ts [check|apply|status]",
    );
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
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function migrationBody(source: string) {
  return source
    .replace(/^\s*begin;\s*/iu, "")
    .replace(/\s*commit;\s*$/iu, "");
}

async function migrationRecorded(sql: Database) {
  const [row] = await sql<{ recorded: boolean }[]>`
    select exists(
      select 1 from supabase_migrations.schema_migrations
      where version = ${MIGRATION_VERSION}
    ) as recorded
  `;
  return row?.recorded === true;
}

async function readContractStatus(sql: Database) {
  const createSignature =
    "public.create_observatory_work_item_as_agent(text,text,text,text,text,uuid,text,text,text)";
  const commandSignature =
    "public.execute_observatory_agent_work_item_command(text,boolean,text,uuid,integer,text,jsonb,text,text)";
  const [row] = await sql<{
    creator_column: boolean;
    operations_table: boolean;
    operations_rls: boolean;
    create_rpc: boolean;
    command_rpc: boolean;
    create_service_execute: boolean;
    command_service_execute: boolean;
    anon_denied: boolean;
    authenticated_denied: boolean;
    operations_direct_write_denied: boolean;
  }[]>`
    select
      exists(
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'observatory_work_items'
          and column_name = 'created_by_agent'
      ) as creator_column,
      to_regclass('public.observatory_agent_work_item_operations') is not null
        as operations_table,
      coalesce((
        select relrowsecurity from pg_class
        where oid = to_regclass('public.observatory_agent_work_item_operations')
      ), false) as operations_rls,
      to_regprocedure(${createSignature}) is not null as create_rpc,
      to_regprocedure(${commandSignature}) is not null as command_rpc,
      has_function_privilege('service_role', ${createSignature}, 'EXECUTE')
        as create_service_execute,
      has_function_privilege('service_role', ${commandSignature}, 'EXECUTE')
        as command_service_execute,
      not has_function_privilege('anon', ${createSignature}, 'EXECUTE')
        and not has_function_privilege('anon', ${commandSignature}, 'EXECUTE')
        as anon_denied,
      not has_function_privilege('authenticated', ${createSignature}, 'EXECUTE')
        and not has_function_privilege('authenticated', ${commandSignature}, 'EXECUTE')
        as authenticated_denied,
      not has_table_privilege(
        'service_role',
        'public.observatory_agent_work_item_operations',
        'INSERT'
      )
        and not has_table_privilege(
          'authenticated',
          'public.observatory_agent_work_item_operations',
          'INSERT'
        )
        as operations_direct_write_denied
  `;
  if (!row || Object.values(row).some((value) => value !== true)) {
    throw new Error("Concerto Agent API catalog or privilege verification failed.");
  }
  return row;
}

async function verifyAgentRpc(transaction: TransactionSql) {
  await transaction`
    select set_config('request.jwt.claim.role', 'service_role', true)
  `;
  const [projectVersion] = await transaction<{
    id: string;
    project_key: string;
  }[]>`
    select id::text as id, project_key
    from public.observatory_project_versions
    where status not in ('released', 'archived', 'cancelled')
    order by is_backlog desc, created_at
    limit 1
  `;
  if (!projectVersion) {
    throw new Error("No bindable Project Version exists for Agent API verification.");
  }
  const operation = randomUUID();
  let created: { result: Record<string, any> } | undefined;
  try {
    [created] = await transaction<{ result: Record<string, any> }[]>`
      select public.create_observatory_work_item_as_agent(
        'plato',
        'feature',
        'Concerto Agent API rollback probe',
        'Rollback-only production verification.',
        ${projectVersion.project_key},
        ${projectVersion.id},
        'optional',
        ${`probe:create:${operation}`},
        ${"a".repeat(64)}
      ) as result
    `;
  } catch (error) {
    throw new Error(
      `Create RPC probe failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  const item = created?.result?.workItem;
  if (!item?.id || item.assigned_agent_id !== "plato" || item.state !== "inbox") {
    throw new Error("Agent create RPC returned an invalid Work Item.");
  }
  let updated: { result: Record<string, any> } | undefined;
  try {
    [updated] = await transaction<{ result: Record<string, any> }[]>`
      select public.execute_observatory_agent_work_item_command(
        'plato',
        true,
        ${projectVersion.project_key},
        ${item.id},
        ${Number(item.version)},
        'update',
        ${transaction.json({ description: "Verified through rollback." })},
        ${`probe:update:${operation}`},
        ${"b".repeat(64)}
      ) as result
    `;
  } catch (error) {
    throw new Error(
      `Command RPC probe failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  if (updated?.result?.workItem?.version !== item.version + 1) {
    throw new Error("Agent command RPC did not advance the optimistic version.");
  }
  const [events] = await transaction<{ count: number }[]>`
    select count(*)::integer as count
    from public.observatory_work_item_events
    where work_item_id = ${item.id}
      and agent_id = 'plato'
      and actor_id is null
  `;
  const [operations] = await transaction<{ count: number }[]>`
    select count(*)::integer as count
    from public.observatory_agent_work_item_operations
    where work_item_id = ${item.id}
      and agent_id = 'plato'
  `;
  if ((events?.count ?? 0) < 2 || operations?.count !== 2) {
    throw new Error("Agent API audit or idempotency evidence is incomplete.");
  }
  return {
    workItemId: item.id as string,
    beforeVersion: item.version as number,
    afterVersion: updated.result.workItem.version as number,
    events: events.count,
    operations: operations.count,
  };
}

async function verifyWithRollback(sql: Sql) {
  await sql.unsafe("begin");
  try {
    return await verifyAgentRpc(sql as unknown as TransactionSql);
  } finally {
    await sql.unsafe("rollback");
  }
}

export async function deployConcertoAgentWorkItemApi(
  command: DeploymentCommand,
) {
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
      if (!recorded) {
        return {
          status: "pass" as const,
          applied: false,
          projectRef: target.projectRef,
        };
      }
      return {
        status: "pass" as const,
        applied: true,
        projectRef: target.projectRef,
        verified: await readContractStatus(sql),
        rpcProbe: await verifyWithRollback(sql),
      };
    }
    if (recorded) {
      return {
        status: "pass" as const,
        alreadyApplied: true,
        projectRef: target.projectRef,
        verified: await readContractStatus(sql),
        rpcProbe: await verifyWithRollback(sql),
      };
    }
    if (command === "check") {
      await sql.unsafe("begin");
      try {
        await sql.unsafe(body);
        await sql`
          insert into supabase_migrations.schema_migrations(
            version, statements, name
          ) values (
            ${MIGRATION_VERSION}, ${sql.array([source])}, ${MIGRATION_NAME}
          )
        `;
        return {
          status: "pass" as const,
          dryRun: true,
          projectRef: target.projectRef,
          verified: await readContractStatus(sql),
          rpcProbe: await verifyAgentRpc(sql as unknown as TransactionSql),
        };
      } finally {
        await sql.unsafe("rollback");
      }
    }

    let verifiedBeforeCommit;
    await sql.begin(async (transaction) => {
      await transaction.unsafe(body);
      await transaction`
        insert into supabase_migrations.schema_migrations(
          version, statements, name
        ) values (
          ${MIGRATION_VERSION},
          ${transaction.array([source])},
          ${MIGRATION_NAME}
        )
      `;
      verifiedBeforeCommit = await readContractStatus(transaction);
      await verifyAgentRpc(transaction);
    });
    return {
      status: "pass" as const,
      applied: true,
      projectRef: target.projectRef,
      verifiedBeforeCommit,
      verified: await readContractStatus(sql),
      rpcProbe: await verifyWithRollback(sql),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  try {
    const result = await deployConcertoAgentWorkItemApi(
      parseCommand(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `CONCERTO_AGENT_WORK_ITEM_API_DEPLOY_FAILED: ${
        error instanceof Error ? error.message : "unknown error"
      }\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main();
}
