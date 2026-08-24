import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(
  process.cwd(),
  "supabase/migrations/20260823000100_project_control_work_item_binding.sql",
);

describe("Project Control Work Item binding migration", () => {
  const sql = () => existsSync(migration) ? readFileSync(migration, "utf8").toLowerCase().replace(/\s+/gu, " ") : "";

  it("adds an all-null or all-present four-field authority binding", () => {
    const source = sql();
    for (const field of ["project_key text", "plan_revision integer", "stage_id text", "work_package_id text"]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("observatory_work_items_project_control_binding_check");
    expect(source).toContain("project_key is null and plan_revision is null and stage_id is null and work_package_id is null");
    expect(source).toContain("project_key is not null and plan_revision is not null and stage_id is not null and work_package_id is not null");
  });

  it("updates bindings only through the audited optimistic RPC", () => {
    const source = sql();
    expect(source).toContain("create or replace function public.update_observatory_work_item");
    expect(source).toContain("for update");
    expect(source).toContain("observatory_version_conflict");
    expect(source).toContain("'project_key', current_item.project_key");
    expect(source).toContain("'work_package_id', updated_item.work_package_id");
    expect(source).not.toContain("update public.project_control");
  });
});
