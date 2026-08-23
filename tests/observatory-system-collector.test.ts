import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectSystemInventory,
  type SystemMetadataEntry,
} from "@/lib/observatory/system-collector";
import {
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V2,
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V3,
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V4,
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V5,
  ObservatoryCollectionEnvelopeSchema,
} from "@/lib/observatory/collection-schema";
import {
  computeObservatorySnapshotDigest,
  upgradeObservatorySnapshotToV2,
  upgradeObservatorySnapshotToV3,
  upgradeObservatorySnapshotToV4,
  upgradeObservatorySnapshotToV5,
  type CommandInvocation,
} from "@/lib/observatory/collector";
import { projectDashboardGovernance } from "@/lib/observatory/governance-markdown";
import { projectExecutionFixture } from "./observatory-project-execution-schema.test";

const generatedAt = "2026-07-22T22:00:00.000Z";

const coreSnapshot = {
  schema_version: "1.0.0",
  status: "success",
  generated_at: generatedAt,
  source_digest: "a".repeat(64),
  collector_version: "1.0.0",
  registry: {
    schema_version: "1.0.0",
    registry_schema_version: "2.0.0",
    registry_version: "fixture-v2",
    source: {
      logical_reference:
        "shared/projects/openclaw-orchestration-control/orchestration-system-design.html#orchestration-registry",
      authority: "canonical",
      owner: "Socrates",
      collected_at: generatedAt,
      freshness: "fresh",
      digest: "a".repeat(64),
    },
    summary: {
      project_count: 0,
      primary_scene_count: 0,
      secondary_scene_count: 0,
      execution_flow_count: 0,
    },
    project_groups: [],
    scenes: [],
    execution_flows: [],
  },
  agents: [
    {
      id: "plato",
      display_name: "Plato",
      emoji: "🔮",
      model_label: "openai/gpt-5",
      workspace_label: "plato",
      binding_count: 1,
      default: true,
    },
  ],
  runtime: {
    runtime_version: "2026.7.1",
    gateway_running: true,
    gateway_reachable: true,
    configured_agent_count: 1,
    task_totals: { total: 1, active: 1, queued: 0, completed: 0, failed: 0 },
  },
  summary: {
    freshness: "fresh",
    project_count: 0,
    primary_scene_count: 0,
    secondary_scene_count: 0,
    execution_flow_count: 0,
    agent_count: 1,
    binding_count: 1,
    configured_agent_count: 1,
    gateway_running: true,
    gateway_reachable: true,
    task_totals: { total: 1, active: 1, queued: 0, completed: 0, failed: 0 },
  },
} as const;

const metadata: SystemMetadataEntry[] = [
  {
    kind: "rule",
    id: "rule:plato:agents",
    name: "AGENTS.md",
    owner: "plato",
    source: "workspace/plato/AGENTS.md",
    summary: "Present · recently modified",
    health: "healthy",
  },
];

describe("collectSystemInventory", () => {
  it("uses only approved read-only argv commands and combines safe metadata", async () => {
    const seen: CommandInvocation[] = [];
    const inventory = await collectSystemInventory(
      { agents: coreSnapshot.agents, metadata },
      {
        now: () => new Date(generatedAt),
        runCommand: async (invocation) => {
          seen.push(invocation);
          const key = invocation.args.slice(0, 2).join(" ");
          if (key === "skills list") {
            return {
              exitCode: 0,
              stdout: JSON.stringify({ skills: [{ name: "weather", eligible: true }] }),
            };
          }
          if (key === "plugins list") {
            return {
              exitCode: 0,
              stdout: JSON.stringify({ plugins: [{ id: "telegram", enabled: true, status: "loaded" }] }),
            };
          }
          if (key === "cron list") {
            return {
              exitCode: 0,
              stdout: JSON.stringify({ jobs: [{ id: "refresh", name: "Refresh", agentId: "plato", enabled: true, schedule: { kind: "every", everyMs: 900000 }, state: { lastStatus: "success" } }] }),
            };
          }
          return {
            exitCode: 0,
            stdout: JSON.stringify({ service: { runtime: { status: "running" } }, rpc: { ok: true } }),
          };
        },
      },
    );

    expect(seen).toEqual([
      { command: "openclaw", args: ["skills", "list", "--agent", "plato", "--json"], timeoutMs: 30_000 },
      { command: "openclaw", args: ["plugins", "list", "--json"], timeoutMs: 30_000 },
      { command: "openclaw", args: ["cron", "list", "--all", "--json"], timeoutMs: 30_000 },
      { command: "openclaw", args: ["gateway", "status", "--json"], timeoutMs: 30_000 },
    ]);
    expect(inventory.assets.map((item) => item.kind)).toEqual([
      "cron",
      "gateway",
      "rule",
      "runtime",
      "skill",
      "tool",
    ]);
    expect(inventory.source_health).toHaveLength(6);
    expect(JSON.stringify(inventory)).not.toMatch(/token|payload|\/Users/u);
  });

  it("records a sanitized failed domain without discarding healthy domains", async () => {
    const inventory = await collectSystemInventory(
      { agents: coreSnapshot.agents, metadata: [] },
      {
        now: () => new Date(generatedAt),
        runCommand: async (invocation) =>
          invocation.args[0] === "cron"
            ? { exitCode: 1, stdout: "", stderr: "token=secret /Users/private" }
            : invocation.args[0] === "skills"
              ? { exitCode: 0, stdout: JSON.stringify({ skills: [] }) }
              : invocation.args[0] === "plugins"
                ? { exitCode: 0, stdout: JSON.stringify({ plugins: [] }) }
                : { exitCode: 0, stdout: JSON.stringify({ service: { runtime: { status: "running" } }, rpc: { ok: true } }) },
      },
    );

    expect(inventory.source_health.find((item) => item.domain === "operations")).toMatchObject({
      status: "failed",
      health: "failed",
      error_code: "COMMAND_FAILED",
    });
    expect(JSON.stringify(inventory)).not.toMatch(/secret|Users|stderr/u);
  });
});

describe("v2 collection envelope", () => {
  it("upgrades a valid v1 core snapshot and recomputes the digest", async () => {
    const inventory = await collectSystemInventory(
      { agents: coreSnapshot.agents, metadata: [] },
      {
        now: () => new Date(generatedAt),
        runCommand: async (invocation) => {
          if (invocation.args[0] === "skills") return { exitCode: 0, stdout: JSON.stringify({ skills: [] }) };
          if (invocation.args[0] === "plugins") return { exitCode: 0, stdout: JSON.stringify({ plugins: [] }) };
          if (invocation.args[0] === "cron") return { exitCode: 0, stdout: JSON.stringify({ jobs: [] }) };
          return { exitCode: 0, stdout: JSON.stringify({ service: { runtime: { status: "running" } }, rpc: { ok: true } }) };
        },
      },
    );
    const upgraded = upgradeObservatorySnapshotToV2(coreSnapshot, inventory);

    expect(upgraded.schema_version).toBe(OBSERVATORY_COLLECTION_SCHEMA_VERSION_V2);
    expect(ObservatoryCollectionEnvelopeSchema.parse(upgraded)).toEqual(upgraded);
    expect(upgraded.source_digest).toBe(computeObservatorySnapshotDigest(upgraded));
    expect(upgraded.registry.source.digest).toBe(upgraded.source_digest);
  });

  it("upgrades a valid v2 snapshot with governance and recomputes the digest", async () => {
    const inventory = await collectSystemInventory(
      { agents: coreSnapshot.agents, metadata: [] },
      {
        now: () => new Date(generatedAt),
        runCommand: async (invocation) => {
          if (invocation.args[0] === "skills") return { exitCode: 0, stdout: JSON.stringify({ skills: [] }) };
          if (invocation.args[0] === "plugins") return { exitCode: 0, stdout: JSON.stringify({ plugins: [] }) };
          if (invocation.args[0] === "cron") return { exitCode: 0, stdout: JSON.stringify({ jobs: [] }) };
          return { exitCode: 0, stdout: JSON.stringify({ service: { runtime: { status: "running" } }, rpc: { ok: true } }) };
        },
      },
    );
    const fixtureRoot = join(
      process.cwd(),
      "tests/fixtures/observatory-governance",
    );
    const governance = projectDashboardGovernance(
      {
        readme: readFileSync(join(fixtureRoot, "README.md"), "utf8"),
        baseline: readFileSync(
          join(fixtureRoot, "development-baseline.md"),
          "utf8",
        ),
        tracker: readFileSync(join(fixtureRoot, "edad-tracker.md"), "utf8"),
        calibration: readFileSync(
          join(fixtureRoot, "estimate-calibration.md"),
          "utf8",
        ),
      },
      { collectedAt: generatedAt },
    );
    const v2 = upgradeObservatorySnapshotToV2(coreSnapshot, inventory);
    const upgraded = upgradeObservatorySnapshotToV3(v2, governance);

    expect(upgraded.schema_version).toBe(OBSERVATORY_COLLECTION_SCHEMA_VERSION_V3);
    expect(upgraded.delivery_governance.project.id).toBe("dashboard");
    expect(upgraded.source_digest).toBe(computeObservatorySnapshotDigest(upgraded));
    expect(upgraded.registry.source.digest).toBe(upgraded.source_digest);
    expect(ObservatoryCollectionEnvelopeSchema.parse(upgraded)).toEqual(upgraded);
  });

  it("upgrades a valid v3 snapshot with source repositories and recomputes the digest", async () => {
    const inventory = await collectSystemInventory(
      { agents: coreSnapshot.agents, metadata: [] },
      {
        now: () => new Date(generatedAt),
        runCommand: async (invocation) => {
          if (invocation.args[0] === "skills") return { exitCode: 0, stdout: JSON.stringify({ skills: [] }) };
          if (invocation.args[0] === "plugins") return { exitCode: 0, stdout: JSON.stringify({ plugins: [] }) };
          if (invocation.args[0] === "cron") return { exitCode: 0, stdout: JSON.stringify({ jobs: [] }) };
          return { exitCode: 0, stdout: JSON.stringify({ service: { runtime: { status: "running" } }, rpc: { ok: true } }) };
        },
      },
    );
    const fixtureRoot = join(
      process.cwd(),
      "tests/fixtures/observatory-governance",
    );
    const governance = projectDashboardGovernance(
      {
        readme: readFileSync(join(fixtureRoot, "README.md"), "utf8"),
        baseline: readFileSync(
          join(fixtureRoot, "development-baseline.md"),
          "utf8",
        ),
        tracker: readFileSync(join(fixtureRoot, "edad-tracker.md"), "utf8"),
        calibration: readFileSync(
          join(fixtureRoot, "estimate-calibration.md"),
          "utf8",
        ),
      },
      { collectedAt: generatedAt },
    );
    const v2 = upgradeObservatorySnapshotToV2(coreSnapshot, inventory);
    const v3 = upgradeObservatorySnapshotToV3(v2, governance);
    const upgraded = upgradeObservatorySnapshotToV4(v3, {
      repositories: [
        {
          id: "repository:0123456789abcdef",
          name: "glaucon-politeia",
          scope: "workspace",
          local_ref: "workspace/plato/glaucon-politeia",
          maintainer_agent_id: "plato",
          knowledge_area: null,
          github: {
            owner: "GlauconAI",
            repo: "glaucon-politeia",
            url: "https://github.com/GlauconAI/glaucon-politeia",
          },
          current_branch: "main",
          detached: false,
          head: "b".repeat(40),
          default_branch: "main",
          last_commit_at: generatedAt,
          working_tree: "clean",
          activity: "active",
          archive_state: "unknown",
          registry_project_keys: ["plato/dashboard"],
          authority: "observed",
          source: "local-git/workspace",
          collected_at: generatedAt,
          health: "healthy",
        },
      ],
      source_health: {
        status: "fresh",
        health: "healthy",
        collected_at: generatedAt,
        last_success_at: generatedAt,
        repository_count: 1,
        omitted_count: 0,
      },
    });

    expect(upgraded.schema_version).toBe(OBSERVATORY_COLLECTION_SCHEMA_VERSION_V4);
    expect(upgraded.collector_version).toBe("4.0.0");
    expect(upgraded.source_repositories.repositories).toHaveLength(1);
    expect(upgraded.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "repository:0123456789abcdef",
          kind: "repository",
          owner: "plato",
          source: "local-git/workspace",
        }),
      ]),
    );
    expect(upgraded.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "agent:plato",
          to: "repository:0123456789abcdef",
          kind: "maintains",
        }),
      ]),
    );
    expect(upgraded.source_health).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: "source_repositories",
          asset_count: 1,
        }),
      ]),
    );
    expect(upgraded.source_digest).toBe(computeObservatorySnapshotDigest(upgraded));
    expect(upgraded.registry.source.digest).toBe(upgraded.source_digest);
    expect(ObservatoryCollectionEnvelopeSchema.parse(upgraded)).toEqual(upgraded);

    const v5 = upgradeObservatorySnapshotToV5(upgraded, {
      snapshot: projectExecutionFixture(),
      sourceHealth: {
        domain: "project_executions",
        status: "fresh",
        health: "healthy",
        collected_at: generatedAt,
        last_success_at: generatedAt,
        asset_count: 1,
      },
    });
    expect(v5.schema_version).toBe(OBSERVATORY_COLLECTION_SCHEMA_VERSION_V5);
    expect(v5.collector_version).toBe("5.0.0");
    expect(v5.project_executions?.summary.project_count).toBe(1);
    expect(v5.source_health).toHaveLength(8);
    expect(v5.source_health.at(-1)).toMatchObject({
      domain: "project_executions",
      status: "fresh",
    });
    expect(v5.source_digest).toBe(computeObservatorySnapshotDigest(v5));
    expect(ObservatoryCollectionEnvelopeSchema.parse(v5)).toEqual(v5);
  });
});
