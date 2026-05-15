import { describe, expect, it } from "vitest";

import {
  createExcerpt,
  createUniqueSlug,
  slugifyTitle,
} from "@/lib/posts/text";

describe("post text helpers", () => {
  it("creates URL-safe slugs from article titles", () => {
    expect(slugifyTitle(" Vibe First, Code Later! ")).toBe(
      "vibe-first-code-later",
    );
  });

  it("falls back when a title has no URL-safe characters", () => {
    expect(slugifyTitle("你好，世界")).toBe("post");
  });

  it("keeps slugs within the configured max length", () => {
    const slug = slugifyTitle("A".repeat(120), { maxLength: 64 });

    expect(slug).toHaveLength(64);
    expect(slug).toMatch(/^a+$/);
  });

  it("adds a deterministic suffix when the base slug is already taken", () => {
    const slug = createUniqueSlug("Vibe First Code Later", {
      isTaken: (candidate) => candidate === "vibe-first-code-later",
      suffix: () => "4821",
    });

    expect(slug).toBe("vibe-first-code-later-4821");
  });

  it("keeps collision suffixes inside the max slug length", () => {
    const slug = createUniqueSlug("A".repeat(120), {
      isTaken: () => true,
      suffix: () => "1234",
      maxLength: 12,
    });

    expect(slug).toBe("aaaaaaa-1234");
    expect(slug).toHaveLength(12);
  });

  it("creates excerpts from markdown without code or syntax noise", () => {
    const excerpt = createExcerpt(
      [
        "# Launch Notes",
        "",
        "This is `inline code` before a [link](https://example.com).",
        "",
        "```ts",
        "const secret = true",
        "```",
        "",
        "- final point",
      ].join("\n"),
      80,
    );

    expect(excerpt).toBe(
      "Launch Notes This is inline code before a link. final point",
    );
  });

  it("truncates excerpts at a word boundary when possible", () => {
    expect(createExcerpt("one two three four five", 13)).toBe("one two...");
  });
});
