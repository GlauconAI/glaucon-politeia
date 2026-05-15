import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = join(
  root,
  "supabase/migrations/20260515000100_p0_core_schema.sql",
);
const seedPath = join(root, "supabase/seed.sql");

function readMigration() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

function readSeed() {
  return readFileSync(seedPath, "utf8").toLowerCase();
}

describe("p0 core schema migration", () => {
  it("creates every P0 core table", () => {
    const sql = readMigration();

    for (const table of [
      "profiles",
      "posts",
      "tags",
      "post_tags",
      "comments",
      "post_reactions",
      "bookmarks",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("enables row level security for every P0 core table", () => {
    const sql = readMigration();

    for (const table of [
      "profiles",
      "posts",
      "tags",
      "post_tags",
      "comments",
      "post_reactions",
      "bookmarks",
    ]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("keeps bookmark rows private while exposing aggregate post stats", () => {
    const sql = readMigration();

    expect(sql).toContain("bookmarks_select_own_or_admin");
    expect(sql).toContain("create view public.post_engagement_counts");
    expect(sql).not.toContain("bookmarks_select_public");
  });

  it("seeds the required launch tags", () => {
    const sql = readSeed();

    for (const slug of ["vibe-coding", "trae-solo", "projects", "pitfalls"]) {
      expect(sql).toContain(slug);
    }
  });
});
