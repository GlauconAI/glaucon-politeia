import { describe, expect, it } from "vitest";

import { normalizeSearchQuery, toSafeIlikePattern } from "@/lib/posts/search";

describe("search query helpers", () => {
  it("normalizes whitespace and caps query length", () => {
    expect(normalizeSearchQuery("  hello   vibe  ")).toBe("hello vibe");
    expect(normalizeSearchQuery("a".repeat(200))).toHaveLength(80);
  });

  it("escapes ilike wildcard characters", () => {
    expect(toSafeIlikePattern("100%_vibe")).toBe("%100\\%\\_vibe%");
  });
});
