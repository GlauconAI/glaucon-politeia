import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_AGENT_ACTIVITY_MAX_GROUPS,
  ObservatoryAgentActivitySnapshotSchema,
} from "@/lib/observatory/agent-activity-schema";

const row = {
  identity: "a".repeat(64),
  label: "Multi Agents",
  model_label: "openai/gpt-5.6-sol",
  model_source: "configured" as const,
  thinking_level: "medium",
  thinking_source: "inherited" as const,
  run_state: "done" as const,
  active: false,
  updated_at: "2026-09-10T22:00:00.000Z",
};

describe("Observatory Agent activity schema", () => {
  it("accepts the bounded whitelist", () => {
    const parsed = ObservatoryAgentActivitySnapshotSchema.parse({
      status: "ready",
      collected_at: "2026-09-10T22:05:00.000Z",
      agents: [
        {
          agent_id: "plato",
          default_thinking_level: "medium",
          latest_direct: { ...row, label: "Telegram Direct" },
          telegram_groups: [row],
        },
      ],
    });

    expect(parsed.agents[0]?.telegram_groups).toHaveLength(1);
  });

  it("rejects unknown or unbounded activity data", () => {
    expect(
      ObservatoryAgentActivitySnapshotSchema.safeParse({
        status: "ready",
        collected_at: "2026-09-10T22:05:00.000Z",
        agents: [
          {
            agent_id: "plato",
            default_thinking_level: "medium",
            latest_direct: null,
            telegram_groups: Array.from(
              { length: OBSERVATORY_AGENT_ACTIVITY_MAX_GROUPS + 1 },
              (_, index) => ({
                ...row,
                identity: index.toString(16).padStart(64, "0"),
              }),
            ),
            raw_session_key: "agent:plato:telegram:private",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
