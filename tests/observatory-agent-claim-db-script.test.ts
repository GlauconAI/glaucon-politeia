import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Agent Claim live database verifier", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "scripts/observatory/verify-agent-claim-db.ts",
    ),
    "utf8",
  );

  it("defines exactly 42 named security and lifecycle checks", () => {
    const match = source.match(
      /const EXPECTED_CHECKS = \[([\s\S]*?)\] as const;/u,
    );
    expect(match).not.toBeNull();
    const labels = [...(match?.[1].matchAll(/"([^"]+)"/gu) ?? [])].map(
      (entry) => entry[1],
    );
    expect(labels).toHaveLength(42);
    expect(new Set(labels).size).toBe(42);
    expect(labels.join(" ")).toMatch(/grant|RLS|principal|high-risk/iu);
    expect(labels.join(" ")).toMatch(
      /idempotent|concurrent|heartbeat|release|expiry|completion|cancellation|append-only|rollback/iu,
    );
  });

  it("fails closed unless the database is disposable and loopback-only", () => {
    expect(source).toContain("127.0.0.1");
    expect(source).toContain('parsedDatabaseUrl.port !== "54322"');
    expect(source).toContain(
      "must target the disposable loopback database",
    );
    expect(source).not.toMatch(/supabase\.co|402v\.com/iu);
  });

  it("reports only the bounded named check set", () => {
    expect(source).toContain(
      "assert.deepEqual(checks, [...EXPECTED_CHECKS])",
    );
    expect(source).toContain('"check_count": checks.length');
    expect(source).toContain("OBSERVATORY_AGENT_CLAIM_DB_VERIFY_FAILED");
  });
});
