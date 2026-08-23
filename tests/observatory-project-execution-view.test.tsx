import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectExecutionPortfolio } from "@/components/observatory/ProjectExecutionPortfolio";
import {
  buildProjectExecutionDirectory,
} from "@/lib/observatory/dashboard-directory";
import type { ObservatoryRegistrySnapshot } from "@/lib/observatory/schema";
import type { ProjectExecutionSnapshot } from "@/lib/observatory/project-execution-schema";
import { projectExecutionFixture } from "./observatory-project-execution-schema.test";

const registry = {
  project_groups: [
    {
      owner: "Plato",
      focus: "Product delivery",
      projects: [
        {
          project_key: "plato/dashboard",
          name: "dashboard",
          title: "Dashboard",
          status: "active",
          description: "Operational system view.",
          scene_ids: ["S13"],
        },
        {
          project_key: "plato/catalog-only",
          name: "catalog-only",
          title: "Catalog only",
          status: "planned",
          description: "No runtime record.",
          scene_ids: [],
        },
      ],
    },
  ],
} as ObservatoryRegistrySnapshot;

function runtimeSnapshot() {
  const snapshot: ProjectExecutionSnapshot = projectExecutionFixture();
  snapshot.projects.push({
    ...snapshot.projects[0],
    project: {
      ...snapshot.projects[0].project,
      project_key: "runtime/only",
      title: "Runtime only",
      freshness: "stale",
    },
    execution_lines: [],
    summary: {
      execution_line_count: 0,
      active_count: 0,
      waiting_count: 0,
      blocked_count: 0,
      completed_count: 0,
      independent_owner_line_count: 0,
    },
  });
  snapshot.summary.project_count = 2;
  return snapshot;
}

describe("Project execution directory", () => {
  it("joins stable Project keys and keeps both unmatched sides visible", () => {
    const entries = buildProjectExecutionDirectory(registry, runtimeSnapshot());

    expect(entries.map((entry) => [entry.projectKey, entry.match])).toEqual([
      ["plato/dashboard", "matched"],
      ["plato/catalog-only", "catalog_only"],
      ["runtime/only", "runtime_only"],
    ]);
    expect(entries[0].executionLines).toHaveLength(2);
    expect(entries[1].executionLines).toEqual([]);
  });
});

describe("ProjectExecutionPortfolio", () => {
  it("renders portfolio counts, Project cards, dependencies, and exact transfer semantics", () => {
    render(
      <ProjectExecutionPortfolio
        projects={buildProjectExecutionDirectory(registry, runtimeSnapshot())}
        sourceAvailable
        sourceStatus="fresh"
        collectedAt="2026-08-23T20:00:00Z"
      />,
    );

    expect(screen.getByRole("heading", { name: /project execution/i })).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /project execution filters/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 active Project")).toBeInTheDocument();
    expect(screen.getByText("1 active Agent line")).toBeInTheDocument();
    expect(screen.getByText("1 independent Owner line")).toBeInTheDocument();
    expect(screen.getAllByText("Returns to PM")).toHaveLength(2);
    expect(screen.getAllByText("User + Owner line")).toHaveLength(2);
    expect(screen.getByText("PM no longer waiting")).toBeInTheDocument();
    expect(screen.getByText(/depends on dashboard/i)).toBeInTheDocument();
    expect(screen.getByText("Catalog only — runtime unmatched")).toBeInTheDocument();
    expect(screen.getByText("Runtime only — catalog unmatched")).toBeInTheDocument();
  });

  it("filters lanes by Project, owner, status, transfer mode, and freshness", () => {
    render(
      <ProjectExecutionPortfolio
        projects={buildProjectExecutionDirectory(registry, runtimeSnapshot())}
        sourceAvailable
        sourceStatus="stale"
        collectedAt="2026-08-23T20:00:00Z"
      />,
    );

    expect(screen.getByText("Stale source")).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: /execution owner/i }),
      { target: { value: "aristotle" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: /transfer mode/i }),
      { target: { value: "independent_owner_line" } },
    );

    const results = screen.getByRole("list", { name: /project execution results/i });
    expect(within(results).getByText("Independent research")).toBeInTheDocument();
    expect(within(results).queryByText("Build Dashboard")).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: /execution freshness/i }),
      { target: { value: "stale" } },
    );
    expect(screen.getByText(/no execution lines match/i)).toBeInTheDocument();
  });

  it("distinguishes unavailable and valid-empty runtime sources", () => {
    const { rerender } = render(
      <ProjectExecutionPortfolio
        projects={[]}
        sourceAvailable={false}
        sourceStatus="unknown"
        collectedAt={null}
      />,
    );
    expect(screen.getByText(/project execution data unavailable/i)).toBeInTheDocument();

    rerender(
      <ProjectExecutionPortfolio
        projects={[]}
        sourceAvailable
        sourceStatus="fresh"
        collectedAt="2026-08-23T20:00:00Z"
      />,
    );
    expect(screen.getByText(/no project execution lines published yet/i)).toBeInTheDocument();
  });

  it("uses stacked 390px lane cards without a horizontal dependency canvas", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.project-execution-lanes\s*\{[^}]*display:\s*grid/u);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*520px\)[\s\S]*\.project-execution-grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
    );
    expect(css).not.toMatch(/project-execution[^}]*overflow-x:\s*auto/u);
  });
});
