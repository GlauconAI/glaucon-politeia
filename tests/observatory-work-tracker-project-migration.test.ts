import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260826000100_work_tracker_project_capture.sql",
);

function migration(): string {
  return existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8").toLocaleLowerCase().replace(/\s+/gu, " ")
    : "";
}

describe("Work Tracker canonical Project capture migration", () => {
  it("replaces the four-argument RPC with an exact five-argument grant", () => {
    const sql = migration();
    expect(sql).toContain(
      "drop function if exists public.create_observatory_work_item(text, text, text, text)",
    );
    expect(sql).toContain("p_project_ref text");
    expect(sql).toContain(
      "revoke all privileges on function public.create_observatory_work_item(text, text, text, text, text) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.create_observatory_work_item(text, text, text, text, text) to authenticated",
    );
  });

  it("stores, audits, and compares the canonical Project on idempotent retries", () => {
    const sql = migration();
    expect(sql).toContain("normalized_project_ref text := btrim(p_project_ref)");
    expect(sql).toContain(
      "if normalized_project_ref is null or length(normalized_project_ref) not between 1 and 160",
    );
    expect(sql).toContain("observatory_project_required");
    expect(sql).toContain("project_ref, idempotency_key");
    expect(sql).toContain(
      "existing_item.project_ref is distinct from normalized_project_ref",
    );
    expect(sql).toContain("'project_ref', created_item.project_ref");
    expect(sql).toContain("observatory_idempotency_conflict");
  });

  it("keeps the transaction admin-only and search-path hardened", () => {
    const sql = migration();
    expect(sql).toContain("security definer set search_path = pg_catalog");
    expect(sql).toContain("calling_user := auth.uid()");
    expect(sql).toContain(
      "if calling_user is null or not public.is_current_user_admin()",
    );
  });
});
