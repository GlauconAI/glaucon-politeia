import { describe, expect, it } from "vitest";

import {
  buildProjectDirectory,
  buildSkillDirectory,
} from "@/lib/observatory/dashboard-directory";
import type { ObservatoryAsset } from "@/lib/observatory/asset-schema";
import type { ObservatoryRegistrySnapshot } from "@/lib/observatory/schema";
import type { ObservatorySourceRepository } from "@/lib/observatory/source-repository-schema";

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
          project_key: "plato/wiki",
          name: "wiki",
          title: null,
          status: "planned",
          description: "Knowledge system.",
          scene_ids: ["S08", "S13"],
        },
      ],
    },
  ],
} as ObservatoryRegistrySnapshot;

const repositories: ObservatorySourceRepository[] = [
  {
    id: "repository:1111111111111111",
    name: "glaucon-politeia",
    scope: "workspace",
    local_ref: "workspace/plato/glaucon-politeia",
    maintainer_agent_id: "plato",
    knowledge_area: null,
    github: null,
    current_branch: "main",
    detached: false,
    head: "1".repeat(40),
    default_branch: "main",
    last_commit_at: "2026-07-24T18:00:00.000Z",
    working_tree: "clean",
    activity: "active",
    archive_state: "active",
    registry_project_keys: ["plato/dashboard"],
    authority: "observed",
    source: "local-git/workspace",
    collected_at: "2026-07-24T18:10:00.000Z",
    health: "healthy",
  },
  {
    id: "repository:2222222222222222",
    name: "dashboard-docs",
    scope: "vault",
    local_ref: "vault/plato-academy/dashboard-docs",
    maintainer_agent_id: null,
    knowledge_area: "plato-academy",
    github: null,
    current_branch: "main",
    detached: false,
    head: "2".repeat(40),
    default_branch: "main",
    last_commit_at: "2026-07-23T18:00:00.000Z",
    working_tree: "clean",
    activity: "active",
    archive_state: "active",
    registry_project_keys: ["plato/dashboard"],
    authority: "observed",
    source: "local-git/vault",
    collected_at: "2026-07-24T18:10:00.000Z",
    health: "healthy",
  },
];

function skill(
  id: string,
  name: string,
  owner: string,
  health: ObservatoryAsset["health"],
  labels: ObservatoryAsset["labels"] = [],
): ObservatoryAsset {
  return {
    id,
    kind: "skill",
    name,
    owner,
    authority: "observed",
    source: "openclaw/skills-list",
    collected_at: "2026-07-24T18:10:00.000Z",
    freshness: "fresh",
    health,
    summary: health === "healthy" ? "Ready" : "Requirements missing",
    labels,
  };
}

describe("Dashboard directory view models", () => {
  it("flattens projects and attaches exact repository matches with latest activity", () => {
    expect(buildProjectDirectory(registry, repositories)).toEqual([
      {
        projectKey: "plato/dashboard",
        name: "dashboard",
        title: "Dashboard",
        owner: "Plato",
        focus: "Product delivery",
        status: "active",
        description: "Operational system view.",
        sceneIds: ["S13"],
        repositories: ["dashboard-docs", "glaucon-politeia"],
        lastActivityAt: "2026-07-24T18:00:00.000Z",
      },
      {
        projectKey: "plato/wiki",
        name: "wiki",
        title: "wiki",
        owner: "Plato",
        focus: "Product delivery",
        status: "planned",
        description: "Knowledge system.",
        sceneIds: ["S08", "S13"],
        repositories: [],
        lastActivityAt: null,
      },
    ]);
  });

  it("groups Skill instances by normalized name and preserves instance details", () => {
    const result = buildSkillDirectory([
      skill("skill:plato:weather", "Weather", "plato", "healthy", [
        { key: "eligibility", value: "ready" },
        { key: "description", value: "Weather forecasts." },
        { key: "install_source", value: "openclaw-workspace" },
      ]),
      skill("skill:giskard:weather", "weather", "giskard", "degraded", [
        { key: "eligibility", value: "missing" },
        { key: "description", value: "Weather forecasts." },
        { key: "install_source", value: "openclaw-bundled" },
      ]),
      skill("skill:plato:notes", "notes", "plato", "healthy"),
      {
        ...skill("tool:browser", "browser", "OpenClaw", "healthy"),
        kind: "tool",
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "notes",
      health: "healthy",
      owners: ["plato"],
      agentCount: 1,
      instanceCount: 1,
      scope: "private",
    });
    expect(result[1]).toMatchObject({
      name: "Weather",
      description: "Weather forecasts.",
      health: "degraded",
      owners: ["giskard", "plato"],
      sources: ["openclaw-bundled", "openclaw-workspace"],
      agentCount: 2,
      instanceCount: 2,
      scope: "shared",
    });
    expect(result[1].instances).toEqual([
      expect.objectContaining({
        id: "skill:giskard:weather",
        owner: "giskard",
        health: "degraded",
        source: "openclaw-bundled",
      }),
      expect.objectContaining({
        id: "skill:plato:weather",
        owner: "plato",
        health: "healthy",
        source: "openclaw-workspace",
      }),
    ]);
  });
});
