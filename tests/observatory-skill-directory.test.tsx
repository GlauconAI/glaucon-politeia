import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SkillDirectory,
  type SkillDirectoryFilters,
} from "@/components/observatory/SkillDirectory";
import type { DashboardSkillEntry } from "@/lib/observatory/dashboard-directory";

const skills: DashboardSkillEntry[] = [
  {
    key: "weather",
    name: "weather",
    description: "Weather forecasts.",
    health: "degraded",
    owners: ["giskard", "plato"],
    sources: ["openclaw-bundled", "openclaw-workspace"],
    versions: [],
    agentCount: 2,
    instanceCount: 2,
    scope: "shared",
    instances: [
      {
        id: "skill:giskard:weather",
        owner: "giskard",
        health: "degraded",
        source: "openclaw-bundled",
        version: null,
        summary: "Requirements missing",
      },
      {
        id: "skill:plato:weather",
        owner: "plato",
        health: "healthy",
        source: "openclaw-workspace",
        version: null,
        summary: "Ready",
      },
    ],
  },
  {
    key: "402v-html-workflow",
    name: "402v-html-workflow",
    description: "Create 402v HTML notes.",
    health: "healthy",
    owners: ["plato"],
    sources: ["openclaw-workspace"],
    versions: ["1.0.0"],
    agentCount: 1,
    instanceCount: 1,
    scope: "private",
    instances: [
      {
        id: "skill:plato:402v-html-workflow",
        owner: "plato",
        health: "healthy",
        source: "openclaw-workspace",
        version: "1.0.0",
        summary: "Ready",
      },
    ],
  },
];

const defaults: SkillDirectoryFilters = {
  q: "",
  scope: "all",
  health: "all",
  agent: "all",
  source: "all",
  sort: "name",
};

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("SkillDirectory", () => {
  it("styles expandable Agent instances without introducing nested page overflow", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(
      /\.dashboard-skill-list\s+details\s*\{[^}]*border-top:/u,
    );
    expect(css).toMatch(
      /\.dashboard-skill-list\s+details\s+ul\s*\{[^}]*list-style:\s*none/u,
    );
  });

  it("shows unique Skill and Agent-Skill instance counts", () => {
    render(<SkillDirectory skills={skills} initialFilters={defaults} />);

    expect(screen.getByText("2 unique Skills")).toBeInTheDocument();
    expect(screen.getByText("3 Agent-Skill instances")).toBeInTheDocument();
    expect(screen.getByText("2 shown")).toBeInTheDocument();
  });

  it("searches and persists URL state", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<SkillDirectory skills={skills} initialFilters={defaults} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search skills/i }),
      { target: { value: "HTML" } },
    );

    const results = screen.getByRole("list", {
      name: /skill directory results/i,
    });
    expect(
      within(results).getByRole("heading", { name: "402v-html-workflow" }),
    ).toBeInTheDocument();
    expect(within(results).queryByRole("heading", { name: "weather" }))
      .not.toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/dashboard/skills?q=HTML",
    );
  });

  it("filters by scope, health, Agent, and source", () => {
    render(<SkillDirectory skills={skills} initialFilters={defaults} />);

    fireEvent.change(screen.getByRole("combobox", { name: /skill scope/i }), {
      target: { value: "shared" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /skill health/i }), {
      target: { value: "degraded" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /visible to Agent/i }), {
      target: { value: "giskard" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /skill source/i }), {
      target: { value: "openclaw-bundled" },
    });

    expect(screen.getByRole("heading", { name: "weather" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "402v-html-workflow" }))
      .not.toBeInTheDocument();
  });

  it("sorts by Agent count and exposes expandable instances", () => {
    render(
      <SkillDirectory
        skills={skills}
        initialFilters={{ ...defaults, sort: "agents" }}
      />,
    );

    const headings = within(
      screen.getByRole("list", { name: /skill directory results/i }),
    ).getAllByRole("heading");
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "weather",
      "402v-html-workflow",
    ]);
    expect(screen.getByText(/2 Agents · 2 instances/i)).toBeInTheDocument();
    expect(screen.getAllByText(/view Agent instances/i)).toHaveLength(2);
  });
});
import { readFileSync } from "node:fs";
import { join } from "node:path";
