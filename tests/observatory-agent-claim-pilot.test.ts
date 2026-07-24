import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("Agent Claim dogfood pilot", () => {
  const source = readFileSync(
    join(process.cwd(), "scripts/observatory/run-agent-claim-pilot.ts"),
    "utf8",
  );

  it("uses only disposable loopback API/database targets", () => {
    expect(source).toContain("127.0.0.1:54322");
    expect(source).toContain("127.0.0.1:3000");
    expect(source).toContain("must target the disposable loopback");
    expect(source).not.toMatch(/supabase\.co|402v\.com/iu);
  });

  it("runs one Feature and one Bug through claim, heartbeat, Review, and human Done", () => {
    expect(source).toContain("M3-CLAIM-PILOT-FEATURE");
    expect(source).toContain("M3-CLAIM-PILOT-BUG");
    expect(source).toContain('"action": "heartbeat"');
    expect(source).toContain('"action": "complete"');
    expect(source).toContain('"review"');
    expect(source).toContain("'done'");
    expect(source).toContain("agent completion must stop at Review");
  });

  it("proves path boundaries, ended-claim presentation, and high-risk denial", () => {
    expect(source).toContain(
      "components/observatory/WorkTrackerBoard.tsx",
    );
    expect(source).toContain(
      "components/observatory/WorkItemDetail.tsx",
    );
    expect(source).toContain("historical future lease is not active");
    expect(source).toContain("high-risk control remains unchanged");
    expect(source).toContain("DOGFOOD_PILOT_PASSED");
  });
});
