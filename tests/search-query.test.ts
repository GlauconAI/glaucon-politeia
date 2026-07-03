import { describe, expect, it } from "vitest";

import {
  buildSearchOrFilter,
  normalizeSearchQuery,
  normalizeSearchType,
  toSafeIlikePattern,
} from "@/lib/posts/search";

describe("search query helpers", () => {
  it("normalizes whitespace and caps query length", () => {
    expect(normalizeSearchQuery("  hello   vibe  ")).toBe("hello vibe");
    expect(normalizeSearchQuery("a".repeat(200))).toHaveLength(80);
  });

  it("escapes ilike wildcard characters", () => {
    expect(toSafeIlikePattern("100%_vibe")).toBe("%100\\%\\_vibe%");
  });

  it("searches html content in addition to markdown content", () => {
    expect(buildSearchOrFilter("family")).toBe(
      "title.ilike.%family%,content_md.ilike.%family%,content_html.ilike.%family%",
    );
  });

  it("normalizes search type filters", () => {
    expect(normalizeSearchType("html")).toBe("html");
    expect(normalizeSearchType("markdown")).toBe("markdown");
    expect(normalizeSearchType("all")).toBe(null);
    expect(normalizeSearchType("private")).toBe(null);
  });
});
