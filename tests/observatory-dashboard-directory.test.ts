import { describe, expect, it } from "vitest";

import {
  buildCronDirectory,
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
  it("builds a typed Cron directory from safe labels and tolerates legacy Snapshots", () => {
    const assets: ObservatoryAsset[] = [
      {
        id: "cron:job-1",
        kind: "cron",
        name: "Dashboard refresh",
        owner: "plato",
        authority: "observed",
        source: "openclaw/cron-list",
        collected_at: "2026-08-31T18:10:00.000Z",
        freshness: "fresh",
        health: "healthy",
        summary: "Cron · 0 18 * * *",
        labels: [
          { key: "schedule_type", value: "cron" },
          { key: "enabled", value: "enabled" },
          { key: "schedule_expression", value: "0 18 * * *" },
          { key: "timezone", value: "America/Vancouver" },
          { key: "last_status", value: "success" },
          { key: "last_run_at", value: "2026-08-31T18:00:00.000Z" },
          { key: "next_run_at", value: "2026-09-01T01:00:00.000Z" },
          { key: "consecutive_errors", value: "0" },
          { key: "runtime_target", value: "session-bound" },
        ],
      },
      {
        id: "cron:legacy-job",
        kind: "cron",
        name: "Legacy job",
        owner: "giskard",
        authority: "observed",
        source: "openclaw/cron-list",
        collected_at: "2026-08-30T18:10:00.000Z",
        freshness: "stale",
        health: "disabled",
        summary: "Every 15 minutes",
        labels: [
          { key: "schedule", value: "every" },
          { key: "last_status", value: "unknown" },
        ],
      },
      skill("skill:plato:weather", "weather", "plato", "healthy"),
    ];

    expect(buildCronDirectory(assets)).toEqual([
      {
        assetId: "cron:job-1",
        id: "job-1",
        name: "Dashboard refresh",
        owner: "plato",
        enabled: true,
        health: "healthy",
        freshness: "fresh",
        collectedAt: "2026-08-31T18:10:00.000Z",
        scheduleType: "cron",
        scheduleValue: "0 18 * * *",
        scheduleSummary: "Cron · 0 18 * * *",
        timezone: "America/Vancouver",
        lastStatus: "success",
        lastRunAt: "2026-08-31T18:00:00.000Z",
        nextRunAt: "2026-09-01T01:00:00.000Z",
        consecutiveErrors: 0,
        runtimeTarget: "session-bound",
      },
      {
        assetId: "cron:legacy-job",
        id: "legacy-job",
        name: "Legacy job",
        owner: "giskard",
        enabled: false,
        health: "disabled",
        freshness: "stale",
        collectedAt: "2026-08-30T18:10:00.000Z",
        scheduleType: "every",
        scheduleValue: null,
        scheduleSummary: "Every 15 minutes",
        timezone: null,
        lastStatus: null,
        lastRunAt: null,
        nextRunAt: null,
        consecutiveErrors: null,
        runtimeTarget: "unknown",
      },
    ]);
  });

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
      category: "agent-scoped-custom",
      hasAgentOverride: false,
    });
    expect(result[1]).toMatchObject({
      name: "Weather",
      description: "Weather forecasts.",
      health: "degraded",
      owners: ["giskard", "plato"],
      sources: ["openclaw-bundled", "openclaw-workspace"],
      agentCount: 2,
      instanceCount: 2,
      category: "openclaw-built-in",
      hasAgentOverride: true,
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

  it("derives the four user-facing Skill categories from source and visibility", () => {
    const categoryAssets = [
      skill("skill:a:weather", "weather", "a", "healthy", [
        { key: "install_source", value: "openclaw-bundled" },
      ]),
      skill("skill:b:weather", "weather", "b", "healthy", [
        { key: "install_source", value: "openclaw-workspace" },
      ]),
      skill("skill:a:agent-browser", "agent-browser", "a", "healthy", [
        { key: "install_source", value: "agents-skills-personal" },
      ]),
      skill("skill:b:agent-browser", "agent-browser", "b", "healthy", [
        { key: "install_source", value: "agents-skills-personal" },
      ]),
      skill("skill:a:shared", "shared", "a", "healthy", [
        { key: "install_source", value: "openclaw-managed" },
      ]),
      skill("skill:b:shared", "shared", "b", "healthy", [
        { key: "install_source", value: "openclaw-extra" },
      ]),
      skill("skill:a:private", "private", "a", "healthy", [
        { key: "install_source", value: "openclaw-workspace" },
      ]),
      skill("skill:a:future", "future", "a", "healthy", [
        { key: "install_source", value: "future-source" },
      ]),
    ];

    expect(
      Object.fromEntries(
        buildSkillDirectory(categoryAssets).map((entry) => [
          entry.name,
          {
            category: entry.category,
            hasAgentOverride: entry.hasAgentOverride,
          },
        ]),
      ),
    ).toEqual({
      "agent-browser": {
        category: "system-web",
        hasAgentOverride: false,
      },
      future: {
        category: "agent-scoped-custom",
        hasAgentOverride: false,
      },
      private: {
        category: "agent-scoped-custom",
        hasAgentOverride: false,
      },
      shared: {
        category: "shared-custom",
        hasAgentOverride: false,
      },
      weather: {
        category: "openclaw-built-in",
        hasAgentOverride: true,
      },
    });
  });
});
