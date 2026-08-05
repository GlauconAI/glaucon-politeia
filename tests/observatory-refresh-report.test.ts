import { describe, expect, it } from "vitest";

import {
  createObservatoryRefreshReport,
  formatObservatoryRefreshFailureMessage,
  formatObservatoryRefreshSuccessMessage,
  redactObservatoryDiagnostic,
} from "@/lib/observatory/refresh-report";

function snapshot(options: {
  projects?: Array<{ project_key: string; name: string; title?: string }>;
  agents?: Array<{ id: string; display_name: string }>;
  assets?: Array<{
    id: string;
    kind:
      | "skill"
      | "tool"
      | "repository"
      | "cron"
      | "profile"
      | "rule"
      | "config"
      | "knowledge"
      | "agenda"
      | "gateway"
      | "runtime";
    name: string;
    owner: string;
  }>;
} = {}) {
  const projects = options.projects ?? [];
  const agents = options.agents ?? [];
  const assets = options.assets ?? [];
  return {
    registry: {
      project_groups: [{ owner: "Plato", projects }],
    },
    agents,
    assets,
    relationships: [{ from: "agent:plato", to: "skill:one" }],
  };
}

describe("Observatory refresh report", () => {
  it("reports added and removed projects, skills, agents, tools, and repositories", () => {
    const previous = snapshot({
      projects: [{ project_key: "plato/old-project", name: "old-project" }],
      agents: [{ id: "old-agent", display_name: "Old Agent" }],
      assets: [
        { id: "skill:old", kind: "skill", name: "old-skill", owner: "plato" },
        { id: "tool:stable", kind: "tool", name: "stable-tool", owner: "plato" },
      ],
    });
    const current = snapshot({
      projects: [
        {
          project_key: "plato/new-project",
          name: "new-project",
          title: "New Project",
        },
      ],
      agents: [{ id: "new-agent", display_name: "New Agent" }],
      assets: [
        { id: "skill:new", kind: "skill", name: "new-skill", owner: "plato" },
        { id: "tool:stable", kind: "tool", name: "stable-tool", owner: "plato" },
        {
          id: "repository:new",
          kind: "repository",
          name: "new-repository",
          owner: "plato",
        },
      ],
    });

    const report = createObservatoryRefreshReport(
      previous,
      current,
      "2026-08-05T21:30:00.000Z",
      266_000,
    );

    expect(report.changes.projects).toEqual({
      added: ["New Project (plato/new-project)"],
      removed: ["old-project (plato/old-project)"],
    });
    expect(report.changes.skills).toEqual({
      added: ["plato/new-skill"],
      removed: ["plato/old-skill"],
    });
    expect(report.changes.agents).toEqual({
      added: ["New Agent"],
      removed: ["Old Agent"],
    });
    expect(report.changes.tools).toEqual({ added: [], removed: [] });
    expect(report.changes.repositories).toEqual({
      added: ["new-repository"],
      removed: [],
    });
    expect(report.totals).toEqual({
      projects: 1,
      skills: 1,
      agents: 1,
      tools: 1,
      repositories: 1,
      assets: 3,
      relationships: 1,
    });
  });

  it("includes changes from every Observatory asset kind", () => {
    const previous = snapshot();
    const current = snapshot({
      assets: [
        { id: "cron:new", kind: "cron", name: "Daily Review", owner: "plato" },
        {
          id: "knowledge:new",
          kind: "knowledge",
          name: "LLM Wiki",
          owner: "aristotle",
        },
      ],
    });

    const report = createObservatoryRefreshReport(
      previous,
      current,
      "2026-08-05T21:30:00.000Z",
      1_000,
    );
    const message = formatObservatoryRefreshSuccessMessage(report, {
      recovered: false,
      retentionOk: true,
    });

    expect(report.changes.crons.added).toEqual(["plato/Daily Review"]);
    expect(report.changes.knowledge.added).toEqual(["aristotle/LLM Wiki"]);
    expect(message).toContain("• Cron：新增 plato/Daily Review");
    expect(message).toContain("• Knowledge：新增 aristotle/LLM Wiki");
  });

  it("formats a readable success message and states when inventory is unchanged", () => {
    const current = snapshot({
      projects: [{ project_key: "plato/dashboard", name: "dashboard" }],
      agents: [{ id: "plato", display_name: "Plato" }],
      assets: [
        { id: "skill:one", kind: "skill", name: "one", owner: "plato" },
      ],
    });
    const report = createObservatoryRefreshReport(
      current,
      current,
      "2026-08-05T21:30:00.000Z",
      266_000,
    );

    const message = formatObservatoryRefreshSuccessMessage(report, {
      recovered: false,
      retentionOk: true,
    });

    expect(message).toContain("Dashboard 每日更新完成");
    expect(message).toContain("状态：更新成功，Dashboard 已使用最新信息");
    expect(message).toContain("耗时：4 分 26 秒");
    expect(message).toContain("本次未发现受监控资产的新增和删除");
    expect(message).toContain("Project 1 · Skill 1 · Agent 1 · Tool 0 · Repository 0");
    expect(message).toContain("历史 Snapshot 保留：正常");
  });

  it("redacts secrets from persisted diagnostics and formats a safe failure message", () => {
    const diagnostic = redactObservatoryDiagnostic(
      "Authorization: Bearer top-secret\nSUPABASE_SECRET_KEY=also-secret\nCOMMAND_TIMEOUT: OpenClaw agents",
    );
    expect(diagnostic).not.toContain("top-secret");
    expect(diagnostic).not.toContain("also-secret");
    expect(diagnostic).toContain("COMMAND_TIMEOUT: OpenClaw agents");

    const message = formatObservatoryRefreshFailureMessage({
      failedAt: "2026-08-05T21:30:00.000Z",
      stage: "collect",
      failureCode: "COMMAND_TIMEOUT_AGENTS",
      diagnosticFile: "20260805T213000000Z-collect-COMMAND_TIMEOUT_AGENTS.log",
    });
    expect(message).toContain("Dashboard 每日更新未完成");
    expect(message).toContain("Dashboard 继续使用上一份有效数据");
    expect(message).toContain("阶段：信息采集");
    expect(message).toContain("错误代码：COMMAND_TIMEOUT_AGENTS");
    expect(message).toContain("诊断日志：20260805T213000000Z-collect-COMMAND_TIMEOUT_AGENTS.log");
  });
});
