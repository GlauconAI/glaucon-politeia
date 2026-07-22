import { describe, expect, it } from "vitest";

import {
  collectSystemInventory,
  type SystemMetadataEntry,
} from "@/lib/observatory/system-collector";
import {
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V2,
  ObservatoryCollectionEnvelopeSchema,
} from "@/lib/observatory/collection-schema";
import {
  computeObservatorySnapshotDigest,
  upgradeObservatorySnapshotToV2,
  type CommandInvocation,
} from "@/lib/observatory/collector";

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
      { command: "openclaw", args: ["skills", "list", "--agent", "plato", "--json"], timeoutMs: 10_000 },
      { command: "openclaw", args: ["plugins", "list", "--json"], timeoutMs: 10_000 },
      { command: "openclaw", args: ["cron", "list", "--all", "--json"], timeoutMs: 10_000 },
      { command: "openclaw", args: ["gateway", "status", "--json"], timeoutMs: 10_000 },
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
});
