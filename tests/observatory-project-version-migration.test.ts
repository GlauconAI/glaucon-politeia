import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260902000200_work_tracker_project_versions.sql",
);

describe("Project Version migration", () => {
  it("creates audited versions, backfills Work Items, and exposes bounded RPCs", async () => {
    const sql = await readFile(migrationPath, "utf8");
    for (const fragment of [
      "create table public.observatory_project_versions",
      "create table public.observatory_project_version_events",
      "add column project_version_id uuid",
      "is_backlog boolean",
      "row_version integer",
      "create_observatory_project_version",
      "update_observatory_project_version",
      "transition_observatory_project_version",
      "OBSERVATORY_PROJECT_VERSION_MISMATCH",
      "observatory_work_items_validate_project_version",
      "ensure_observatory_project_backlog_versions",
      "enable row level security",
      "grant execute",
    ]) expect(sql.toLowerCase()).toContain(fragment.toLowerCase());
    expect(sql).toMatch(/planned[\s\S]*active[\s\S]*released[\s\S]*archived/u);
    expect(sql).toContain("Backlog");
    expect(sql).toContain("set project_ref = 'plato/dashboard'");
    expect(sql).toContain("else current_version.released_at");
    expect(sql).toContain("status <> 'released' or released_at is not null");
    expect(sql).not.toMatch(/\)\s*select 1;\s*\n\s*return query/u);
    expect(sql).toContain("OBSERVATORY_PROJECT_VERSION_ARCHIVED");
    for (const auditedField of [
      "description",
      "acceptance_criteria",
      "priority",
      "owner_id",
      "milestone_ref",
      "plan_revision",
      "stage_id",
      "work_package_id",
      "state",
      "project_version_id",
    ]) {
      expect(sql).toContain(`'${auditedField}', current_item.${auditedField}`);
      expect(sql).toContain(`'${auditedField}', updated_item.${auditedField}`);
    }
    expect(sql).not.toContain("alter column project_version_id set not null");
    expect(sql).toContain("disable trigger observatory_work_items_set_updated_at");
    expect(sql).toContain("enable trigger observatory_work_items_set_updated_at");
  });
});
