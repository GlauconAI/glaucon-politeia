import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";

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

async function main(): Promise<void> {
  const env = parseEnv(await readFile(resolve(".env.local"), "utf8"));
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

  const sql = postgres(env.SUPABASE_DB_URL, {
    ssl: "require",
    max: 1,
    connect_timeout: 15,
  });
  try {
    const [before] = await sql<
      { retention_column: boolean; prune_function: boolean; mark_function: boolean }[]
    >`
      select
        exists(
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'observatory_snapshots'
            and column_name = 'release_evidence'
        ) as retention_column,
        to_regprocedure('public.prune_observatory_snapshots(integer)') is not null
          as prune_function,
        to_regprocedure('public.mark_observatory_snapshot_release(text)') is not null
          as mark_function
    `;
    const states = [
      before?.retention_column,
      before?.prune_function,
      before?.mark_function,
    ];
    if (states.some(Boolean) && !states.every(Boolean)) {
      throw new Error("Partial Observatory retention migration detected.");
    }
    let applied = false;
    if (!states.every(Boolean)) {
      const migration = await readFile(
        resolve(
          "supabase/migrations/20260722000100_observatory_snapshot_retention.sql",
        ),
        "utf8",
      );
      await sql.begin((transaction) => transaction.unsafe(migration));
      applied = true;
    }

    const [verified] = await sql<
      {
        retention_column: boolean;
        service_can_prune: boolean;
        service_can_mark: boolean;
        authenticated_can_prune: boolean;
        authenticated_can_mark: boolean;
      }[]
    >`
      select
        exists(
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'observatory_snapshots'
            and column_name = 'release_evidence'
            and is_nullable = 'NO'
            and column_default = 'false'
        ) as retention_column,
        has_function_privilege(
          'service_role',
          'public.prune_observatory_snapshots(integer)',
          'execute'
        ) as service_can_prune,
        has_function_privilege(
          'service_role',
          'public.mark_observatory_snapshot_release(text)',
          'execute'
        ) as service_can_mark,
        has_function_privilege(
          'authenticated',
          'public.prune_observatory_snapshots(integer)',
          'execute'
        ) as authenticated_can_prune,
        has_function_privilege(
          'authenticated',
          'public.mark_observatory_snapshot_release(text)',
          'execute'
        ) as authenticated_can_mark
    `;
    const checks = {
      retention_column: verified?.retention_column === true,
      service_role_only:
        verified?.service_can_prune === true &&
        verified?.service_can_mark === true &&
        verified?.authenticated_can_prune === false &&
        verified?.authenticated_can_mark === false,
    };
    process.stdout.write(
      `${JSON.stringify({ status: "pass", applied, checks }, null, 2)}\n`,
    );
    if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(() => {
  process.stderr.write(
    "OBSERVATORY_RETENTION_MIGRATION_FAILED: Migration or verification failed.\n",
  );
  process.exitCode = 1;
});
