import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Work Item due-date production deployer", () => {
  it("uses the production identity gate, dry-run rollback, migration history, and audited RPC probe", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/observatory/deploy-work-item-due-dates.ts"),
      "utf8",
    );

    for (const fragment of [
      "assertProductionSupabaseTarget",
      'const MIGRATION_VERSION = "20260923000100"',
      'command === "check"',
      'command === "status"',
      'await sql.unsafe("rollback")',
      "supabase_migrations.schema_migrations",
      "readContractStatus(transaction)",
      "verifyAuditedRpc",
      "p_due_on =>",
      'ssl: "require"',
    ]) {
      expect(source).toContain(fragment);
    }
    expect(source).not.toContain("console.log(env)");
  });
});
