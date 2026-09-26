import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260926000100_concerto_agent_work_item_api.sql",
  ),
  "utf8",
);

describe("Concerto Agent Work Item API migration", () => {
  it("adds Agent principals and durable idempotency without granting direct writes", () => {
    expect(source).toContain("add column created_by_agent text");
    expect(source).toContain("observatory_work_items_creator_principal_check");
    expect(source).toContain("create table public.observatory_agent_work_item_operations");
    expect(source).toContain("unique (agent_id, idempotency_key)");
    expect(source).toContain("request_fingerprint");
    expect(source).toMatch(
      /revoke all privileges on table public\.observatory_agent_work_item_operations[\s\S]*from public, anon, authenticated, service_role/iu,
    );
  });

  it("exposes only service-role Agent mutation RPCs", () => {
    for (const name of [
      "create_observatory_work_item_as_agent",
      "execute_observatory_agent_work_item_command",
    ]) {
      expect(source).toContain(`create function public.${name}`);
      expect(source).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`,
          "iu",
        ),
      );
      expect(source).toMatch(
        new RegExp(
          `revoke all privileges on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated, service_role`,
          "iu",
        ),
      );
    }
  });

  it("enforces optimistic versions, role boundaries, final transitions, and Agent audit events", () => {
    expect(source).toContain("OBSERVATORY_VERSION_CONFLICT");
    expect(source).toContain("OBSERVATORY_AGENT_FORBIDDEN");
    expect(source).toContain("OBSERVATORY_INVALID_TRANSITION");
    expect(source).toContain("OBSERVATORY_READY_GATE_FAILED");
    expect(source).toContain("target_state in ('done', 'reopened')");
    expect(source).toContain("p_is_project_owner");
    expect(source).toMatch(
      /insert into public\.observatory_work_item_events[\s\S]*agent_id[\s\S]*p_agent_id/iu,
    );
  });

  it("serializes idempotency keys and rejects changed request fingerprints", () => {
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("OBSERVATORY_IDEMPOTENCY_CONFLICT");
    expect(source).toContain("p_request_fingerprint");
  });
});
