import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql",
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).replace(/\s+/gu, " ");
}

describe("Project Version contract v1 migration", () => {
  it("is additive, transactional, and performs fail-closed preflights before constraints", async () => {
    const sql = await migration();
    expect(sql).toMatch(/^begin;/iu);
    expect(sql).toMatch(/commit;\s*$/iu);
    expect(sql).not.toMatch(/drop table|drop column/iu);
    expect(sql.indexOf("OBSERVATORY_MULTIPLE_EXECUTION_VERSIONS")).toBeLessThan(
      sql.indexOf("observatory_project_versions_one_execution_idx"),
    );
    expect(sql.indexOf("OBSERVATORY_WORK_ITEM_VERSION_REQUIRED")).toBeLessThan(
      sql.indexOf("alter column project_version_id set not null"),
    );
    expect(sql).toMatch(/version\.project_key\s*<>\s*coalesce\(item\.project_key,\s*item\.project_ref\)/iu);
    expect(sql).toMatch(/OBSERVATORY_PREDECESSOR_(SELF|PROJECT_MISMATCH|CYCLE)/u);
  });

  it("adds the complete version and Work Item contract without rewriting scope", async () => {
    const sql = await migration();
    for (const column of [
      "semver text",
      "is_release_target boolean",
      "milestone_ref text",
      "predecessor_version_id uuid",
      "roadmap_ref text",
      "approved_plan_ref text",
      "acceptance_summary text",
      "actual_date date",
      "dependencies_summary text",
      "dependencies_satisfied boolean",
      "artifacts_accepted boolean",
      "verification_complete boolean",
      "roadmap_reconciled boolean",
      "user_gate_decision_ref text",
      "version_binding_kind text",
    ]) expect(sql.toLowerCase()).toContain(column);
    expect(sql).toMatch(/version_binding_kind[\s\S]*default 'optional'/iu);
    expect(sql).toMatch(/set version_binding_kind = 'optional'/iu);
    expect(sql).toMatch(/alter column version_binding_kind set not null/iu);
    const dataBackfill = sql.slice(
      sql.indexOf("update public.observatory_project_versions"),
      sql.indexOf("alter table public.observatory_work_items alter column"),
    );
    expect(dataBackfill).not.toMatch(/set\s+(version_label|description|milestone_ref)\s*=/iu);
  });

  it("normalizes only safe legacy SemVer labels and enforces portfolio invariants", async () => {
    const sql = await migration();
    expect(sql).toContain("^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:\\.(0|[1-9][0-9]*))?$");
    expect(sql).toMatch(/is_backlog[\s\S]*semver is null/iu);
    expect(sql).toContain("semver ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'");
    expect(sql).toContain("observatory_project_versions_semver_idx");
    expect(sql).toContain("observatory_project_versions_one_execution_idx");
    expect(sql).toContain("observatory_project_versions_one_release_target_idx");
    expect(sql).toMatch(/where status in \('active', 'gate_ready'\)/iu);
    expect(sql).toMatch(/where is_release_target/iu);
    expect(sql).toMatch(/planned[\s\S]*active[\s\S]*gate_ready[\s\S]*released[\s\S]*archived[\s\S]*cancelled/iu);
  });

  it("enforces predecessor, lifecycle, immutable history, and release gates in database code", async () => {
    const sql = await migration();
    expect(sql).toContain("validate_observatory_project_version_predecessor");
    expect(sql).toMatch(/predecessor\.project_key <> new\.project_key/iu);
    expect(sql).toMatch(/predecessor\.semver[\s\S]*new\.semver/iu);
    expect(sql).toMatch(/with recursive predecessor_chain/iu);
    expect(sql).toContain("protect_observatory_project_version_history");
    expect(sql).toMatch(/old\.status = 'released'[\s\S]*new\.status = 'archived'/iu);
    expect(sql).toMatch(/current_version\.status\s*=\s*'gate_ready'[\s\S]*target_status\s+in\s+\('active','released','cancelled'\)/iu);
    expect(sql).toMatch(/current_version\.is_backlog[\s\S]*OBSERVATORY_PROJECT_VERSION_BACKLOG_IMMUTABLE/iu);
    expect(sql).toMatch(/count\(\*\)[\s\S]*version_binding_kind = 'required'[\s\S]*state <> 'done'/iu);
    for (const gate of [
      "acceptance_summary",
      "dependencies_satisfied",
      "artifacts_accepted",
      "verification_complete",
      "roadmap_reconciled",
      "user_gate_decision_ref",
    ]) expect(sql).toContain(gate);
    expect(sql).not.toMatch(/update public\.observatory_project_versions[\s\S]{0,300}set status = 'released'/iu);
  });

  it("replaces bounded admin RPCs, audits snapshots, and blocks new bindings to terminal versions", async () => {
    const sql = await migration();
    for (const name of [
      "create_observatory_project_version",
      "update_observatory_project_version",
      "transition_observatory_project_version",
      "create_observatory_work_item",
      "update_observatory_work_item",
    ]) expect(sql).toContain(name);
    expect(sql).toMatch(/drop function if exists public\.create_observatory_project_version\(/iu);
    expect(sql).toMatch(/drop function if exists public\.update_observatory_project_version\(/iu);
    expect(sql).toMatch(/drop function if exists public\.transition_observatory_project_version\(/iu);
    expect(sql).toMatch(/jsonb_build_object\('before',\s*to_jsonb\(current_version\),\s*'after',\s*to_jsonb\(updated_version\)\)/iu);
    expect(sql).toMatch(/version_status in \('released', 'archived', 'cancelled'\)/iu);
    expect(sql).toMatch(/old\.project_version_id is distinct from new\.project_version_id|new\.project_version_id is distinct from old\.project_version_id/iu);
    expect(sql).toMatch(/drop trigger if exists observatory_work_items_validate_project_version/iu);
    expect(sql).toMatch(/update of project_ref, project_key, project_version_id, version_binding_kind/iu);
    expect(sql).toMatch(/drop function if exists public\.create_observatory_work_item\(text,text,text,text,text,text\)/iu);
    expect(sql).toMatch(/drop function if exists public\.create_observatory_work_item\(text,text,text,text,text\)/iu);
    expect(sql).toMatch(/drop function if exists public\.update_observatory_work_item\(uuid,integer,text,text,text,text,text,uuid,text,text\)/iu);
    expect(sql).toMatch(/drop function if exists public\.update_observatory_work_item\(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text\)/iu);
    expect(sql).toMatch(/on conflict \(created_by, idempotency_key\) do nothing/iu);
    expect(sql).toContain("OBSERVATORY_PROJECT_CONTROL_BINDING_INVALID");
    expect(sql).toMatch(/security definer/iu);
    expect(sql).toMatch(/enable row level security/iu);
    expect(sql).toMatch(/grant execute[\s\S]*to authenticated/iu);
  });
});
