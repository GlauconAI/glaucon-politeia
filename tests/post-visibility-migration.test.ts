import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260701000100_post_visibility_and_html.sql",
);
const privateDefaultMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260702000100_posts_default_private.sql",
);
const adminPublishMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260702000200_admin_only_post_mutations.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("post visibility and html migration", () => {
  it("adds post visibility and content format columns", () => {
    const sql = readMigration();

    expect(sql).toContain("add column if not exists visibility text");
    expect(sql).toContain("check (visibility in ('public', 'private'))");
    expect(sql).toContain("add column if not exists content_format text");
    expect(sql).toContain("check (content_format in ('markdown', 'html'))");
    expect(sql).toContain("add column if not exists content_html text");
    expect(sql).toContain("posts_html_content_required");
  });

  it("routes read access through a private-aware can_read_post function", () => {
    const sql = readMigration();

    expect(sql).toContain("create or replace function public.can_read_post");
    expect(sql).toContain("post_row.visibility = 'public'");
    expect(sql).toContain("post_row.visibility = 'private'");
    expect(sql).toContain("auth.uid() is not null");
  });

  it("updates dependent read policies to use readable posts", () => {
    const sql = readMigration();

    for (const policy of [
      "posts_select_readable",
      "post_tags_select_readable_posts",
      "comments_select_readable_posts",
      "post_reactions_select_readable_posts",
    ]) {
      expect(sql).toContain(policy);
    }

    expect(sql).toContain("public.can_read_post(posts)");
    expect(sql).toContain("public.can_read_post(p)");
  });

  it("keeps future post visibility private by default", () => {
    const sql = readFileSync(privateDefaultMigrationPath, "utf8").toLowerCase();

    expect(sql).toContain("alter table public.posts");
    expect(sql).toContain("alter column visibility set default 'private'");
  });

  it("keeps public signup closed while enabling existing email-password login", () => {
    const config = readFileSync(
      join(process.cwd(), "supabase/config.toml"),
      "utf8",
    ).toLowerCase();

    expect(config).toMatch(
      /\[auth\][\s\S]*?enable_signup\s*=\s*false[\s\S]*?\[auth\.email\]/u,
    );
    expect(config).toMatch(
      /\[auth\.email\][\s\S]*?enable_signup\s*=\s*true/u,
    );
  });

  it("restricts post and post tag mutations to admin users", () => {
    const sql = readFileSync(adminPublishMigrationPath, "utf8").toLowerCase();

    for (const policy of [
      "posts_insert_admin_only",
      "posts_update_admin_only",
      "posts_delete_admin_only",
      "post_tags_insert_admin_only",
      "post_tags_delete_admin_only",
    ]) {
      expect(sql).toContain(policy);
    }

    expect(sql).not.toContain("create policy posts_insert_own");
    expect(sql).not.toContain(
      "create policy post_tags_insert_post_author_or_admin",
    );
    expect(sql).toContain("public.is_current_user_admin()");
  });
});
