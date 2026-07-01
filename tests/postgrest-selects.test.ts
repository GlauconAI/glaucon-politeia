import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const filesWithPostQueries = [
  "app/page.tsx",
  "app/search/page.tsx",
  "app/tags/[tag]/page.tsx",
  "app/posts/[slug]/page.tsx",
];

describe("PostgREST post selects", () => {
  it("does not embed the engagement view as a posts relationship", () => {
    for (const file of filesWithPostQueries) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source).not.toContain("post_engagement_counts(");
    }
  });
});
