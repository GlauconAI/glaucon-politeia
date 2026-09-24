import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260923000100_work_tracker_due_dates.sql",
);

describe("Work Tracker due-date migration", () => {
  it("adds a nullable due date and preserves audited RPC-only mutation", async () => {
    const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

    for (const fragment of [
      "add column due_on date",
      "where due_on is not null and state <> 'done'",
      "p_due_on date",
      "due_on=p_due_on",
      "'due_on',current_item.due_on",
      "'due_on',updated_item.due_on",
      "observatory_version_conflict",
      "revoke all privileges on function public.update_observatory_work_item",
      "grant execute on function public.update_observatory_work_item",
    ]) {
      expect(sql).toContain(fragment);
    }

    expect(sql).toMatch(
      /create index observatory_work_items_open_due_on_idx[\s\S]*due_on/u,
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|truncate)[\s\S]*observatory_work_items/u,
    );
  });
});
