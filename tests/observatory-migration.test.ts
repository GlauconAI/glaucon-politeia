import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260721000100_openclaw_observatory_m1a.sql",
);
const workTrackerMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260723000100_work_tracker_core.sql",
);

function readMigration(): string {
  return existsSync(migrationPath)
    ? readFileSync(migrationPath, "utf8").toLowerCase()
    : "";
}

function normalizedMigration(): string {
  return readMigration().replace(/\s+/gu, " ");
}

function functionContract(name: string): string {
  const sql = normalizedMigration();
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("revoke all privileges on function", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
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
    expect(sql).toContain(
      "create unique index observatory_work_item_events_one_created_idx on public.observatory_work_item_events(work_item_id) where event_type = 'created'",
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

  it("revokes default and truncate privileges before granting exact table access", () => {
    const sql = normalizedMigration();

    for (const table of [
      "observatory_snapshots",
      "observatory_work_items",
      "observatory_work_item_events",
    ]) {
      expect(sql).toContain(
        `revoke all privileges on table public.${table} from public, anon, authenticated, service_role`,
      );
    }

    expect(sql).not.toMatch(/grant truncate on table public\.observatory_/u);
    expect(sql).toContain(
      "grant select on table public.observatory_snapshots to authenticated",
    );
    expect(sql).toContain(
      "grant select, insert on table public.observatory_snapshots to service_role",
    );
    expect(sql).toContain(
      "grant select on table public.observatory_work_items to authenticated",
    );
    expect(sql).toContain(
      "grant select on table public.observatory_work_item_events to authenticated",
    );
    expect(sql).not.toMatch(
      /grant (?:insert|update|delete|truncate)(?:, [a-z]+)* on table public\.observatory_work_(?:items|item_events)/u,
    );
    expect(sql).not.toMatch(
      /grant [a-z, ]+ on table public\.observatory_(?:work_items|work_item_events) to service_role/u,
    );
  });

  it("allows only admins to read Observatory tables through RLS", () => {
    const sql = normalizedMigration();

    expect(sql).toContain("create policy observatory_snapshots_select_admin");
    for (const policy of [
      "observatory_work_items_select_admin",
      "observatory_work_item_events_select_admin",
    ]) {
      expect(sql).toContain(`create policy ${policy}`);
    }
    expect(sql.match(/using \(public\.is_current_user_admin\(\)\)/gu)).toHaveLength(
      3,
    );
    expect(sql).not.toMatch(
      /create policy observatory_(?:snapshots|work_items|work_item_events)_(?:insert|update|delete)/u,
    );
  });

  it("keeps audit events append-only for admins and privileged roles", () => {
    const sql = normalizedMigration();

    expect(sql).toContain(
      "create policy observatory_work_item_events_select_admin",
    );
    expect(sql).not.toMatch(
      /create policy observatory_work_item_events_(insert|update|delete)/u,
    );
    expect(sql).toContain("prevent_observatory_work_item_event_mutation");
    expect(sql).toContain(
      "before update or delete on public.observatory_work_item_events",
    );
  });

  it("provides an admin-only transaction boundary for a work item and its initial event", () => {
    const sql = normalizedMigration();
    const functionSql = functionContract("create_observatory_work_item");

    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("set search_path = pg_catalog");
    expect(functionSql).toContain("calling_user := auth.uid()");
    expect(functionSql).toContain(
      "if calling_user is null or not public.is_current_user_admin()",
    );
    expect(functionSql).toContain("insert into public.observatory_work_items");
    expect(functionSql).toContain("'inbox'");
    expect(functionSql).toContain(
      "insert into public.observatory_work_item_events",
    );
    expect(functionSql.indexOf("insert into public.observatory_work_items")).toBeLessThan(
      functionSql.indexOf("insert into public.observatory_work_item_events"),
    );
    expect(sql).toContain(
      "revoke all privileges on function public.create_observatory_work_item(text, text, text, text) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.create_observatory_work_item(text, text, text, text) to authenticated",
    );
  });

  it("returns exact idempotent retries but rejects mismatched duplicate keys", () => {
    const functionSql = functionContract("create_observatory_work_item");

    expect(functionSql).toContain(
      "on conflict (created_by, idempotency_key) do nothing",
    );
    for (const field of ["type", "title", "description", "state"]) {
      expect(functionSql).toContain(
        `existing_item.${field} is distinct from normalized_${field}`,
      );
    }
    expect(functionSql).toContain("observatory_idempotency_conflict");
    expect(functionSql).toContain("errcode = '23505'");
    expect(functionSql).toContain("return existing_item");
    expect(functionSql.indexOf("return existing_item")).toBeLessThan(
      functionSql.indexOf("insert into public.observatory_work_item_events"),
    );
  });

  it("updates mutable fields through one optimistic, audited transaction", () => {
    const sql = normalizedMigration();
    const functionSql = functionContract("update_observatory_work_item");

    expect(functionSql).toContain("p_expected_version integer");
    expect(functionSql).toContain("security definer");
    expect(functionSql).toContain("set search_path = pg_catalog");
    expect(functionSql).toContain("calling_user := auth.uid()");
    expect(functionSql).toContain(
      "if calling_user is null or not public.is_current_user_admin()",
    );
    expect(functionSql).toContain("for update");
    expect(functionSql).toContain(
      "if current_item.version <> p_expected_version",
    );
    expect(functionSql).toContain("observatory_version_conflict");
    expect(functionSql).toContain("set type = normalized_type");
    expect(functionSql).toContain("title = normalized_title");
    expect(functionSql).toContain("description = normalized_description");
    expect(functionSql).toContain("version = current_item.version + 1");
    const updateSetSql = functionSql.slice(
      functionSql.indexOf("update public.observatory_work_items set"),
      functionSql.indexOf("where id = current_item.id"),
    );
    for (const immutableField of [
      "id",
      "created_by",
      "idempotency_key",
      "created_at",
    ]) {
      expect(updateSetSql).not.toMatch(new RegExp(`${immutableField}\\s*=`, "u"));
    }
    expect(functionSql).toContain(
      "insert into public.observatory_work_item_events",
    );
    expect(functionSql).toContain("'updated'");
    expect(sql).toContain(
      "revoke all privileges on function public.update_observatory_work_item(uuid, integer, text, text, text) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.update_observatory_work_item(uuid, integer, text, text, text) to authenticated",
    );
  });
});

describe("M3 Work Tracker core migration", () => {
  const sql = () =>
    existsSync(workTrackerMigrationPath)
      ? readFileSync(workTrackerMigrationPath, "utf8")
          .toLowerCase()
          .replace(/\s+/gu, " ")
      : "";

  it("adds the workflow fields, evidence table, and complete state/event constraints", () => {
    const source = sql();
    for (const field of [
      "priority text",
      "owner_id uuid",
      "acceptance_criteria text",
      "project_ref text",
      "milestone_ref text",
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toMatch(
      /state in \( ?'inbox', 'triage', 'ready', 'in_progress', 'review', 'done', 'blocked', 'waiting', 'reopened' ?\)/u,
    );
    expect(source).toMatch(
      /event_type in \( ?'created', 'updated', 'state_transitioned', 'evidence_added', 'evidence_removed' ?\)/u,
    );
    expect(source).toContain(
      "create table public.observatory_work_item_evidence",
    );
    expect(source).toContain("url ~* '^https?://[^[:space:]]+$'");
    expect(source).toContain("removed_at timestamptz");
    expect(source).toContain("removed_by uuid");
  });

  it("keeps evidence admin-readable and direct writes unavailable", () => {
    const source = sql();
    expect(source).toContain(
      "alter table public.observatory_work_item_evidence enable row level security",
    );
    expect(source).toContain(
      "revoke all privileges on table public.observatory_work_item_evidence from public, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "grant select on table public.observatory_work_item_evidence to authenticated",
    );
    expect(source).toContain(
      "create policy observatory_work_item_evidence_select_admin",
    );
    expect(source).toContain("using (public.is_current_user_admin())");
  });

  it.each([
    "update_observatory_work_item",
    "transition_observatory_work_item",
    "add_observatory_work_item_evidence",
    "remove_observatory_work_item_evidence",
  ])("guards %s with admin auth, a row lock, and optimistic versioning", (name) => {
    const source = sql();
    const start = source.indexOf(`create or replace function public.${name}`);
    const end = source.indexOf("revoke all privileges on function", start);
    const contract = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(contract).toContain("security definer");
    expect(contract).toContain("set search_path = pg_catalog");
    expect(contract).toContain("public.is_current_user_admin()");
    expect(contract).toContain("for update");
    expect(contract).toContain("p_expected_version");
    expect(contract).toContain("observatory_version_conflict");
    expect(contract).toContain(
      "insert into public.observatory_work_item_events",
    );
  });

  it("encodes the transition graph and Ready Gate in the database", () => {
    const source = sql();
    expect(source).toContain("observatory_invalid_transition");
    expect(source).toContain("observatory_ready_gate_failed");
    expect(source).toContain(
      "current_item.acceptance_criteria = '' or current_item.priority is null or current_item.owner_id is null",
    );
    for (const edge of [
      "current_item.state = 'inbox' and target_state = 'triage'",
      "current_item.state = 'triage' and target_state in ('inbox', 'ready')",
      "current_item.state = 'done' and target_state = 'reopened'",
      "current_item.state = 'reopened' and target_state in ('ready', 'in_progress')",
    ]) {
      expect(source).toContain(edge);
    }
  });

  it("soft-removes evidence and keeps the event table append-only", () => {
    const source = sql();
    expect(source).toContain("observatory_evidence_not_found");
    expect(source).toContain("set removed_at = now(), removed_by = calling_user");
    expect(source).not.toContain(
      "delete from public.observatory_work_item_evidence",
    );
    expect(normalizedMigration()).toContain(
      "prevent_observatory_work_item_event_mutation",
    );
  });

  it("extends the disposable live verifier across the Work Tracker workflow", () => {
    const verifier = readFileSync(
      join(process.cwd(), "scripts/observatory/verify-local-db.ts"),
      "utf8",
    );
    for (const contract of [
      "transition_observatory_work_item",
      "add_observatory_work_item_evidence",
      "remove_observatory_work_item_evidence",
      "Ready Gate rejects incomplete work",
      "illegal state transition rejected",
      "invalid evidence URL rejected",
      "evidence add and soft removal are audited",
      "direct evidence insert denied",
    ]) {
      expect(verifier).toContain(contract);
    }
  });
});
