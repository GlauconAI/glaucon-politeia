import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_SNAPSHOT_SCHEMA_VERSION,
  ObservatoryRegistrySnapshotSchema,
} from "@/lib/observatory/schema";

const validSnapshot = {
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
    project_count: 1,
    primary_scene_count: 1,
    secondary_scene_count: 0,
    execution_flow_count: 1,
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
  ],
  scenes: [
    {
      id: "S01",
      name: "Product strategy",
      flow: "Deep Task Flow",
      description: "Define product boundaries.",
      recommended_stage_owner: "main",
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
  ],
} as const;

describe("ObservatoryRegistrySnapshotSchema", () => {
  it("accepts the supported narrow versioned snapshot contract", () => {
    expect(OBSERVATORY_SNAPSHOT_SCHEMA_VERSION).toBe("1.0.0");
    expect(ObservatoryRegistrySnapshotSchema.parse(validSnapshot)).toEqual(
      validSnapshot,
    );
  });

  it("rejects impossible provenance timestamps at the collected_at path", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      source: {
        ...validSnapshot.source,
        collected_at: "2026-02-30T22:45:00.000Z",
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["source", "collected_at"]);
    }
  });

  it("rejects absolute provenance logical references", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      source: {
        ...validSnapshot.source,
        logical_reference:
          "/Users/private/Glaucon Vault/orchestration-system-design.html",
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([
        "source",
        "logical_reference",
      ]);
    }
  });

  it("rejects unsupported snapshot schema versions", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      schema_version: "2.0.0",
    });

    expect(result.success).toBe(false);
  });

  it("reports every mismatched enumerable summary count at its exact path", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      summary: {
        ...validSnapshot.summary,
        project_count: 2,
        primary_scene_count: 2,
        execution_flow_count: 2,
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ["summary", "project_count"],
        ["summary", "primary_scene_count"],
        ["summary", "execution_flow_count"],
      ]);
    }
  });

  it("keeps secondary_scene_count as a nonnegative source-derived summary", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      summary: {
        ...validSnapshot.summary,
        secondary_scene_count: 7,
      },
    });

    expect(result.success).toBe(true);
    expect(
      ObservatoryRegistrySnapshotSchema.shape.summary.shape
        .secondary_scene_count.description,
    ).toMatch(/not cross-validated/i);
  });

  it("rejects duplicate canonical scene ids at the duplicate id path", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      summary: {
        ...validSnapshot.summary,
        primary_scene_count: 2,
      },
      scenes: [validSnapshot.scenes[0], validSnapshot.scenes[0]],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["scenes", 1, "id"]);
    }
  });

  it("rejects duplicate canonical flow ids at the duplicate id path", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      summary: {
        ...validSnapshot.summary,
        execution_flow_count: 2,
      },
      execution_flows: [
        validSnapshot.execution_flows[0],
        validSnapshot.execution_flows[0],
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([
        "execution_flows",
        1,
        "id",
      ]);
    }
  });

  it("rejects duplicate derived project keys at the duplicate key path", () => {
    const project = validSnapshot.project_groups[0].projects[0];
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      summary: {
        ...validSnapshot.summary,
        project_count: 2,
      },
      project_groups: [
        {
          ...validSnapshot.project_groups[0],
          projects: [project, project],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([
        "project_groups",
        0,
        "projects",
        1,
        "project_key",
      ]);
    }
  });

  it("rejects derived project keys with ambiguous path delimiters", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      project_groups: [
        {
          ...validSnapshot.project_groups[0],
          projects: [
            {
              ...validSnapshot.project_groups[0].projects[0],
              project_key: "socrates/governance/child",
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([
        "project_groups",
        0,
        "projects",
        0,
        "project_key",
      ]);
    }
  });

  it("rejects runtime or private fields outside the root whitelist", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      runtime_session: "agent:main:private-session",
    });

    expect(result.success).toBe(false);
  });

  it("rejects absolute roots and private fields outside nested whitelists", () => {
    const result = ObservatoryRegistrySnapshotSchema.safeParse({
      ...validSnapshot,
      project_groups: [
        {
          ...validSnapshot.project_groups[0],
          root: "/Users/private/Glaucon Vault/socrates-agora/projects",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("documents project_key as derived while canonical ids remain unchanged", () => {
    const projectKeySchema =
      ObservatoryRegistrySnapshotSchema.shape.project_groups.element.shape.projects
        .element.shape.project_key;

    expect(projectKeySchema.description).toMatch(/derived/i);
    expect(
      ObservatoryRegistrySnapshotSchema.shape.scenes.element.shape.id.description,
    ).toMatch(/canonical/i);
    expect(
      ObservatoryRegistrySnapshotSchema.shape.execution_flows.element.shape.id
        .description,
    ).toMatch(/canonical/i);
  });
});
