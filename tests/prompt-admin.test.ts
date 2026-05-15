import { describe, expect, it } from "vitest";

import {
  buildPromptCsv,
  createHourlyPromptBuckets,
  parsePromptAdminFilters,
  verifyRetentionSecret,
} from "@/lib/prompts/admin";

describe("prompt admin helpers", () => {
  it("parses bounded filter params", () => {
    const filters = parsePromptAdminFilters(
      new URLSearchParams({
        q: "  react  ",
        page: "2",
        pageSize: "500",
        marked: "true",
        sensitive: "true",
      }),
    );

    expect(filters).toMatchObject({
      q: "react",
      page: 2,
      pageSize: 100,
      marked: true,
      sensitive: true,
    });
  });

  it("escapes prompt csv output", () => {
    const csv = buildPromptCsv([
      {
        id: "p1",
        created_at: "2026-05-15T00:00:00Z",
        source_url: "https://example.com/editor",
        user_id: null,
        content: "hello, \"world\"",
        marked: false,
        marked_reason: null,
        flags: { has_sensitive: false },
      },
    ]);

    expect(csv).toContain('"hello, ""world"""');
    expect(csv.split("\n")[0]).toContain("created_at");
  });

  it("always returns 24 hourly buckets", () => {
    const buckets = createHourlyPromptBuckets(
      [{ created_at: "2026-05-15T05:10:00.000Z" }],
      new Date("2026-05-15T06:00:00.000Z"),
    );

    expect(buckets).toHaveLength(24);
    expect(buckets.at(-2)).toMatchObject({
      hour: "2026-05-15T05:00:00.000Z",
      count: 1,
    });
  });

  it("requires a matching retention secret", () => {
    expect(verifyRetentionSecret("abc", "abc")).toBe(true);
    expect(verifyRetentionSecret("abc", "def")).toBe(false);
    expect(verifyRetentionSecret(undefined, "def")).toBe(false);
  });
});
