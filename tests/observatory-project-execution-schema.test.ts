import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

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

  it("loads through the native Node runtime used by Observatory scripts", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--input-type=module",
        "--eval",
        'import("./lib/observatory/project-execution-schema.ts")',
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
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

  it("rejects POSIX, Windows, UNC, home, and file paths in every public text field", () => {
    const unsafeValues = [
      "/private/secret.md",
      "Read /opt/private/secret.md",
      "C:\\Users\\private\\secret.md",
      "D:/private/secret.md",
      "\\\\server\\share\\secret.md",
      "//server/share/secret.md",
      "~/private/secret.md",
      "file:///private/secret.md",
      "path:/private/secret.md",
      ".openclaw/private/config.json",
      "Obsidian/Private Vault/secret.md",
      "Glaucon's Vault/private/secret.md",
      "See./etc/passwd",
      "See!/etc/passwd",
      "See?/etc/passwd",
      "See—/etc/passwd",
      "**/etc/passwd**",
      "See:C:\\Users\\private\\secret.md",
      "**C:\\Users\\private\\secret.md**",
      "See:\\\\server\\share\\secret.md",
      "file://server/share/secret.md",
      "file://localhost/etc/passwd",
    ];
    const mutatePublicText = [
      (snapshot: ReturnType<typeof fixture>, value: string) => {
        snapshot.projects[0].project.title = value;
      },
      (snapshot: ReturnType<typeof fixture>, value: string) => {
        snapshot.projects[0].project.status = value;
      },
      (snapshot: ReturnType<typeof fixture>, value: string) => {
        snapshot.projects[0].project.current_stage = value;
      },
      (snapshot: ReturnType<typeof fixture>, value: string) => {
        snapshot.projects[0].project.current_gate = value;
      },
      (snapshot: ReturnType<typeof fixture>, value: string) => {
        snapshot.projects[0].execution_lines[0].title = value;
      },
    ];

    for (const unsafeValue of unsafeValues) {
      for (const mutate of mutatePublicText) {
        const snapshot = fixture();
        mutate(snapshot, unsafeValue);
        expect(
          ProjectExecutionSnapshotSchema.safeParse(snapshot).success,
          unsafeValue,
        ).toBe(false);
      }

      const logicalReference = fixture();
      logicalReference.projects[0].execution_lines[0].artifact_ref = unsafeValue;
      expect(
        ProjectExecutionSnapshotSchema.safeParse(logicalReference).success,
        unsafeValue,
      ).toBe(false);

      const summary = fixture();
      summary.projects[0].execution_lines[0].verification_summary = unsafeValue;
      expect(
        ProjectExecutionSnapshotSchema.safeParse(summary).success,
        unsafeValue,
      ).toBe(false);
    }
  });

  it("preserves normal labels and relative logical references", () => {
    const snapshot = fixture();
    snapshot.projects[0].project.title = "Design / Review";
    snapshot.projects[0].project.status = "C: Drive compatibility";
    snapshot.projects[0].project.current_stage = "iOS/Android";
    snapshot.projects[0].project.current_gate = "Gate 2 (A/B)";
    snapshot.projects[0].execution_lines[0].title = "Compare desktop/mobile";
    snapshot.projects[0].execution_lines[1].title = "Glaucon Vault";
    snapshot.projects[0].execution_lines[0].artifact_ref = "docs/result.md";
    snapshot.projects[0].execution_lines[0].verification_summary =
      "Compared iOS/Android layouts.";

    expect(ProjectExecutionSnapshotSchema.safeParse(snapshot).success).toBe(true);

    snapshot.projects[0].project.title = "https://example.com/public/path";
    snapshot.projects[0].execution_lines[0].title = "A//B comparison";
    expect(ProjectExecutionSnapshotSchema.safeParse(snapshot).success).toBe(true);

    for (const relativeReference of [
      "./docs/result.md",
      "../docs/result.md",
      ".\\docs\\result.md",
      "..\\docs\\result.md",
    ]) {
      snapshot.projects[0].execution_lines[0].artifact_ref = relativeReference;
      expect(
        ProjectExecutionSnapshotSchema.safeParse(snapshot).success,
        relativeReference,
      ).toBe(true);
    }
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
