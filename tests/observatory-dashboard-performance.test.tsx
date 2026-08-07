import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ProjectDirectory,
  type ProjectDirectoryFilters,
} from "@/components/observatory/ProjectDirectory";
import {
  SkillDirectory,
  type SkillDirectoryFilters,
} from "@/components/observatory/SkillDirectory";
import { SystemInventory } from "@/components/observatory/SystemInventory";
import { SystemTopology } from "@/components/observatory/SystemTopology";
import type {
  DashboardProjectEntry,
  DashboardSkillEntry,
} from "@/lib/observatory/dashboard-directory";
import type {
  ObservatoryAsset,
  ObservatoryRelationship,
} from "@/lib/observatory/asset-schema";

const projectFilters: ProjectDirectoryFilters = {
  q: "",
  owner: "all",
  status: "all",
  scene: "all",
  repository: "all",
  sort: "recent",
};

const skillFilters: SkillDirectoryFilters = {
  q: "",
  category: "all",
  health: "all",
  agent: "all",
  source: "all",
  sort: "name",
};

function asset(index: number): ObservatoryAsset {
  return {
    id: `skill:agent-${index % 11}:skill-${index}`,
    kind: "skill",
    name: `skill-${index}`,
    owner: `agent-${index % 11}`,
    authority: "observed",
    source: "openclaw/skills-list",
    collected_at: "2026-07-24T20:00:00.000Z",
    freshness: "fresh",
    health: "healthy",
    summary: "Ready",
    labels: [],
  };
}

function relationship(index: number): ObservatoryRelationship {
  return {
    from: `agent:agent-${index % 11}`,
    to: `skill:agent-${index % 11}:skill-${index}`,
    kind: "exposes",
    authority: "observed",
    source: "openclaw/skills-list",
  };
}

function skill(index: number): DashboardSkillEntry {
  const instances = Array.from({ length: 11 }, (_, instanceIndex) => ({
    id: `skill:agent-${instanceIndex}:skill-${index}`,
    owner: `agent-${instanceIndex}`,
    health: "healthy" as const,
    source: "openclaw-managed",
    version: null,
    summary: "Ready",
  }));
  return {
    key: `skill-${index}`,
    name: `skill-${index}`,
    description: `Skill ${index} description`,
    health: "healthy",
    owners: instances.map((instance) => instance.owner),
    sources: ["openclaw-managed"],
    versions: [],
    agentCount: instances.length,
    instanceCount: instances.length,
    category: "shared-custom",
    hasAgentOverride: false,
    instances,
  };
}

function project(index: number): DashboardProjectEntry {
  return {
    projectKey: `plato/project-${index}`,
    name: `project-${index}`,
    title: `Project ${index}`,
    owner: "Plato",
    focus: "Product delivery",
    status: "active",
    description: `Project ${index} description`,
    sceneIds: ["S13"],
    repositories: [],
    lastActivityAt: null,
  };
}

describe("Dashboard initial render budgets", () => {
  it("keeps heavy Dashboard inventory and topology below 5,000 DOM nodes", () => {
    render(
      <>
        <SystemInventory
          assets={Array.from({ length: 1_641 }, (_, index) => asset(index))}
        />
        <SystemTopology
          assets={Array.from({ length: 1_641 }, (_, index) => asset(index))}
          coreEndpointLabels={{}}
          relationships={Array.from(
            { length: 1_479 },
            (_, index) => relationship(index),
          )}
        />
      </>,
    );

    expect(document.querySelectorAll("*").length).toBeLessThan(5_000);
  });

  it("keeps the Skills initial render below 3,000 DOM nodes", () => {
    render(
      <SkillDirectory
        skills={Array.from({ length: 132 }, (_, index) => skill(index))}
        initialFilters={skillFilters}
      />,
    );

    expect(document.querySelectorAll("*").length).toBeLessThan(3_000);
  });

  it("keeps the Projects initial render below 2,000 DOM nodes", () => {
    render(
      <ProjectDirectory
        projects={Array.from({ length: 66 }, (_, index) => project(index))}
        initialFilters={projectFilters}
      />,
    );

    expect(document.querySelectorAll("*").length).toBeLessThan(2_000);
  });
});
