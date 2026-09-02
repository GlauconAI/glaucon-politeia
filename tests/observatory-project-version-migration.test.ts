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
      "enable row level security",
      "grant execute",
    ]) expect(sql.toLowerCase()).toContain(fragment.toLowerCase());
    expect(sql).toMatch(/planned[\s\S]*active[\s\S]*released[\s\S]*archived/u);
    expect(sql).toContain("Backlog");
  });
});
