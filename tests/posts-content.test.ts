import { describe, expect, it } from "vitest";

import {
  normalizePostContentInput,
  normalizePostVisibility,
  stripHtmlToText,
} from "@/lib/posts/content";

describe("post content helpers", () => {
  it("normalizes visibility with public as the default", () => {
    expect(normalizePostVisibility(undefined)).toBe("public");
    expect(normalizePostVisibility("private")).toBe("private");
    expect(() => normalizePostVisibility("team")).toThrow(
      "Visibility must be public or private",
    );
  });

  it("extracts readable text from html for excerpts", () => {
    expect(
      stripHtmlToText(
        "<html><head><style>.x{}</style><script>alert(1)</script></head><body><h1>Launch</h1><p>Ready&nbsp;now.</p></body></html>",
      ),
    ).toBe("Launch Ready now.");
  });

  it("normalizes markdown post input", () => {
    expect(
      normalizePostContentInput({
        contentFormat: "markdown",
        content: " # Hello ",
      }),
    ).toEqual({
      contentFormat: "markdown",
      contentMd: "# Hello",
      contentHtml: "",
      excerpt: "Hello",
    });
  });

  it("normalizes html post input", () => {
    expect(
      normalizePostContentInput({
        contentFormat: "html",
        contentHtml: "<main><h1>Artifact</h1><p>Private note</p></main>",
      }),
    ).toEqual({
      contentFormat: "html",
      contentMd: "",
      contentHtml: "<main><h1>Artifact</h1><p>Private note</p></main>",
      excerpt: "Artifact Private note",
    });
  });
});
