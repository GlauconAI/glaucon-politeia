import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260721000100_openclaw_observatory_m1a.sql",
);

function readMigration(): string {
  return existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8").toLowerCase()
    : "";
}

function normalizedMigration(): string {
  return readMigration().replace(/\s+/gu, " ");
}

describe("OpenClaw Observatory M1A migration", () => {
  it("creates exactly the three Observatory tables", () => {
    const tables = Array.from(
      readMigration().matchAll(/create table public\.([a-z_]+)/gu),
      (match) => match[1],
    );

    expect(tables).toEqual([
      "observatory_snapshots",
      "observatory_work_items",
      "observatory_work_item_events",
    ]);
  });

  it("constrains and indexes immutable successful snapshots", () => {
    const sql = normalizedMigration();

    expect(sql).toContain("source_digest text not null unique");
    expect(sql).toContain("check (source_digest ~ '^[a-f0-9]{64}$')");
    expect(sql).toContain("check (status = 'success')");
    expect(sql).toContain(
      "create index observatory_snapshots_generated_at_desc_idx on public.observatory_snapshots(generated_at desc)",
    );
    expect(sql).toContain("prevent_observatory_snapshot_mutation");
    expect(sql).toContain(
      "before update or delete on public.observatory_snapshots",
    );
  });

  it("constrains and indexes work items and their audit events", () => {
    const sql = normalizedMigration();

    expect(sql).toContain("check (type in ('idea', 'feature', 'bug'))");
    expect(sql).toContain("check (state in ('inbox'))");
    expect(sql).toContain("check (length(btrim(title)) between 1 and 200)");
    expect(sql).toContain("check (version > 0)");
    expect(sql).toContain("unique (created_by, idempotency_key)");
    expect(sql).toContain(
      "create index observatory_work_items_state_created_at_idx on public.observatory_work_items(state, created_at desc)",
    );
    expect(sql).toContain("check (event_type in ('created', 'updated'))");
    expect(sql).toContain(
      "create index observatory_work_item_events_item_created_at_idx on public.observatory_work_item_events(work_item_id, created_at asc)",
    );
  });

  it("enables RLS on all three tables", () => {
    const sql = normalizedMigration();

    for (const table of [
      "observatory_snapshots",
      "observatory_work_items",
      "observatory_work_item_events",
    ]) {
      expect(sql).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("allows only admins to read snapshots while browser roles cannot write them", () => {
    const sql = normalizedMigration();

    expect(sql).toContain("create policy observatory_snapshots_select_admin");
    expect(sql).toContain("on public.observatory_snapshots for select");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("using (public.is_current_user_admin())");
    expect(sql).toContain(
      "revoke insert, update, delete on public.observatory_snapshots from anon, authenticated",
    );
    expect(sql).toContain(
      "grant insert on public.observatory_snapshots to service_role",
    );
    expect(sql).not.toMatch(/create policy observatory_snapshots_(insert|update|delete)/u);
  });

  it("allows admins to read, create, and update work items but not delete them", () => {
    const sql = normalizedMigration();

    for (const policy of [
      "observatory_work_items_select_admin",
      "observatory_work_items_insert_admin",
      "observatory_work_items_update_admin",
    ]) {
      expect(sql).toContain(`create policy ${policy}`);
    }
    expect(sql).not.toContain(
      "create policy observatory_work_items_delete_admin",
    );
    expect(sql.match(/public\.is_current_user_admin\(\)/gu)?.length).toBeGreaterThanOrEqual(
      8,
    );
  });

  it("keeps audit events append-only for admins and privileged roles", () => {
    const sql = normalizedMigration();

    expect(sql).toContain(
      "create policy observatory_work_item_events_select_admin",
    );
    expect(sql).toContain(
      "create policy observatory_work_item_events_insert_admin",
    );
    expect(sql).not.toMatch(
      /create policy observatory_work_item_events_(update|delete)/u,
    );
    expect(sql).toContain("prevent_observatory_work_item_event_mutation");
    expect(sql).toContain(
      "before update or delete on public.observatory_work_item_events",
    );
  });

  it("provides an admin-only transaction boundary for a work item and its initial event", () => {
    const sql = normalizedMigration();
    const functionStart = sql.indexOf(
      "create or replace function public.create_observatory_work_item",
    );
    const functionEnd = sql.indexOf("revoke all on function", functionStart);
    const functionSql = sql.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionSql).toContain("security invoker");
    expect(functionSql).toContain("if not public.is_current_user_admin()");
    expect(functionSql).toContain("insert into public.observatory_work_items");
    expect(functionSql).toContain("'inbox'");
    expect(functionSql).toContain(
      "insert into public.observatory_work_item_events",
    );
    expect(functionSql.indexOf("insert into public.observatory_work_items")).toBeLessThan(
      functionSql.indexOf("insert into public.observatory_work_item_events"),
    );
    expect(sql).toContain(
      "grant execute on function public.create_observatory_work_item(text, text, text, text) to authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.create_observatory_work_item(text, text, text, text) to anon",
    );
  });
});
