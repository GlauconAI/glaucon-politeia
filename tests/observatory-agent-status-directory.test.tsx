import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AgentStatusDirectory } from "@/components/observatory/AgentStatusDirectory";
import type { ObservatoryAgentActivitySnapshot } from "@/lib/observatory/agent-activity-schema";
import type { ObservatoryAgent } from "@/lib/observatory/collection-schema";

const agents: ObservatoryAgent[] = [
  {
    id: "plato",
    display_name: "Plato",
    emoji: "🔮",
    model_label: "openai/gpt-5.6-sol",
    workspace_label: "plato",
    binding_count: 1,
    default: false,
  },
];

const activity: ObservatoryAgentActivitySnapshot = {
  status: "ready",
  collected_at: "2026-09-10T22:00:00.000Z",
  agents: [
    {
      agent_id: "plato",
      default_thinking_level: "medium",
      latest_direct: {
        identity: "a".repeat(64),
        label: "Telegram Direct",
        model_label: "openai/gpt-5.6-sol",
        model_source: "configured",
        thinking_level: "high",
        thinking_source: "override",
        run_state: "running",
        active: true,
        updated_at: "2026-09-10T21:55:00.000Z",
      },
      telegram_groups: [
        {
          identity: "b".repeat(64),
          label: "Multi Agents",
          model_label: "openai/gpt-5.6-luna",
          model_source: "override",
          thinking_level: "low",
          thinking_source: "override",
          run_state: "done",
          active: false,
          updated_at: "2026-09-10T21:50:00.000Z",
        },
      ],
    },
  ],
};

describe("AgentStatusDirectory", () => {
  it("shows default, latest TD, runtime state, and collapsed group activity", () => {
    render(<AgentStatusDirectory agents={agents} activity={activity} />);

    const region = screen.getByRole("region", { name: /agent status/i });
    expect(within(region).getByRole("heading", { name: /Plato/i })).toBeInTheDocument();
    expect(within(region).getByText("Default configuration").parentElement)
      .toHaveTextContent("openai/gpt-5.6-sol");
    expect(within(region).getByText("Default configuration").parentElement)
      .toHaveTextContent("medium");
    expect(within(region).getByText("Latest TD").parentElement)
      .toHaveTextContent("high");
    expect(within(region).getByText("Latest TD").parentElement)
      .toHaveTextContent("Running");
    expect(within(region).getAllByText("Override").length).toBeGreaterThan(0);

    const disclosure = within(region).getByText(/Telegram groups · 1/i)
      .closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure).not.toHaveAttribute("open");
    fireEvent.click(within(disclosure as HTMLElement).getByText(/Telegram groups/i));
    expect(disclosure).toHaveAttribute("open");
    expect(within(disclosure as HTMLElement).getByText("Multi Agents"))
      .toBeInTheDocument();
    expect(within(disclosure as HTMLElement).getByText("low"))
      .toBeInTheDocument();
    expect(within(disclosure as HTMLElement).getByText("Done"))
      .toBeInTheDocument();
    expect(within(disclosure as HTMLElement).getByRole("time"))
      .toHaveAttribute("datetime", "2026-09-10T21:50:00.000Z");
  });

  it("keeps configured Agents visible for older snapshots", () => {
    render(<AgentStatusDirectory agents={agents} />);

    const region = screen.getByRole("region", { name: /agent status/i });
    expect(within(region).getByText("openai/gpt-5.6-sol")).toBeInTheDocument();
    expect(within(region).getByText(/requires the next validated refresh/i))
      .toBeInTheDocument();
    expect(within(region).getByText(/No TD activity reported/i)).toBeInTheDocument();
  });
});
