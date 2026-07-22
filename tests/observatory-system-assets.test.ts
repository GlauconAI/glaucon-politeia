import { describe, expect, it } from "vitest";

import {
  projectCronAssets,
  projectGatewayAssets,
  projectPluginAssets,
  projectSkillAssets,
} from "@/lib/observatory/system-assets";

const collectedAt = "2026-07-22T22:00:00.000Z";

describe("system asset command projections", () => {
  it("projects per-agent skills without leaking paths or requirements", () => {
    const result = projectSkillAssets(
      "plato",
      {
        skills: [
          {
            name: "weather",
            eligible: true,
            description: "Forecast helper",
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
        summary: "Ready",
        labels: [{ key: "eligibility", value: "ready" }],
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

  it("projects cron schedules and state while discarding payload and delivery", () => {
    const result = projectCronAssets(
      {
        jobs: [
          {
            id: "job-1",
            name: "Dashboard refresh",
            agentId: "plato",
            enabled: true,
            schedule: { kind: "every", everyMs: 900000 },
            payload: { message: "private instructions", token: "secret" },
            delivery: { to: "telegram:private-user" },
            state: {
              lastStatus: "success",
              lastRunAtMs: 1784757600000,
              nextRunAtMs: 1784758500000,
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
      summary: "Every 15 minutes",
      labels: [
        { key: "schedule", value: "every" },
        { key: "last_status", value: "success" },
      ],
    });
    expect(result.relationships[0]).toMatchObject({
      from: "cron:job-1",
      to: "agent:plato",
      kind: "runs-as",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private instructions|secret|telegram:private-user|payload|delivery/u,
    );
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
