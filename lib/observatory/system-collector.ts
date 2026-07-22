import {
  ObservatoryAssetInventorySchema,
  ObservatoryAssetSchema,
  ObservatoryRelationshipSchema,
  type ObservatoryAsset,
  type ObservatoryAssetInventory,
  type ObservatoryRelationship,
  type ObservatorySourceDomain,
} from "#observatory-asset-schema";
import type { ObservatoryAgent } from "#observatory-collection-schema";
import { rollupSourceHealth } from "#observatory-freshness";
import {
  projectCronAssets,
  projectGatewayAssets,
  projectPluginAssets,
  projectSkillAssets,
} from "#observatory-system-assets";
import type {
  CommandInvocation,
  CommandResult,
  CommandRunner,
} from "#observatory-collector";

const MAX_COMMAND_BYTES = 5 * 1024 * 1024;

export interface SystemMetadataEntry {
  kind: "profile" | "rule" | "config" | "knowledge" | "agenda";
  id: string;
  name: string;
  owner: string;
  source: string;
  summary: string;
  health: "healthy" | "degraded" | "failed" | "unknown" | "disabled";
}

interface SystemCollectorDependencies {
  runCommand: CommandRunner;
  now(): Date;
  commandTimeoutMs?: number;
}

class SafeCommandError extends Error {
  readonly code: "COMMAND_FAILED" | "COMMAND_TIMEOUT" | "OUTPUT_INVALID";

  constructor(code: SafeCommandError["code"]) {
    super(code);
    this.code = code;
  }
}

async function runJson(
  invocation: CommandInvocation,
  runCommand: CommandRunner,
): Promise<unknown> {
  let result: CommandResult;
  try {
    result = await runCommand(invocation);
  } catch {
    throw new SafeCommandError("COMMAND_FAILED");
  }
  if (result.timedOut) throw new SafeCommandError("COMMAND_TIMEOUT");
  if (
    result.outputLimitExceeded ||
    Buffer.byteLength(result.stdout, "utf8") > MAX_COMMAND_BYTES
  ) {
    throw new SafeCommandError("OUTPUT_INVALID");
  }
  if (result.exitCode !== 0) throw new SafeCommandError("COMMAND_FAILED");
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new SafeCommandError("OUTPUT_INVALID");
  }
}

function metadataAsset(
  entry: SystemMetadataEntry,
  collectedAt: string,
): ObservatoryAsset {
  return ObservatoryAssetSchema.parse({
    ...entry,
    authority: "observed",
    collected_at: collectedAt,
    freshness: entry.health === "failed" ? "failed" : "fresh",
    labels: [],
  });
}

function sourceDomain(kind: ObservatoryAsset["kind"]): ObservatorySourceDomain {
  if (kind === "skill") return "skills";
  if (kind === "tool" || kind === "profile") return "tools_profiles";
  if (kind === "rule" || kind === "config") return "rules_config";
  if (kind === "knowledge" || kind === "agenda") return "knowledge_agenda";
  return "operations";
}

export async function collectSystemInventory(
  input: {
    agents: readonly ObservatoryAgent[];
    metadata: readonly SystemMetadataEntry[];
  },
  dependencies: SystemCollectorDependencies,
): Promise<ObservatoryAssetInventory> {
  const collectedAt = dependencies.now().toISOString();
  const timeoutMs = dependencies.commandTimeoutMs ?? 10_000;
  const assets: ObservatoryAsset[] = input.metadata.map((entry) =>
    metadataAsset(entry, collectedAt),
  );
  const relationships: ObservatoryRelationship[] = [];
  const failedDomains = new Map<ObservatorySourceDomain, string>();
  const coreEndpointIds = input.agents.map((agent) => `agent:${agent.id}`);

  for (const agent of input.agents) {
    try {
      const candidate = await runJson(
        {
          command: "openclaw",
          args: ["skills", "list", "--agent", agent.id, "--json"],
          timeoutMs,
        },
        dependencies.runCommand,
      );
      const projected = projectSkillAssets(agent.id, candidate, collectedAt);
      assets.push(...projected.assets);
      relationships.push(...projected.relationships);
    } catch (error) {
      failedDomains.set(
        "skills",
        error instanceof SafeCommandError ? error.code : "OUTPUT_INVALID",
      );
    }
  }

  try {
    assets.push(
      ...projectPluginAssets(
        await runJson(
          {
            command: "openclaw",
            args: ["plugins", "list", "--json"],
            timeoutMs,
          },
          dependencies.runCommand,
        ),
        collectedAt,
      ),
    );
  } catch (error) {
    failedDomains.set(
      "tools_profiles",
      error instanceof SafeCommandError ? error.code : "OUTPUT_INVALID",
    );
  }

  try {
    const projected = projectCronAssets(
      await runJson(
        {
          command: "openclaw",
          args: ["cron", "list", "--all", "--json"],
          timeoutMs,
        },
        dependencies.runCommand,
      ),
      collectedAt,
    );
    assets.push(...projected.assets);
    relationships.push(...projected.relationships);
  } catch (error) {
    failedDomains.set(
      "operations",
      error instanceof SafeCommandError ? error.code : "OUTPUT_INVALID",
    );
  }

  try {
    assets.push(
      ...projectGatewayAssets(
        await runJson(
          {
            command: "openclaw",
            args: ["gateway", "status", "--json"],
            timeoutMs,
          },
          dependencies.runCommand,
        ),
        collectedAt,
      ),
    );
  } catch (error) {
    failedDomains.set(
      "operations",
      error instanceof SafeCommandError ? error.code : "OUTPUT_INVALID",
    );
  }

  assets.push(
    ObservatoryAssetSchema.parse({
      id: "runtime:openclaw",
      kind: "runtime",
      name: "OpenClaw Runtime",
      owner: "OpenClaw",
      authority: "observed",
      source: "openclaw/status",
      collected_at: collectedAt,
      freshness: "fresh",
      health: "healthy",
      summary: "Runtime status collected",
      labels: [],
    }),
  );
  if (assets.some((item) => item.id === "gateway:openclaw")) {
    relationships.push(
      ObservatoryRelationshipSchema.parse({
        from: "gateway:openclaw",
        to: "runtime:openclaw",
        kind: "serves",
        authority: "observed",
        source: "openclaw/gateway-status",
      }),
    );
  }

  assets.sort((left, right) =>
    left.kind === right.kind
      ? left.id.localeCompare(right.id)
      : left.kind.localeCompare(right.kind),
  );
  const endpointSet = new Set([
    ...coreEndpointIds,
    ...assets.map((item) => item.id),
  ]);
  const safeRelationships = relationships
    .filter(
      (item) => endpointSet.has(item.from) && endpointSet.has(item.to),
    )
    .sort((left, right) =>
      `${left.from}:${left.to}:${left.kind}`.localeCompare(
        `${right.from}:${right.to}:${right.kind}`,
      ),
    );
  const domains: ObservatorySourceDomain[] = [
    "core",
    "skills",
    "tools_profiles",
    "rules_config",
    "knowledge_agenda",
    "operations",
  ];
  const sourceHealth = domains.map((domain) => {
    const errorCode = failedDomains.get(domain);
    const count =
      domain === "core"
        ? coreEndpointIds.length
        : assets.filter((item) => sourceDomain(item.kind) === domain).length;
    return rollupSourceHealth({
      domain,
      collectedAt,
      lastSuccessAt: errorCode ? null : collectedAt,
      assetCount: count,
      failed: Boolean(errorCode),
      errorCode,
      now: dependencies.now(),
    });
  });

  return ObservatoryAssetInventorySchema.parse({
    assets,
    core_endpoint_ids: coreEndpointIds,
    relationships: safeRelationships,
    source_health: sourceHealth,
  });
}
