import { describe, expect, it, vi } from "vitest";

import { collectAgentActivity } from "@/lib/observatory/agent-activity-collector";
import type {
  CommandInvocation,
  CommandResult,
} from "@/lib/observatory/collector";
import type { ObservatoryAgent } from "@/lib/observatory/collection-schema";

const agents: ObservatoryAgent[] = [
  {
    id: "plato",
    display_name: "Plato",
    emoji: "🏛️",
    model_label: "openai/gpt-5.6-sol",
    workspace_label: "plato",
    binding_count: 1,
    default: false,
  },
];

const configOutput = JSON.stringify({
  defaults: { thinkingDefault: "medium" },
  entries: [{ id: "plato", model: "openai/gpt-5.6-sol" }],
  privatePath: "/Users/private/.openclaw/openclaw.json",
});

const activityOutput = JSON.stringify({
  sessions: [
    {
      key: "agent:plato:telegram:direct:private-user",
      agentId: "plato",
      kind: "direct",
      channel: "telegram",
      chatType: "direct",
      displayName: "Private Person private@example.com id:123",
      modelProvider: "openai",
      model: "gpt-5.6-sol",
      thinkingLevel: "medium",
      thinkingDefault: "medium",
      status: "done",
      hasActiveRun: false,
      updatedAt: 1_000,
    },
    {
      key: "agent:plato:telegram:direct:private-user",
      agentId: "plato",
      kind: "direct",
      channel: "telegram",
      chatType: "direct",
      displayName: "Private Person private@example.com id:123",
      modelProvider: "openai",
      model: "gpt-5.6-sol",
      thinkingLevel: "high",
      thinkingDefault: "medium",
      status: "running",
      hasActiveRun: true,
      updatedAt: 2_000,
    },
    {
      key: "agent:plato:telegram:group:-123",
      agentId: "plato",
      kind: "group",
      channel: "telegram",
      chatType: "group",
      displayName: "Multi Agents",
      modelProvider: "openai",
      model: "gpt-5.6-sol",
      thinkingLevel: "medium",
      thinkingDefault: "medium",
      status: "done",
      hasActiveRun: false,
      updatedAt: 1_500,
    },
    {
      key: "agent:plato:telegram:group:-123",
      agentId: "plato",
      kind: "group",
      channel: "telegram",
      chatType: "group",
      displayName: "Multi Agents",
      modelProvider: "openai",
      model: "gpt-5.6-luna",
      thinkingLevel: "low",
      thinkingDefault: "medium",
      status: "done",
      hasActiveRun: false,
      updatedAt: 3_000,
    },
    {
      key: "agent:plato:slack:group:private",
      agentId: "plato",
      kind: "group",
      channel: "slack",
      displayName: "Private Slack",
      model: "gpt-5.6-sol",
      updatedAt: 4_000,
    },
  ],
});

function runner(
  seen: CommandInvocation[] = [],
  outputs: { config?: string; activity?: string } = {},
) {
  return async (invocation: CommandInvocation): Promise<CommandResult> => {
    seen.push(invocation);
    if (invocation.args[0] === "config") {
      return {
        exitCode: outputs.config === undefined ? 0 : 1,
        stdout: outputs.config ?? configOutput,
      };
    }
    return {
      exitCode: outputs.activity === undefined ? 0 : 1,
      stdout: outputs.activity ?? activityOutput,
    };
  };
}

describe("collectAgentActivity", () => {
  it("collects the latest safe Telegram Direct and group activity", async () => {
    const seen: CommandInvocation[] = [];
    const snapshot = await collectAgentActivity(
      { agents },
      {
        runCommand: runner(seen),
        now: () => new Date("2026-09-10T22:00:00.000Z"),
      },
    );

    expect(seen).toEqual([
      {
        command: "openclaw",
        args: ["config", "get", "agents", "--json"],
        timeoutMs: 30_000,
      },
      {
        command: "openclaw",
        args: [
          "gateway",
          "call",
          "sessions.list",
          "--json",
          "--params",
          '{"limit":500}',
        ],
        timeoutMs: 30_000,
      },
    ]);
    expect(snapshot.status).toBe("ready");
    expect(snapshot.agents[0]).toMatchObject({
      agent_id: "plato",
      default_thinking_level: "medium",
      latest_direct: {
        label: "Telegram Direct",
        model_label: "openai/gpt-5.6-sol",
        model_source: "configured",
        thinking_level: "high",
        thinking_source: "override",
        run_state: "running",
        active: true,
        updated_at: "1970-01-01T00:00:02.000Z",
      },
    });
    expect(snapshot.agents[0]?.telegram_groups).toEqual([
      expect.objectContaining({
        label: "Multi Agents",
        model_label: "openai/gpt-5.6-luna",
        model_source: "override",
        thinking_level: "low",
        thinking_source: "override",
        updated_at: "1970-01-01T00:00:03.000Z",
      }),
    ]);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("private@example.com");
    expect(serialized).not.toContain("/Users/private");
    expect(serialized).not.toContain("-123");
    expect(serialized).not.toContain("Private Slack");
  });

  it("inherits the configured Thinking default when no explicit level exists", async () => {
    const sessions = JSON.stringify({
      sessions: [
        {
          key: "agent:plato:telegram:group:-456",
          agentId: "plato",
          kind: "group",
          channel: "telegram",
          displayName: "Household Team",
          modelProvider: "openai",
          model: "gpt-5.6-sol",
          thinkingLevel: null,
          thinkingDefault: "medium",
          updatedAt: 5_000,
        },
      ],
    });
    const runCommand = vi.fn(async (invocation: CommandInvocation) => ({
      exitCode: 0,
      stdout: invocation.args[0] === "config" ? configOutput : sessions,
    }));

    const snapshot = await collectAgentActivity(
      { agents },
      { runCommand, now: () => new Date("2026-09-10T22:00:00.000Z") },
    );

    expect(snapshot.agents[0]?.telegram_groups[0]).toMatchObject({
      thinking_level: "medium",
      thinking_source: "inherited",
    });
  });

  it("accepts the canonical object-keyed Agent config", async () => {
    const objectConfig = JSON.stringify({
      defaults: { thinkingDefault: "medium" },
      entries: {
        plato: {
          model: { primary: "openai/gpt-5.6-sol" },
          thinkingDefault: "high",
        },
      },
    });
    const runCommand = vi.fn(async (invocation: CommandInvocation) => ({
      exitCode: 0,
      stdout: invocation.args[0] === "config" ? objectConfig : activityOutput,
    }));

    const snapshot = await collectAgentActivity(
      { agents },
      { runCommand, now: () => new Date("2026-09-10T22:00:00.000Z") },
    );

    expect(snapshot.status).toBe("ready");
    expect(snapshot.agents[0]?.default_thinking_level).toBe("high");
  });

  it("degrades independently when config or activity is unavailable", async () => {
    const configUnavailable = await collectAgentActivity(
      { agents },
      {
        runCommand: runner([], { config: "failed" }),
        now: () => new Date("2026-09-10T22:00:00.000Z"),
      },
    );
    expect(configUnavailable.status).toBe("partial");
    expect(configUnavailable.agents[0]?.default_thinking_level).toBeNull();
    expect(configUnavailable.agents[0]?.latest_direct).not.toBeNull();

    const unavailable = await collectAgentActivity(
      { agents },
      {
        runCommand: runner([], { config: "failed", activity: "failed" }),
        now: () => new Date("2026-09-10T22:00:00.000Z"),
      },
    );
    expect(unavailable).toMatchObject({
      status: "unavailable",
      agents: [
        {
          agent_id: "plato",
          default_thinking_level: null,
          latest_direct: null,
          telegram_groups: [],
        },
      ],
    });
  });
});
