import { describe, expect, it } from "vitest";

import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import type { ObservatoryRegistrySnapshot } from "@/lib/observatory/schema";
import {
  buildWorkTrackerProjectOptions,
  matchesWorkTrackerProject,
  resolveWorkItemProject,
} from "@/lib/observatory/work-tracker-projects";

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
      ],
    },
    {
      owner: "Shared",
      focus: "Cross-Agent delivery",
      projects: [
        {
          project_key: "shared/wenya-ai",
          name: "wenya-ai",
          title: "问芽 AI",
          status: "active",
          description: "AI-native education.",
          scene_ids: ["S36"],
        },
      ],
    },
  ],
} as ObservatoryRegistrySnapshot;

const projects = buildWorkTrackerProjectOptions(registry);

function item(
  input: Pick<ObservatoryWorkItemRow, "project_ref" | "project_key">,
) {
  return input;
}

describe("Work Tracker canonical Projects", () => {
  it("builds stable, title-sorted options from the canonical registry", () => {
    expect(projects).toEqual([
      {
        projectKey: "plato/dashboard",
        title: "Dashboard",
        owner: "Plato",
        status: "active",
      },
      {
        projectKey: "shared/wenya-ai",
        title: "问芽 AI",
        owner: "Shared",
        status: "active",
      },
    ]);
  });

  it("resolves canonical keys, legacy titles, and formal bindings", () => {
    expect(
      resolveWorkItemProject(
        item({ project_ref: "plato/dashboard", project_key: null }),
        projects,
      )?.projectKey,
    ).toBe("plato/dashboard");
    expect(
      resolveWorkItemProject(
        item({ project_ref: "Dashboard", project_key: null }),
        projects,
      )?.projectKey,
    ).toBe("plato/dashboard");
    expect(
      resolveWorkItemProject(
        item({
          project_ref: "plato/dashboard",
          project_key: "shared/wenya-ai",
        }),
        projects,
      )?.projectKey,
    ).toBe("shared/wenya-ai");
  });

  it("does not invent a Project for unknown or missing references", () => {
    expect(
      resolveWorkItemProject(
        item({ project_ref: "unknown/project", project_key: null }),
        projects,
      ),
    ).toBeNull();
    expect(
      resolveWorkItemProject(
        item({ project_ref: null, project_key: null }),
        projects,
      ),
    ).toBeNull();
  });

  it("searches title, key, owner, and status without case sensitivity", () => {
    const dashboard = projects[0]!;
    const wenya = projects[1]!;

    expect(matchesWorkTrackerProject(dashboard, "DASHBOARD")).toBe(true);
    expect(matchesWorkTrackerProject(dashboard, "plato/")).toBe(true);
    expect(matchesWorkTrackerProject(wenya, "问芽")).toBe(true);
    expect(matchesWorkTrackerProject(wenya, "shared")).toBe(true);
    expect(matchesWorkTrackerProject(wenya, "missing")).toBe(false);
  });
});
