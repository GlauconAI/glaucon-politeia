import { act } from "@testing-library/react";
import type { ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProjectDirectory,
  type ProjectDirectoryFilters,
} from "@/components/observatory/ProjectDirectory";
import { SourceRepositoryInventory } from "@/components/observatory/SourceRepositoryInventory";
import type { DashboardProjectEntry } from "@/lib/observatory/dashboard-directory";
import type { ObservatorySourceRepositoryInventory } from "@/lib/observatory/source-repository-schema";

const originalTimeZone = process.env.TZ;
const boundaryInstant = "2026-07-23T04:30:00.000Z";

const filters: ProjectDirectoryFilters = {
  q: "",
  owner: "all",
  status: "all",
  scene: "all",
  repository: "all",
  sort: "recent",
};

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
    lastActivityAt: boundaryInstant,
  },
];

const inventory: ObservatorySourceRepositoryInventory = {
  repositories: [
    {
      id: "repository:0123456789abcdef",
      name: "glaucon-politeia",
      scope: "workspace",
      local_ref: "workspace/plato/projects/glaucon-politeia",
      maintainer_agent_id: "plato",
      knowledge_area: null,
      github: {
        owner: "GlauconAI",
        repo: "glaucon-politeia",
        url: "https://github.com/GlauconAI/glaucon-politeia",
      },
      current_branch: "main",
      detached: false,
      head: "a".repeat(40),
      default_branch: "main",
      last_commit_at: boundaryInstant,
      working_tree: "clean",
      activity: "active",
      archive_state: "active",
      registry_project_keys: ["plato/dashboard"],
      authority: "observed",
      source: "local-git/workspace",
      collected_at: boundaryInstant,
      health: "healthy",
    },
  ],
  source_health: {
    status: "fresh",
    health: "healthy",
    collected_at: boundaryInstant,
    last_success_at: boundaryInstant,
    repository_count: 1,
    omitted_count: 0,
  },
};

async function hydrationMessages(ui: ReactElement): Promise<string> {
  process.env.TZ = "UTC";
  const html = renderToString(ui);
  document.body.innerHTML = `<div id="hydration-root">${html}</div>`;
  process.env.TZ = "America/Vancouver";

  const messages: string[] = [];
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation((...args: unknown[]) => {
      messages.push(args.map(String).join(" "));
    });
  const container = document.getElementById("hydration-root");
  if (!container) throw new Error("Hydration root missing.");

  let root: Root | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, ui);
      await Promise.resolve();
    });
    return messages.join("\n");
  } finally {
    if (root) {
      await act(async () => root?.unmount());
    }
    consoleError.mockRestore();
  }
}

afterEach(() => {
  process.env.TZ = originalTimeZone;
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("Dashboard hydration", () => {
  it("hydrates source repository timestamps across server and browser time zones", async () => {
    const messages = await hydrationMessages(
      <SourceRepositoryInventory inventory={inventory} />,
    );

    expect(messages).not.toMatch(/hydration failed|didn't match/iu);
  });

  it("hydrates Project activity dates across server and browser time zones", async () => {
    const messages = await hydrationMessages(
      <ProjectDirectory projects={projects} initialFilters={filters} />,
    );

    expect(messages).not.toMatch(/hydration failed|didn't match/iu);
  });
});
