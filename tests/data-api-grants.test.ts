import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const directory = join(process.cwd(), "supabase/migrations");
const statements = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .flatMap((name) =>
    readFileSync(join(directory, name), "utf8")
      .replace(/--[^\n]*/g, "")
      .toLowerCase()
      .split(";"),
  );

// Replay explicit table ACLs with NO platform default grants. RLS remains a
// separate layer; this checks that requests can reach it after a fresh replay.
function privileges(table: string, role: string) {
  const result = new Set<string>();
  for (const statement of statements) {
    const match = statement.trim().match(
      /^(grant|revoke)\s+([\w\s,]+)\s+on\s+(?:table\s+)?public\.(\w+)\s+(?:to|from)\s+([\w\s,]+)$/,
    );
    if (!match || match[3] !== table) continue;
    if (!match[4].split(",").map((value) => value.trim()).includes(role)) continue;
    const actions = match[2].includes("all")
      ? ["select", "insert", "update", "delete"]
      : match[2].split(",").map((value) => value.trim());
    for (const action of actions) {
      if (match[1] === "grant") result.add(action);
      else result.delete(action);
    }
  }
  return [...result].sort();
}

describe("Data API without implicit public-schema grants", () => {
  it("supplies prompt table privileges without bypassing the RLS layer", () => {
    expect(privileges("prompts", "anon")).toEqual(["insert", "select"]);
    expect(privileges("prompts", "authenticated")).toEqual([
      "delete", "insert", "select", "update",
    ]);
  });

  it("allows server-side publishing and prompt administration", () => {
    for (const table of ["profiles", "posts", "tags", "post_tags", "prompts"]) {
      expect(privileges(table, "service_role"), table).toEqual([
        "delete", "insert", "select", "update",
      ]);
    }
  });

  it("preserves the explicit private Tracker ACLs", () => {
    for (const table of [
      "observatory_work_items", "observatory_work_item_events",
      "observatory_work_item_evidence", "observatory_work_item_claims",
      "observatory_project_versions", "observatory_project_version_events",
    ]) {
      expect(privileges(table, "anon"), table).toEqual([]);
      expect(privileges(table, "authenticated"), table).toEqual(["select"]);
      expect(privileges(table, "service_role"), table).toEqual([]);
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(privileges("observatory_agent_work_item_operations", role)).toEqual([]);
    }
    expect(privileges("observatory_snapshots", "service_role")).toEqual(["insert", "select"]);
  });
});
