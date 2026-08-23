import { describe, expect, it } from "vitest";

import {
  deriveFreshness,
  rollupSourceHealth,
} from "@/lib/observatory/freshness";

describe("deriveFreshness", () => {
  const now = new Date("2026-07-22T22:30:00.000Z");

  it("uses short thresholds for operations and day thresholds for metadata", () => {
    expect(
      deriveFreshness("operations", "2026-07-22T22:16:00.000Z", now),
    ).toBe("fresh");
    expect(
      deriveFreshness("operations", "2026-07-22T22:14:59.000Z", now),
    ).toBe("stale");
    expect(
      deriveFreshness(
        "project_executions",
        "2026-07-22T22:16:00.000Z",
        now,
      ),
    ).toBe("fresh");
    expect(
      deriveFreshness(
        "project_executions",
        "2026-07-22T22:14:59.000Z",
        now,
      ),
    ).toBe("stale");
    expect(
      deriveFreshness("skills", "2026-07-21T22:30:01.000Z", now),
    ).toBe("fresh");
    expect(
      deriveFreshness("skills", "2026-07-21T22:29:59.000Z", now),
    ).toBe("stale");
  });

  it("returns unknown for invalid or future timestamps", () => {
    expect(deriveFreshness("skills", "not-a-date", now)).toBe("unknown");
    expect(
      deriveFreshness("skills", "2026-07-22T22:31:00.000Z", now),
    ).toBe("unknown");
  });
});

describe("rollupSourceHealth", () => {
  it("preserves failed status regardless of age and counts assets", () => {
    expect(
      rollupSourceHealth({
        domain: "operations",
        collectedAt: "2026-07-01T00:00:00.000Z",
        lastSuccessAt: "2026-07-22T21:00:00.000Z",
        assetCount: 3,
        failed: true,
        errorCode: "COMMAND_FAILED",
        now: new Date("2026-07-22T22:30:00.000Z"),
      }),
    ).toEqual({
      domain: "operations",
      status: "failed",
      health: "failed",
      collected_at: "2026-07-01T00:00:00.000Z",
      last_success_at: "2026-07-22T21:00:00.000Z",
      asset_count: 3,
      error_code: "COMMAND_FAILED",
    });
  });
});
