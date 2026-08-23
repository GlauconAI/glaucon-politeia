import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ProjectExecutionSnapshotSchema,
  computeProjectExecutionDigest,
} from "@/lib/observatory/project-execution-schema";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function fixture() {
  const payload = {
    schema_version: "1.0.0" as const,
    collected_at: "2026-08-23T20:00:00Z",
    summary: {
      project_count: 1,
      execution_line_count: 2,
      active_count: 1,
      waiting_count: 0,
      blocked_count: 0,
      completed_count: 0,
      independent_owner_line_count: 1,
    },
    projects: [
      {
        project: {
          project_key: "plato/dashboard",
          title: "402V Dashboard",
          owner_agent_id: "socrates",
          status: "active",
          current_stage: "stage_dashboard",
          current_gate: "Gate 2",
          updated_at: "2026-08-23T19:59:00Z",
          source_revision: 7,
          freshness: "fresh" as const,
        },
        execution_lines: [
          {
            line_id: "dashboard",
            stage_id: "stage_dashboard",
            run_id: "run_dashboard",
            title: "Build Dashboard",
            owner_agent_id: "plato",
            transfer_mode: "project_executor" as const,
            status: "active" as const,
            dependencies: [],
            return_trigger: "terminal_signal" as const,
            execution_line_returns_to_originating_agent: true as const,
            artifact_ref: "dashboard/project-execution",
            verification_summary: null,
            started_at: "2026-08-23T19:00:00Z",
            handed_off_at: null,
            updated_at: "2026-08-23T19:59:00Z",
            completed_at: null,
            user_returned_at: null,
            canonical_result_ref: null,
          },
          {
            line_id: "research",
            stage_id: "stage_research",
            run_id: "run_research",
            title: "Independent research",
            owner_agent_id: "aristotle",
            transfer_mode: "independent_owner_line" as const,
            status: "transferred" as const,
            dependencies: ["dashboard"],
            return_trigger: "explicit_user_return" as const,
            execution_line_returns_to_originating_agent: false as const,
            artifact_ref: null,
            verification_summary: "Handed to User and Owner.",
            started_at: null,
            handed_off_at: "2026-08-23T19:30:00Z",
            updated_at: "2026-08-23T19:30:00Z",
            completed_at: null,
            user_returned_at: null,
            canonical_result_ref: null,
          },
        ],
        summary: {
          execution_line_count: 2,
          active_count: 1,
          waiting_count: 0,
          blocked_count: 0,
          completed_count: 0,
          independent_owner_line_count: 1,
        },
        collected_at: "2026-08-23T20:00:00Z",
      },
    ],
  };
  return {
    ...payload,
    digest: createHash("sha256")
      .update(JSON.stringify(canonicalize(payload)))
      .digest("hex"),
  };
}

export { fixture as projectExecutionFixture };

describe("ProjectExecutionSnapshotSchema", () => {
  it("accepts the exact Orchestrator v1 public projection and verifies its digest", () => {
    const snapshot = fixture();

    expect(ProjectExecutionSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(computeProjectExecutionDigest(snapshot)).toBe(snapshot.digest);
  });

  it("rejects private fields and unsafe logical references", () => {
    const privateField = fixture() as ReturnType<typeof fixture> & {
      owner_session_key?: string;
    };
    privateField.owner_session_key = "agent:main:telegram:direct:private";

    expect(ProjectExecutionSnapshotSchema.safeParse(privateField).success).toBe(false);

    const absoluteReference = fixture();
    absoluteReference.projects[0].execution_lines[0].artifact_ref =
      "/Users/private/result.md";
    expect(ProjectExecutionSnapshotSchema.safeParse(absoluteReference).success).toBe(false);

    const privateSummary = fixture();
    privateSummary.projects[0].execution_lines[0].verification_summary =
      "Evidence at /Users/private/work_0123456789abcdef01234567";
    expect(ProjectExecutionSnapshotSchema.safeParse(privateSummary).success).toBe(false);
  });

  it("rejects summary drift and transfer-mode semantic drift", () => {
    const summaryDrift = fixture();
    summaryDrift.summary.active_count = 99;
    expect(ProjectExecutionSnapshotSchema.safeParse(summaryDrift).success).toBe(false);

    const modeDrift = fixture();
    modeDrift.projects[0].execution_lines[1].return_trigger =
      "terminal_signal" as "explicit_user_return";
    expect(ProjectExecutionSnapshotSchema.safeParse(modeDrift).success).toBe(false);
  });

  it("rejects dependency cycles and duplicate Project keys", () => {
    const cycle = fixture();
    cycle.projects[0].execution_lines[0].dependencies = ["research"];
    expect(ProjectExecutionSnapshotSchema.safeParse(cycle).success).toBe(false);

    const duplicateProject = fixture();
    duplicateProject.projects.push(duplicateProject.projects[0]);
    duplicateProject.summary.project_count = 2;
    duplicateProject.summary.execution_line_count = 4;
    duplicateProject.summary.active_count = 2;
    duplicateProject.summary.independent_owner_line_count = 2;
    expect(ProjectExecutionSnapshotSchema.safeParse(duplicateProject).success).toBe(false);
  });
});
