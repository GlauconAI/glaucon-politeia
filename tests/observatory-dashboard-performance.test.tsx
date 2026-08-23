import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ProjectDirectory,
  type ProjectDirectoryFilters,
} from "@/components/observatory/ProjectDirectory";
import { ProjectExecutionPortfolio } from "@/components/observatory/ProjectExecutionPortfolio";
import {
  SkillDirectory,
  type SkillDirectoryFilters,
} from "@/components/observatory/SkillDirectory";
import { SystemInventory } from "@/components/observatory/SystemInventory";
import { SystemTopology } from "@/components/observatory/SystemTopology";
import type {
  DashboardProjectEntry,
  DashboardProjectExecutionEntry,
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

function projectExecution(index: number): DashboardProjectExecutionEntry {
  const executionLines = Array.from({ length: 3 }, (_, lineIndex) => ({
    line_id: `line-${index}-${lineIndex}`,
    stage_id: `stage-${lineIndex}`,
    run_id: `run-${index}-${lineIndex}`,
    title: `Execution line ${lineIndex}`,
    owner_agent_id: `agent-${lineIndex}`,
    transfer_mode: "project_executor" as const,
    status: "active" as const,
    dependencies: lineIndex === 0 ? [] : [`line-${index}-${lineIndex - 1}`],
    return_trigger: "terminal_signal" as const,
    execution_line_returns_to_originating_agent: true,
    artifact_ref: null,
    verification_summary: null,
    started_at: "2026-08-23T18:00:00.000Z",
    handed_off_at: null,
    updated_at: "2026-08-23T18:00:00.000Z",
    completed_at: null,
    user_returned_at: null,
    canonical_result_ref: null,
  }));
  return {
    projectKey: `plato/project-${index}`,
    title: `Project ${index}`,
    owner: "Plato",
    status: "active",
    currentStage: "Execution",
    currentGate: "Gate 3",
    updatedAt: "2026-08-23T18:00:00.000Z",
    collectedAt: "2026-08-23T18:00:00.000Z",
    freshness: "fresh",
    match: "matched",
    executionLines,
    summary: {
      executionLineCount: executionLines.length,
      activeCount: executionLines.length,
      waitingCount: 0,
      blockedCount: 0,
      completedCount: 0,
      independentOwnerLineCount: 0,
    },
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

  it("keeps the Project execution portfolio below 5,000 DOM nodes", () => {
    render(
      <ProjectExecutionPortfolio
        projects={Array.from({ length: 32 }, (_, index) =>
          projectExecution(index),
        )}
        sourceAvailable
        sourceStatus="fresh"
        collectedAt="2026-08-23T18:00:00.000Z"
      />,
    );

    expect(document.querySelectorAll("*").length).toBeLessThan(5_000);
  });
});
