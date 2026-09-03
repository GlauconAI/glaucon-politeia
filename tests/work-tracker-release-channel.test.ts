import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildVerificationSteps,
  cleanGeneratedNextTypes,
  runVerificationSteps,
} from "@/scripts/release/work-tracker-verify.mjs";
import {
  PRODUCTION_ORIGIN,
  SMOKE_PATHS,
  validateSmokeResponse,
} from "@/scripts/release/work-tracker-smoke.mjs";
import {
  analyzeApprovalSessions,
  formatApprovalReport,
} from "@/scripts/release/work-tracker-approval-report.mjs";

describe("Work Tracker release verification", () => {
  it("uses a deterministic single-worker quality gate", () => {
    expect(buildVerificationSteps()).toEqual([
      expect.objectContaining({
        id: "tests",
        command: "npm",
        args: ["test", "--", "--maxWorkers=1"],
      }),
      expect.objectContaining({ id: "lint", command: "npm", args: ["run", "lint"] }),
      expect.objectContaining({ id: "typecheck", command: "npm", args: ["run", "typecheck"] }),
      expect.objectContaining({ id: "diff-check", command: "git", args: ["diff", "--check"] }),
    ]);
  });

  it("stops after the first failed verification step", async () => {
    const calls: string[] = [];
    const result = await runVerificationSteps(
      buildVerificationSteps().slice(0, 3),
      async (step) => {
        calls.push(step.id);
        return { exitCode: step.id === "lint" ? 1 : 0, durationMs: 5 };
      },
    );

    expect(calls).toEqual(["tests", "lint"]);
    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("lint");
  });

  it("removes only generated Next type output before verification", () => {
    const calls: Array<{ path: string; options: unknown }> = [];
    cleanGeneratedNextTypes("/repo", (path, options) => {
      calls.push({ path, options });
    });
    expect(calls).toEqual([
      {
        path: join("/repo", ".next", "types"),
        options: { recursive: true, force: true },
      },
    ]);
  });

  it("keeps the networked dependency audit in CI", () => {
    const workflow = readFileSync(".github/workflows/quality.yml", "utf8");
    expect(workflow).toContain("actions/checkout@v7");
    expect(workflow).toContain("actions/setup-node@v7");
    expect(workflow).toContain("npm run release:verify");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm audit --omit=dev --audit-level=high");
    expect(workflow).toContain("contents: read");
  });
});

describe("Work Tracker production smoke contract", () => {
  it("has a fixed production origin and bounded paths", () => {
    expect(PRODUCTION_ORIGIN).toBe("https://402v.com");
    expect(SMOKE_PATHS).toEqual(["/", "/work-tracker"]);
  });

  it("rejects redirects away from the production origin", () => {
    expect(() =>
      validateSmokeResponse({
        requestedPath: "/work-tracker",
        finalUrl: "https://example.com/work-tracker",
        status: 200,
        contentType: "text/html; charset=utf-8",
      }),
    ).toThrow(/unexpected origin/i);
  });
});

describe("Work Tracker approval observation", () => {
  it("counts only metadata and never returns command or conversation bodies", () => {
    const root = mkdtempSync(join(tmpdir(), "work-tracker-approval-report-"));
    const sensitive = "PRIVATE-COMMAND-BODY";
    const sessionPath = join(root, "rollout.jsonl");
    const records = [
      {
        type: "session_meta",
        timestamp: "2026-09-02T00:00:00.000Z",
        payload: { cwd: "/repo/.worktrees/task" },
      },
      {
        type: "response_item",
        timestamp: "2026-09-02T00:01:00.000Z",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          input: `await tools.exec_command({cmd:${JSON.stringify(sensitive)}, sandbox_permissions:"require_escalated"})`,
        },
      },
      {
        type: "response_item",
        timestamp: "2026-09-02T00:02:00.000Z",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          input: "await tools.gateway_exec({command:\"git status\"})",
        },
      },
      {
        type: "response_item",
        timestamp: "2026-09-02T00:03:00.000Z",
        payload: {
          type: "custom_tool_call_output",
          output: "Exec denied (SYSTEM_RUN_DENIED)",
        },
      },
    ];
    writeFileSync(sessionPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);

    const report = analyzeApprovalSessions([sessionPath], {
      repoMarker: "/repo",
      since: new Date("2026-09-01T00:00:00.000Z"),
      now: new Date("2026-09-08T00:00:00.000Z"),
    });
    const output = formatApprovalReport(report);

    expect(report).toMatchObject({
      relevantSessions: 1,
      escalationRequests: 1,
      gatewayExecCalls: 1,
      deniedCalls: 1,
      manualApprovalCount: null,
    });
    expect(output).not.toContain(sensitive);
    expect(output).not.toContain("git status");
  });

  it("ignores unrelated sessions", () => {
    const root = mkdtempSync(join(tmpdir(), "work-tracker-approval-unrelated-"));
    const sessionPath = join(root, "rollout.jsonl");
    writeFileSync(
      sessionPath,
      `${JSON.stringify({ type: "session_meta", timestamp: "2026-09-02T00:00:00.000Z", payload: { cwd: "/another/repo" } })}\n`,
    );

    expect(
      analyzeApprovalSessions([sessionPath], {
        repoMarker: "/target/repo",
        since: new Date("2026-09-01T00:00:00.000Z"),
        now: new Date("2026-09-08T00:00:00.000Z"),
      }).relevantSessions,
    ).toBe(0);
  });

  it("does not count tool calls outside the report window", () => {
    const root = mkdtempSync(join(tmpdir(), "work-tracker-approval-window-"));
    const sessionPath = join(root, "rollout.jsonl");
    const records = [
      {
        type: "session_meta",
        timestamp: "2026-08-20T00:00:00.000Z",
        payload: { cwd: "/repo" },
      },
      {
        type: "response_item",
        timestamp: "2026-08-21T00:00:00.000Z",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          input: 'sandbox_permissions:"require_escalated"',
        },
      },
      {
        type: "response_item",
        timestamp: "2026-09-02T00:00:00.000Z",
        payload: {
          type: "custom_tool_call",
          name: "exec",
          input: 'sandbox_permissions:"require_escalated"',
        },
      },
    ];
    writeFileSync(sessionPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);

    expect(
      analyzeApprovalSessions([sessionPath], {
        repoMarker: "/repo",
        since: new Date("2026-09-01T00:00:00.000Z"),
        now: new Date("2026-09-08T00:00:00.000Z"),
      }),
    ).toMatchObject({ relevantSessions: 1, escalationRequests: 1 });
  });
});
