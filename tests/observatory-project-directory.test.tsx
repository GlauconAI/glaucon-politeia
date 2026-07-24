import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProjectDirectory,
  type ProjectDirectoryFilters,
} from "@/components/observatory/ProjectDirectory";
import type { DashboardProjectEntry } from "@/lib/observatory/dashboard-directory";

const projects: DashboardProjectEntry[] = [
  {
    projectKey: "plato/dashboard",
    name: "dashboard",
    title: "Dashboard",
    owner: "Plato",
    focus: "Product delivery",
    status: "active",
    description: "Operational system view.",
    sceneIds: ["S13"],
    repositories: ["glaucon-politeia"],
    lastActivityAt: "2026-07-24T18:00:00.000Z",
  },
  {
    projectKey: "aristotle/wiki",
    name: "wiki",
    title: "LLM Wiki",
    owner: "Aristotle",
    focus: "Knowledge",
    status: "planned",
    description: "Durable knowledge system.",
    sceneIds: ["S08"],
    repositories: [],
    lastActivityAt: null,
  },
  {
    projectKey: "plato/archive",
    name: "archive",
    title: "Archive",
    owner: "Plato",
    focus: "Publishing",
    status: "active",
    description: "Published notes.",
    sceneIds: ["S08"],
    repositories: ["archive-site"],
    lastActivityAt: "2026-07-20T18:00:00.000Z",
  },
];

const defaults: ProjectDirectoryFilters = {
  q: "",
  owner: "all",
  status: "all",
  scene: "all",
  repository: "all",
  sort: "recent",
};

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("ProjectDirectory", () => {
  it("uses responsive, dense directory grids", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(css).toMatch(
      /\.dashboard-directory-controls\s*\{[^}]*display:\s*grid/u,
    );
    expect(css).toMatch(
      /\.dashboard-directory-list\s*\{[^}]*grid-template-columns:/u,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*\.dashboard-directory-list[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
    );
  });

  it("searches projects and persists non-default filters in the URL", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(<ProjectDirectory projects={projects} initialFilters={defaults} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search projects/i }),
      { target: { value: "wiki" } },
    );

    const results = screen.getByRole("list", {
      name: /project directory results/i,
    });
    expect(within(results).getByRole("heading", { name: "LLM Wiki" }))
      .toBeInTheDocument();
    expect(within(results).queryByRole("heading", { name: "Dashboard" }))
      .not.toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/dashboard/projects?q=wiki",
    );
  });

  it("filters by owner, status, scene, and repository linkage", () => {
    render(<ProjectDirectory projects={projects} initialFilters={defaults} />);

    fireEvent.change(screen.getByRole("combobox", { name: /project owner/i }), {
      target: { value: "Plato" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /project status/i }), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /project scene/i }), {
      target: { value: "S08" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: /repository linkage/i }),
      { target: { value: "linked" } },
    );

    const results = screen.getByRole("list", {
      name: /project directory results/i,
    });
    expect(within(results).getByRole("heading", { name: "Archive" }))
      .toBeInTheDocument();
    expect(within(results).queryByRole("heading", { name: "Dashboard" }))
      .not.toBeInTheDocument();
    expect(within(results).queryByRole("heading", { name: "LLM Wiki" }))
      .not.toBeInTheDocument();
  });

  it("sorts by recent activity and exposes the total and shown counts", () => {
    render(<ProjectDirectory projects={projects} initialFilters={defaults} />);

    expect(screen.getByText("3 projects")).toBeInTheDocument();
    expect(screen.getByText("3 shown")).toBeInTheDocument();
    const headings = within(
      screen.getByRole("list", { name: /project directory results/i }),
    ).getAllByRole("heading");
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Dashboard",
      "Archive",
      "LLM Wiki",
    ]);
  });

  it("honors URL-derived initial filters and renders a useful empty result", () => {
    render(
      <ProjectDirectory
        projects={projects}
        initialFilters={{ ...defaults, q: "missing" }}
      />,
    );

    expect(screen.getByText(/no projects match/i)).toBeInTheDocument();
  });
});
import { readFileSync } from "node:fs";
import { join } from "node:path";
