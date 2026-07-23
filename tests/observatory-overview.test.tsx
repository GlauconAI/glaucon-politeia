import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ObservatoryOverview,
  type ObservatoryOverviewState,
} from "@/components/observatory/ObservatoryOverview";
import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";
import { projectDashboardGovernance } from "@/lib/observatory/governance-markdown";

const snapshot: ObservatoryCollectionEnvelope = {
  schema_version: "1.0.0",
  status: "success",
  generated_at: "2026-07-21T23:00:00.000Z",
  source_digest: "a".repeat(64),
  collector_version: "1.0.0",
  registry: {
    schema_version: "1.0.0",
    registry_schema_version: "2.0.0",
    registry_version: "fixture-2026-07-21.v2",
    source: {
      logical_reference:
        "shared/projects/openclaw-orchestration-control/orchestration-system-design.html#orchestration-registry",
      authority: "canonical",
      owner: "Socrates",
      collected_at: "2026-07-21T22:45:00.000Z",
      freshness: "fresh",
      digest: "a".repeat(64),
    },
    summary: {
      project_count: 2,
      primary_scene_count: 2,
      secondary_scene_count: 3,
      execution_flow_count: 2,
    },
    project_groups: [
      {
        owner: "Socrates",
        focus: "System governance",
        projects: [
          {
            project_key: "socrates/governance",
            name: "governance",
            title: "Governance",
            status: "active",
            description: "Maintain governance baselines.",
            scene_ids: ["S01"],
          },
        ],
      },
      {
        owner: "Plato",
        focus: "Product delivery",
        projects: [
          {
            project_key: "plato/observatory",
            name: "observatory",
            title: "OpenClaw Observatory",
            status: "building",
            description: "Make the operating system legible.",
            scene_ids: ["S13"],
          },
        ],
      },
    ],
    scenes: [
      {
        id: "S01",
        name: "Product strategy",
        flow: "Deep Task Flow",
        description: "Define product boundaries.",
        recommended_stage_owner: "main",
      },
      {
        id: "S13",
        name: "Software delivery",
        flow: "Build Flow",
        description: "Ship verified product slices.",
        recommended_stage_owner: "Codex",
      },
    ],
    execution_flows: [
      {
        id: "fast",
        name: "Fast Flow",
        tier_label: "Executor direct",
        use_when: "The task is bounded.",
        controller: "The executor controls the task.",
        subagent_structure: "No subagent is required.",
        core_output: "One artifact.",
        topology: "executor_direct",
        team_allowed: false,
        completion_requirements: ["artifact", "verification"],
      },
      {
        id: "build",
        name: "Build Flow",
        tier_label: "Plan and implement",
        use_when: "A feature needs implementation.",
        controller: "A lead controls the plan.",
        subagent_structure: "One implementer.",
        core_output: "A tested change.",
        topology: "lead_executor",
        team_allowed: true,
        completion_requirements: ["tests", "review"],
      },
    ],
  },
  agents: [
    {
      id: "plato",
      display_name: "Plato",
      emoji: "🏛️",
      model_label: "gpt-5",
      workspace_label: "plato",
      binding_count: 2,
      default: true,
    },
    {
      id: "socrates",
      display_name: "Socrates",
      emoji: "🦉",
      model_label: "gpt-5",
      workspace_label: "socrates",
      binding_count: 1,
      default: false,
    },
  ],
  runtime: {
    runtime_version: "2026.7.1",
    gateway_running: true,
    gateway_reachable: true,
    configured_agent_count: 2,
    task_totals: {
      total: 12,
      active: 2,
      queued: 1,
      completed: 8,
      failed: 1,
    },
  },
  summary: {
    freshness: "fresh",
    project_count: 2,
    primary_scene_count: 2,
    secondary_scene_count: 3,
    execution_flow_count: 2,
    agent_count: 2,
    binding_count: 3,
    configured_agent_count: 2,
    gateway_running: true,
    gateway_reachable: true,
    task_totals: {
      total: 12,
      active: 2,
      queued: 1,
      completed: 8,
      failed: 1,
    },
  },
};

const governanceFixtureRoot = join(
  process.cwd(),
  "tests/fixtures/observatory-governance",
);
const governance = projectDashboardGovernance(
  {
    readme: readFileSync(join(governanceFixtureRoot, "README.md"), "utf8"),
    baseline: readFileSync(
      join(governanceFixtureRoot, "development-baseline.md"),
      "utf8",
    ),
    tracker: readFileSync(join(governanceFixtureRoot, "edad-tracker.md"), "utf8"),
    calibration: readFileSync(
      join(governanceFixtureRoot, "estimate-calibration.md"),
      "utf8",
    ),
  },
  { collectedAt: "2026-07-23T04:30:00.000Z" },
);

function readyState(
  value: ObservatoryCollectionEnvelope = snapshot,
): ObservatoryOverviewState {
  return { status: "ready", snapshot: value };
}

describe("ObservatoryOverview", () => {
  it("shows a bounded compatibility notice before the first v3 refresh", () => {
    render(<ObservatoryOverview state={readyState()} />);

    expect(
      screen.getByRole("region", { name: /delivery governance status/i }),
    ).toHaveTextContent(/not yet available/i);
  });

  it("mounts the Project Cockpit when a validated v3 model is present", () => {
    const v3 = {
      ...snapshot,
      schema_version: "3.0.0",
      collector_version: "3.0.0",
      delivery_governance: governance,
    } as unknown as ObservatoryCollectionEnvelope;
    render(<ObservatoryOverview state={readyState(v3)} />);

    expect(
      screen.getByRole("region", { name: /project cockpit/i }),
    ).toBeInTheDocument();
  });

  it("renders operational summary cards from the validated snapshot", () => {
    render(<ObservatoryOverview state={readyState()} />);

    const summary = screen.getByRole("region", { name: /system summary/i });
    expect(within(summary).getByText("Projects").parentElement).toHaveTextContent(
      "2",
    );
    expect(
      within(summary).getByText("Primary scenes").parentElement,
    ).toHaveTextContent("2");
    expect(
      within(summary).getByText("Secondary scenes").parentElement,
    ).toHaveTextContent("3");
    expect(within(summary).getByText("Agents").parentElement).toHaveTextContent(
      "2",
    );
    expect(
      within(summary).getByText("Active tasks").parentElement,
    ).toHaveTextContent("2");
    expect(within(summary).getByText("Gateway").parentElement).toHaveTextContent(
      "Online",
    );
  });

  it("shows canonical source provenance and freshness", () => {
    render(<ObservatoryOverview state={readyState()} />);

    const source = screen.getByRole("region", { name: /snapshot source/i });
    expect(within(source).getByText("Fresh")).toBeInTheDocument();
    expect(within(source).getByText(/Socrates/)).toBeInTheDocument();
    expect(within(source).getByText(/fixture-2026-07-21.v2/)).toBeInTheDocument();
    expect(
      within(source).getByText(/orchestration-system-design\.html/),
    ).toBeInTheDocument();
    expect(within(source).getByText("aaaaaaaaaaaa…")).toHaveAttribute(
      "title",
      "a".repeat(64),
    );
    expect(
      within(source)
        .getByText(/collected/i)
        .closest("div")
        ?.querySelector("time"),
    ).toHaveAttribute("datetime", "2026-07-21T22:45:00.000Z");
  });

  it("makes a stale source visually and semantically explicit", () => {
    const staleSnapshot: ObservatoryCollectionEnvelope = {
      ...snapshot,
      registry: {
        ...snapshot.registry,
        source: { ...snapshot.registry.source, freshness: "stale" },
      },
      summary: { ...snapshot.summary, freshness: "stale" },
    };

    render(<ObservatoryOverview state={readyState(staleSnapshot)} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/stale/i);
    expect(screen.getByRole("region", { name: /snapshot source/i })).toHaveAttribute(
      "data-status",
      "stale",
    );
  });

  it("makes unknown source freshness visually and semantically explicit", () => {
    const unknownSnapshot: ObservatoryCollectionEnvelope = {
      ...snapshot,
      registry: {
        ...snapshot.registry,
        source: { ...snapshot.registry.source, freshness: "unknown" },
      },
      summary: { ...snapshot.summary, freshness: "unknown" },
    };

    render(<ObservatoryOverview state={readyState(unknownSnapshot)} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /freshness is unknown/i,
    );
    expect(
      screen.getByRole("region", { name: /snapshot source/i }),
    ).toHaveAttribute("data-status", "unknown");
  });

  it.each([
    [
      { status: "empty" } as const,
      /no snapshot has been published yet/i,
      "missing",
    ],
    [
      {
        status: "error",
        message: "The latest snapshot could not be loaded.",
      } as const,
      /could not be loaded/i,
      "failed",
    ],
  ])("renders a useful %s state", (state, message, dataStatus) => {
    render(<ObservatoryOverview state={state} />);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("region", { name: /snapshot source/i })).toHaveAttribute(
      "data-status",
      dataStatus,
    );
    expect(screen.getByText(/quick capture remains available/i)).toBeInTheDocument();
  });

  it("searches projects, scenes, agents, and execution flows with a labelled native input", () => {
    render(<ObservatoryOverview state={readyState()} />);

    const search = screen.getByRole("searchbox", {
      name: /search projects, scenes, agents, and flows/i,
    });
    fireEvent.change(search, { target: { value: "Observatory" } });

    expect(screen.getByText("OpenClaw Observatory")).toBeInTheDocument();
    expect(screen.queryByText("Governance")).not.toBeInTheDocument();
    expect(screen.queryByText("Product strategy")).not.toBeInTheDocument();
    expect(screen.queryByText("Fast Flow")).not.toBeInTheDocument();
    expect(screen.queryByText("Socrates", { selector: "h4" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/no matching/i)).toHaveLength(3);
  });

  it("includes flow core output in object search", () => {
    render(<ObservatoryOverview state={readyState()} />);

    fireEvent.change(
      screen.getByRole("searchbox", {
        name: /search projects, scenes, agents, and flows/i,
      }),
      { target: { value: "One artifact" } },
    );

    expect(screen.getByText("Fast Flow")).toBeInTheDocument();
    expect(
      screen.queryByText("Build Flow", { selector: "h4" }),
    ).not.toBeInTheDocument();
  });

  it("uses semantic document-flow lists without clipped nested scrolling", () => {
    render(<ObservatoryOverview state={readyState()} />);

    const projects = screen.getByRole("region", { name: "Projects" });
    expect(within(projects).getByRole("list").tagName).toBe("UL");
    expect(within(projects).getAllByRole("listitem")).toHaveLength(2);

    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).not.toMatch(
      /\.observatory-object-list\s*\{[^}]*(?:max-height|overflow\s*:)/u,
    );
  });

  it("marks schema-valid long object text and badges for responsive wrapping", () => {
    const longTitle = "t".repeat(4096);
    const longStatus = "s".repeat(4096);
    const longSnapshot: ObservatoryCollectionEnvelope = {
      ...snapshot,
      registry: {
        ...snapshot.registry,
        project_groups: snapshot.registry.project_groups.map((group, index) =>
          index === 0
            ? {
                ...group,
                projects: group.projects.map((project) => ({
                  ...project,
                  title: longTitle,
                  status: longStatus,
                })),
              }
            : group,
        ),
      },
    };

    render(<ObservatoryOverview state={readyState(longSnapshot)} />);

    expect(screen.getByText(longTitle)).toHaveClass("observatory-wrap");
    expect(screen.getByText(longStatus)).toHaveClass(
      "observatory-wrap",
      "observatory-object-badge",
    );

    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(
      /\.observatory-wrap\s*\{[^}]*overflow-wrap:\s*anywhere/u,
    );
    expect(css).toMatch(
      /\.observatory-object-badge\s*\{[^}]*max-width:/u,
    );
  });
});
