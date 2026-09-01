import { describe, expect, it } from "vitest";

import {
  projectCronAssets,
  projectGatewayAssets,
  projectPluginAssets,
  projectSkillAssets,
} from "@/lib/observatory/system-assets";

const collectedAt = "2026-07-22T22:00:00.000Z";

describe("system asset command projections", () => {
  it("projects safe per-agent Skill metadata without leaking paths or requirements", () => {
    const result = projectSkillAssets(
      "plato",
      {
        skills: [
          {
            name: "weather",
            eligible: true,
            description: "Forecast helper",
            source: "openclaw-workspace",
            version: "2026.7.1",
            path: "/Users/private/.openclaw/skills/weather/SKILL.md",
            missing: ["PRIVATE_TOKEN"],
            token: "secret-token",
          },
        ],
        configPath: "/Users/private/.openclaw/openclaw.json",
      },
      collectedAt,
    );

    expect(result.assets).toEqual([
      {
        id: "skill:plato:weather",
        kind: "skill",
        name: "weather",
        owner: "plato",
        authority: "observed",
        source: "openclaw/skills-list",
        collected_at: collectedAt,
        freshness: "fresh",
        health: "healthy",
        summary: "Forecast helper",
        labels: [
          { key: "eligibility", value: "ready" },
          { key: "description", value: "Forecast helper" },
          { key: "install_source", value: "openclaw-workspace" },
          { key: "version", value: "2026.7.1" },
        ],
      },
    ]);
    expect(result.relationships).toEqual([
      {
        from: "agent:plato",
        to: "skill:plato:weather",
        kind: "exposes",
        authority: "observed",
        source: "openclaw/skills-list",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /Users|PRIVATE_TOKEN|secret-token|configPath/u,
    );
  });

  it("projects plugin tool providers with bounded health labels", () => {
    const result = projectPluginAssets(
      {
        plugins: [
          {
            id: "telegram",
            name: "Telegram",
            enabled: true,
            status: "loaded",
            entry: "/Users/private/plugin.js",
            config: { token: "secret" },
          },
          { id: "disabled-plugin", enabled: false, status: "disabled" },
        ],
      },
      collectedAt,
    );

    expect(result.map((asset) => [asset.id, asset.health])).toEqual([
      ["tool:disabled-plugin", "disabled"],
      ["tool:telegram", "healthy"],
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Users|secret|entry|config/u);
  });

  it("projects allowlisted Cron schedule and health fields while discarding private execution data", () => {
    const lastRunAt = Date.parse("2026-08-31T18:00:00.000Z");
    const nextRunAt = Date.parse("2026-09-01T01:00:00.000Z");
    const result = projectCronAssets(
      {
        jobs: [
          {
            id: "job-1",
            name: "Dashboard refresh",
            agentId: "plato",
            enabled: true,
            schedule: {
              kind: "cron",
              expr: "0 18 * * *",
              tz: "America/Vancouver",
            },
            sessionTarget: "session:private-dashboard-refresh",
            payload: { message: "private instructions", token: "secret" },
            delivery: { to: "telegram:private-user" },
            trigger: { script: "return process.env.PRIVATE_TOKEN" },
            state: {
              lastStatus: "success",
              lastRunAtMs: lastRunAt,
              nextRunAtMs: nextRunAt,
              consecutiveErrors: 0,
            },
          },
        ],
      },
      collectedAt,
    );

    expect(result.assets[0]).toMatchObject({
      id: "cron:job-1",
      owner: "plato",
      health: "healthy",
      summary: "Cron · 0 18 * * *",
      labels: [
        { key: "schedule_type", value: "cron" },
        { key: "enabled", value: "enabled" },
        { key: "schedule_expression", value: "0 18 * * *" },
        { key: "timezone", value: "America/Vancouver" },
        { key: "last_status", value: "success" },
        { key: "last_run_at", value: "2026-08-31T18:00:00.000Z" },
        { key: "next_run_at", value: "2026-09-01T01:00:00.000Z" },
        { key: "consecutive_errors", value: "0" },
        { key: "runtime_target", value: "session-bound" },
      ],
    });
    expect(result.relationships[0]).toMatchObject({
      from: "cron:job-1",
      to: "agent:plato",
      kind: "runs-as",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private instructions|secret|telegram:private-user|payload|delivery|trigger|PRIVATE_TOKEN|session:private/u,
    );
  });

  it("projects every and at schedules without failing when run state is absent", () => {
    const result = projectCronAssets(
      {
        jobs: [
          {
            id: "every-job",
            name: "Quarter-hour refresh",
            enabled: false,
            schedule: { kind: "every", everyMs: 900_000 },
            sessionTarget: "isolated",
          },
          {
            id: "at-job",
            name: "Renewal reminder",
            agentId: "plato",
            schedule: { kind: "at", at: "2026-10-01T16:00:00.000Z" },
            sessionTarget: "main",
          },
        ],
      },
      collectedAt,
    );

    expect(result.assets.find((item) => item.id === "cron:every-job"))
      .toMatchObject({
        health: "disabled",
        summary: "Every 15 minutes",
        labels: expect.arrayContaining([
          { key: "schedule_type", value: "every" },
          { key: "schedule_interval_ms", value: "900000" },
          { key: "runtime_target", value: "isolated" },
        ]),
      });
    expect(result.assets.find((item) => item.id === "cron:at-job"))
      .toMatchObject({
        health: "unknown",
        summary: "Once · 2026-10-01T16:00:00.000Z",
        labels: expect.arrayContaining([
          { key: "schedule_type", value: "at" },
          { key: "enabled", value: "unknown" },
          { key: "schedule_at", value: "2026-10-01T16:00:00.000Z" },
          { key: "last_status", value: "unknown" },
          { key: "runtime_target", value: "main" },
        ]),
      });
  });

  it("keeps malformed Cron state unknown and drops invalid schedule and timestamp values", () => {
    const result = projectCronAssets(
      {
        jobs: [
          {
            id: "unreported-job",
            enabled: "yes",
            schedule: {
              kind: "cron",
              expr: "\nprivate payload",
              tz: "../../private",
            },
            state: {
              lastRunAtMs: "not-a-timestamp",
              nextRunAtMs: -1,
              consecutiveErrors: -3,
            },
          },
          {
            id: "legacy-error-job",
            schedule: { kind: "every", everyMs: 60_000 },
            state: { lastRunStatus: "error" },
          },
        ],
      },
      collectedAt,
    );

    expect(result.assets.find((item) => item.id === "cron:unreported-job"))
      .toMatchObject({
      id: "cron:unreported-job",
      health: "unknown",
      summary: "Cron schedule",
      labels: [
        { key: "schedule_type", value: "cron" },
        { key: "enabled", value: "unknown" },
        { key: "last_status", value: "unknown" },
        { key: "runtime_target", value: "unknown" },
      ],
      });
    expect(JSON.stringify(result)).not.toMatch(
      /private payload|\.\.\/\.\.\/private|not-a-timestamp|-3/u,
    );
    expect(result.assets.find((item) => item.id === "cron:legacy-error-job"))
      .toMatchObject({
        health: "failed",
        labels: expect.arrayContaining([
          { key: "enabled", value: "unknown" },
          { key: "last_status", value: "error" },
        ]),
      });
  });

  it("projects Gateway and runtime health without URLs, tokens, or sessions", () => {
    const result = projectGatewayAssets(
      {
        service: { loaded: true, runtime: { status: "running" } },
        rpc: { ok: true, url: "ws://127.0.0.1:18789?token=secret" },
        sessions: [{ key: "agent:plato:private" }],
        configPath: "/Users/private/.openclaw/openclaw.json",
      },
      collectedAt,
    );

    expect(result).toEqual([
      {
        id: "gateway:openclaw",
        kind: "gateway",
        name: "OpenClaw Gateway",
        owner: "OpenClaw",
        authority: "observed",
        source: "openclaw/gateway-status",
        collected_at: collectedAt,
        freshness: "fresh",
        health: "healthy",
        summary: "Running and reachable",
        labels: [
          { key: "service", value: "running" },
          { key: "rpc", value: "reachable" },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /127\.0\.0\.1|secret|private|configPath|sessions/u,
    );
  });

  it("fails closed when a command result lacks its expected collection", () => {
    expect(() => projectSkillAssets("plato", { token: "secret" }, collectedAt)).toThrow(
      /skills array/u,
    );
    expect(() => projectCronAssets([], collectedAt)).toThrow(/jobs array/u);
  });
});
