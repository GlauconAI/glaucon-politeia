import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceRepositoryInventory } from "@/components/observatory/SourceRepositoryInventory";
import type { ObservatorySourceRepositoryInventory } from "@/lib/observatory/source-repository-schema";

const collectedAt = "2026-07-23T12:00:00.000Z";

const inventory: ObservatorySourceRepositoryInventory = {
  repositories: [
    {
      id: "repository:0123456789abcdef",
      name: "app",
      scope: "workspace",
      local_ref: "workspace/plato/app",
      maintainer_agent_id: "plato",
      knowledge_area: null,
      github: {
        owner: "GlauconAI",
        repo: "app",
        url: "https://github.com/GlauconAI/app",
      },
      current_branch: "main",
      detached: false,
      head: "a".repeat(40),
      default_branch: "main",
      last_commit_at: "2026-07-22T12:00:00.000Z",
      working_tree: "dirty",
      activity: "active",
      archive_state: "unknown",
      registry_project_keys: ["plato/dashboard"],
      authority: "observed",
      source: "local-git/workspace",
      collected_at: collectedAt,
      health: "healthy",
    },
    {
      id: "repository:fedcba9876543210",
      name: "tool",
      scope: "vault",
      local_ref: "vault/plato-academy/tool",
      maintainer_agent_id: null,
      knowledge_area: "plato-academy",
      github: null,
      current_branch: null,
      detached: true,
      head: "b".repeat(40),
      default_branch: null,
      last_commit_at: "2025-01-01T12:00:00.000Z",
      working_tree: "clean",
      activity: "stale",
      archive_state: "unknown",
      registry_project_keys: [],
      authority: "observed",
      source: "local-git/vault",
      collected_at: collectedAt,
      health: "degraded",
    },
  ],
  source_health: {
    status: "fresh",
    health: "healthy",
    collected_at: collectedAt,
    last_success_at: collectedAt,
    repository_count: 2,
    omitted_count: 0,
  },
};

describe("SourceRepositoryInventory", () => {
  it("shows aggregate facts and semantic repository metadata", () => {
    render(<SourceRepositoryInventory inventory={inventory} />);

    const region = screen.getByRole("region", {
      name: /source repositories/i,
    });
    expect(within(region).getByText("2 repositories")).toBeInTheDocument();
    expect(within(region).getByText("1 GitHub linked")).toBeInTheDocument();
    expect(within(region).getByText("1 dirty")).toBeInTheDocument();
    expect(within(region).getByText("1 stale")).toBeInTheDocument();
    expect(
      within(region).getByRole("link", { name: "GlauconAI/app" }),
    ).toHaveAttribute("href", "https://github.com/GlauconAI/app");
    expect(within(region).getByText("aaaaaaaaaaaa")).toBeInTheDocument();
    expect(
      within(region).getAllByText("Archive status unknown"),
    ).toHaveLength(2);
  });

  it("searches and filters with labelled native controls", () => {
    render(<SourceRepositoryInventory inventory={inventory} />);
    const region = screen.getByRole("region", {
      name: /source repositories/i,
    });

    fireEvent.change(
      within(region).getByRole("searchbox", {
        name: /search source repositories/i,
      }),
      { target: { value: "plato-academy" } },
    );
    expect(
      within(region).getByRole("heading", { name: "tool" }),
    ).toBeInTheDocument();
    expect(
      within(region).queryByRole("heading", { name: "app" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      within(region).getByRole("searchbox", {
        name: /search source repositories/i,
      }),
      { target: { value: "" } },
    );
    fireEvent.change(
      within(region).getByRole("combobox", { name: /repository scope/i }),
      { target: { value: "workspace" } },
    );
    fireEvent.change(
      within(region).getByRole("combobox", { name: /working tree/i }),
      { target: { value: "dirty" } },
    );
    fireEvent.change(
      within(region).getByRole("combobox", { name: /repository activity/i }),
      { target: { value: "active" } },
    );
    expect(
      within(region).getByRole("heading", { name: "app" }),
    ).toBeInTheDocument();
    expect(
      within(region).queryByRole("heading", { name: "tool" }),
    ).not.toBeInTheDocument();
  });

  it("renders bounded empty and failed-source states", () => {
    const { rerender } = render(
      <SourceRepositoryInventory
        inventory={{
          repositories: [],
          source_health: {
            status: "fresh",
            health: "healthy",
            collected_at: collectedAt,
            last_success_at: collectedAt,
            repository_count: 0,
            omitted_count: 0,
          },
        }}
      />,
    );
    expect(
      screen.getByText(/no source repositories discovered/i),
    ).toBeInTheDocument();

    rerender(
      <SourceRepositoryInventory
        inventory={{
          repositories: [],
          source_health: {
            status: "failed",
            health: "failed",
            collected_at: collectedAt,
            last_success_at: null,
            repository_count: 0,
            omitted_count: 0,
            error_code: "SOURCE_ROOT_UNAVAILABLE",
          },
        }}
      />,
    );
    expect(
      screen.getByText(/repository collection failed/i),
    ).toBeInTheDocument();
    expect(screen.getByText("SOURCE_ROOT_UNAVAILABLE")).toBeInTheDocument();
  });
});
