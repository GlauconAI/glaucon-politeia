import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = join(process.cwd(), "scripts/import-ghost.mjs");

function createFixtureDb() {
  const dir = mkdtempSync(join(tmpdir(), "ghost-import-"));
  const dbPath = join(dir, "ghost.db");

  execFileSync(
    "sqlite3",
    [
      dbPath,
      `
      create table posts (
        id integer primary key,
        title text not null,
        slug text not null,
        markdown text,
        html text,
        image text,
        status text not null,
        created_at integer,
        updated_at integer,
        published_at integer
      );
      create table tags (
        id integer primary key,
        name text not null,
        slug text not null
      );
      create table posts_tags (
        post_id integer not null,
        tag_id integer not null
      );
      insert into posts values
        (1, '二分法查找的实现（递归&amp;循环）', 'er-fen-fa-cha-zhao-de-shi-xian--di-gui-and-xun-huan--', '# Binary Search\\n\\n[Next](http://402v.com/leetcodeshi-zhan-longest-palindromic-substring/) and [Tag](http://402v.com/tag/leetcode/)', '<h1>Binary Search</h1>', '', 'published', 1340770047000, 1340770047000, 1340770047000),
        (2, 'LeetCode实战 - Longest Palindromic Substring', 'leetcodeshi-zhan-longest-palindromic-substring', 'Draft body', '<p>Draft body</p>', '', 'draft', 1450520018000, 1450520018000, null);
      insert into tags values
        (1, 'algorithm', 'algorithm'),
        (2, 'ios,debug', 'ios-debug');
      insert into posts_tags values
        (1, 1),
        (1, 2);
      `,
    ],
    { stdio: "pipe" },
  );

  return {
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("import-ghost script", () => {
  it("dry-runs Ghost posts into 402v import payloads", () => {
    const fixture = createFixtureDb();

    try {
      const output = execFileSync(
        "node",
        [scriptPath, "--db", fixture.dbPath, "--author-id", "author-1", "--dry-run"],
        { encoding: "utf8" },
      );
      const result = JSON.parse(output);

      expect(result.summary).toMatchObject({
        sourcePosts: 2,
        published: 1,
        drafts: 1,
        usedTags: 2,
      });
      expect(result.posts[0]).toMatchObject({
        title: "二分法查找的实现（递归&循环）",
        slug: "er-fen-fa-cha-zhao-de-shi-xian-di-gui-and-xun-huan",
        status: "published",
        visibility: "public",
        content_format: "markdown",
        author_id: "author-1",
        tagSlugs: ["algorithm", "ios-debug"],
      });
      expect(result.posts[0].published_at).toBe("2012-06-27T04:07:27.000Z");
      expect(result.posts[0].content_md).toContain(
        "[Next](/posts/leetcodeshi-zhan-longest-palindromic-substring)",
      );
      expect(result.posts[0].content_md).toContain("[Tag](/tags/leetcode)");
      expect(result.posts[1]).toMatchObject({
        status: "draft",
        published_at: null,
      });
      expect(result.tags.map((tag: { slug: string }) => tag.slug)).toEqual([
        "algorithm",
        "ios-debug",
      ]);
    } finally {
      fixture.cleanup();
    }
  });
});
