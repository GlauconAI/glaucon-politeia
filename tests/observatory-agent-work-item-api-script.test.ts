import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    process.cwd(),
    "scripts/observatory/deploy-concerto-agent-work-item-api.ts",
  ),
  "utf8",
);

describe("Concerto Agent Work Item API deployment entry", () => {
  it("pins the exact migration and exposes only check, apply, and status", () => {
    expect(source).toContain('const MIGRATION_VERSION = "20260926000100"');
    expect(source).toContain(
      '"supabase/migrations/20260926000100_concerto_agent_work_item_api.sql"',
    );
    expect(source).toContain("[check|apply|status]");
    expect(source).toContain("argv.length > 1");
  });

  it("reuses production target pinning and verifies catalogs and privileges", () => {
    expect(source).toContain("assertProductionSupabaseTarget");
    expect(source).toContain("observatory_agent_work_item_operations");
    expect(source).toContain("create_observatory_work_item_as_agent");
    expect(source).toContain("execute_observatory_agent_work_item_command");
    expect(source).toContain("has_function_privilege");
    expect(source).toContain("service_role");
  });

  it("runs check and probes inside rollback-only transactions", () => {
    expect(source).toContain('sql.unsafe("begin")');
    expect(source).toContain('sql.unsafe("rollback")');
    expect(source).toContain("verifyAgentRpc");
    expect(source).toContain("verifiedBeforeCommit");
  });

  it("uses a stable redacted failure prefix", () => {
    expect(source).toContain("CONCERTO_AGENT_WORK_ITEM_API_DEPLOY_FAILED");
    expect(source).not.toContain("console.log(process.env");
  });
});
