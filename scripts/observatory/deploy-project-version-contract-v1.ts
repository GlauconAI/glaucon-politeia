import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import postgres from "postgres";

import {
  assertProjectVersionPreflightAllowsApply,
  formatProjectVersionVerifierError,
  readProjectVersionContractPreflight,
  readProjectVersionContractStatus,
} from "./verify-project-version-contract-v1.ts";

const MIGRATION_VERSION = "20260902000300";
const MIGRATION_NAME = "work_tracker_project_version_contract_v1";
const PRODUCTION_PROJECT_REF = "fiicazfhjkviqaaaiksp";
const MIGRATION_PATH = resolve(
  "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql",
);

export type DeploymentCommand = "check" | "apply" | "status";

export function parseDeploymentCommand(argv: string[]): DeploymentCommand {
  const command = argv[0] ?? "check";
  if (!new Set<DeploymentCommand>(["check", "apply", "status"]).has(command as DeploymentCommand)) {
    throw new Error("Usage: deploy-project-version-contract-v1.ts [check|apply|status]");
  }
  if (argv.length > 1) throw new Error("Unexpected deployment arguments.");
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
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

export function assertProductionSupabaseTarget(env: Record<string, string>) {
  const publicUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const databaseUrl = new URL(env.SUPABASE_DB_URL ?? "");
  const projectRef = publicUrl.hostname.split(".")[0];
  const databaseUsername = decodeURIComponent(databaseUrl.username);
  const directDatabaseTarget = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
  const poolerDatabaseTarget = databaseUrl.hostname.endsWith(".pooler.supabase.com")
    && databaseUsername === `postgres.${projectRef}`;
  if (
    publicUrl.protocol !== "https:"
    || !publicUrl.hostname.endsWith(".supabase.co")
    || !databaseUrl.protocol.startsWith("postgres")
    || projectRef !== PRODUCTION_PROJECT_REF
    || (!directDatabaseTarget && !poolerDatabaseTarget)
  ) throw new Error("Production Supabase target identity mismatch.");
  return { databaseUrl: env.SUPABASE_DB_URL, projectRef };
}

function migrationBody(source: string) {
  return source.replace(/^\s*begin;\s*/iu, "").replace(/\s*commit;\s*$/iu, "");
}

async function migrationRecorded(sql: ReturnType<typeof postgres>) {
  const [row] = await sql<{ recorded: boolean }[]>`
    select exists(
      select 1 from supabase_migrations.schema_migrations where version=${MIGRATION_VERSION}
    ) as recorded
  `;
  return row?.recorded === true;
}

async function workItemTimestamps(sql: ReturnType<typeof postgres>) {
  return sql<{ id: string; updated_at: string }[]>`
    select id::text as id, updated_at::text as updated_at
    from public.observatory_work_items order by id
  `;
}

export async function deployProjectVersionContract(command: DeploymentCommand) {
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
      const verified = await readProjectVersionContractStatus(sql);
      return { status: "pass" as const, applied: true, projectRef: target.projectRef, verified };
    }
    if (recorded) {
      const verified = await readProjectVersionContractStatus(sql);
      return { status: "pass" as const, alreadyApplied: true, projectRef: target.projectRef, verified };
    }

    const preflight = await readProjectVersionContractPreflight({
      unsafe: (statement: string) => sql.unsafe(statement),
    });
    assertProjectVersionPreflightAllowsApply(preflight);

    if (command === "check") {
      const before = await workItemTimestamps(sql);
      await sql.unsafe("begin");
      try {
        await sql.unsafe(body);
        await sql`
          insert into supabase_migrations.schema_migrations(version, statements, name)
          values (${MIGRATION_VERSION}, ${sql.array([source])}, ${MIGRATION_NAME})
          on conflict (version) do nothing
        `;
        const verified = await readProjectVersionContractStatus(sql);
        const after = await workItemTimestamps(sql);
        if (JSON.stringify(after) !== JSON.stringify(before)) {
          throw new Error("Work Item timestamps changed during the migration dry run.");
        }
        return {
          status: "pass" as const,
          dryRun: true,
          projectRef: target.projectRef,
          preflight,
          verified,
        };
      } finally {
        await sql.unsafe("rollback");
      }
    }

    let verifiedBeforeCommit: Awaited<ReturnType<typeof readProjectVersionContractStatus>> | undefined;
    await sql.begin(async (transaction) => {
      await transaction.unsafe(body);
      await transaction`
        insert into supabase_migrations.schema_migrations(version, statements, name)
        values (${MIGRATION_VERSION}, ${transaction.array([source])}, ${MIGRATION_NAME})
        on conflict (version) do nothing
      `;
      verifiedBeforeCommit = await readProjectVersionContractStatus(transaction);
    });
    const verified = await readProjectVersionContractStatus(sql);
    return {
      status: "pass" as const,
      applied: true,
      projectRef: target.projectRef,
      preflight,
      verifiedBeforeCommit,
      verified,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  try {
    const result = await deployProjectVersionContract(parseDeploymentCommand(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `OBSERVATORY_PROJECT_VERSION_CONTRACT_V1_DEPLOY_FAILED: ${formatProjectVersionVerifierError(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
