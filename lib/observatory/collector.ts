import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import {
  OBSERVATORY_COLLECTION_SCHEMA_VERSION,
  OBSERVATORY_COLLECTOR_VERSION,
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V2,
  OBSERVATORY_COLLECTOR_VERSION_V2,
  ObservatoryAgentSchema,
  ObservatoryCollectionEnvelopeSchema,
  ObservatoryCollectionEnvelopeV1Schema,
  ObservatoryCollectionEnvelopeV2Schema,
  ObservatoryRuntimeSchema,
  type ObservatoryAgent,
  type ObservatoryCollectionEnvelope,
  type ObservatoryCollectionEnvelopeV2,
  type ObservatoryRuntime,
} from "#observatory-collection-schema";
import {
  ObservatoryAssetInventorySchema,
  type ObservatoryAssetInventory,
} from "#observatory-asset-schema";
import { parseOrchestrationRegistryHtml } from "#observatory-registry";

export const OBSERVATORY_CLI_STDOUT_MAX_BYTES = 5 * 1024 * 1024;
export const OBSERVATORY_REGISTRY_HTML_MAX_BYTES = 10 * 1024 * 1024;

export type ObservatoryCollectorErrorCode =
  | "REGISTRY_READ_FAILED"
  | "REGISTRY_INVALID"
  | "COMMAND_FAILED"
  | "COMMAND_TIMEOUT"
  | "CLI_JSON_MALFORMED"
  | "CLI_SCHEMA_INVALID"
  | "SNAPSHOT_INVALID"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "FILE_IDENTITY_FAILED"
  | "SOURCE_WRITE_FORBIDDEN"
  | "ATOMIC_WRITE_FAILED"
  | "DIRECTORY_SYNC_FAILED";

export class ObservatoryCollectorError extends Error {
  readonly code: ObservatoryCollectorErrorCode;

  constructor(code: ObservatoryCollectorErrorCode, message: string) {
    super(message);
    this.name = "ObservatoryCollectorError";
    this.code = code;
  }
}

export interface CommandInvocation {
  command: string;
  args: readonly string[];
  timeoutMs: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr?: string;
  timedOut?: boolean;
  outputLimitExceeded?: boolean;
}

export type CommandRunner = (
  invocation: CommandInvocation,
) => Promise<CommandResult>;

export interface AtomicWritableFile {
  write(content: string): Promise<void>;
  sync?(): Promise<void>;
  close(): Promise<void>;
}

export interface AtomicFileAdapter {
  openExclusive(path: string): Promise<AtomicWritableFile>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  syncDirectory?(path: string): Promise<void>;
}

export interface FileIdentity {
  device: number | bigint | string;
  inode: number | bigint | string;
}

export interface FileIdentityAdapter {
  realpathIfExists(path: string): Promise<string | undefined>;
  statIfExists(path: string): Promise<FileIdentity | undefined>;
}

interface CollectorDependencies {
  runCommand: CommandRunner;
  readTextFile(path: string): Promise<string>;
  now(): Date;
  commandTimeoutMs?: number;
}

interface CollectAndWriteDependencies extends CollectorDependencies {
  files: AtomicFileAdapter;
  identities: FileIdentityAdapter;
  createTempPath?(destinationPath: string): string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function firstRecord(...values: unknown[]): UnknownRecord | undefined {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === "boolean");
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function logicalWorkspaceLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "unknown";
  const safeToken = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/iu;
  if (!value.includes("/") && !value.includes("\\")) {
    return safeToken.test(value) ? value : "unknown";
  }

  const isAbsolute =
    value.startsWith("/") ||
    value.startsWith("\\\\") ||
    /^[a-z]:[\\/]/iu.test(value);
  if (!isAbsolute) return "unknown";
  const segments = value.replaceAll("\\", "/").split("/").filter(Boolean);
  const workspaceIndex = segments.findLastIndex(
    (segment) => segment === "workspace" || segment === "workspaces",
  );
  const label = segments[workspaceIndex + 1];
  return workspaceIndex >= 0 && label && safeToken.test(label)
    ? label
    : "unknown";
}

function parseCliJson(stdout: string, label: "agents" | "status"): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new ObservatoryCollectorError(
      "CLI_JSON_MALFORMED",
      `OpenClaw ${label} returned malformed JSON. Run the command locally to verify the CLI response.`,
    );
  }
}

function mapAgents(candidate: unknown): ObservatoryAgent[] {
  const root = asRecord(candidate);
  const entries = Array.isArray(candidate)
    ? candidate
    : root && Array.isArray(root.agents)
      ? root.agents
      : undefined;
  if (!entries) {
    throw new ObservatoryCollectorError(
      "CLI_SCHEMA_INVALID",
      "OpenClaw agents JSON does not contain an agents array.",
    );
  }

  const agents = entries.map((entry, index) => {
    const agent = asRecord(entry);
    const identity = firstRecord(agent?.identity);
    const model = firstRecord(agent?.model);
    const id = firstString(agent?.id);
    if (!agent || !id) {
      throw new ObservatoryCollectorError(
        "CLI_SCHEMA_INVALID",
        `OpenClaw agents JSON has an invalid agent at index ${index}.`,
      );
    }
    const bindings = Array.isArray(agent.bindings)
      ? agent.bindings.length
      : safeCount(agent.bindings) ??
        safeCount(agent.bindingCount) ??
        safeCount(agent.binding_count) ??
        0;
    const output = {
      id,
      display_name:
        firstString(
          agent.identityName,
          agent.displayName,
          agent.display_name,
          agent.name,
          identity?.name,
        ) ?? id,
      emoji:
        firstString(agent.identityEmoji, agent.emoji, identity?.emoji) ?? "",
      model_label:
        firstString(
          agent.modelLabel,
          agent.model_label,
          agent.model,
          model?.label,
          model?.name,
          model?.id,
          model?.primary,
        ) ?? "unknown",
      workspace_label: logicalWorkspaceLabel(
        firstString(
          agent.workspaceLabel,
          agent.workspace_label,
          agent.workspace,
        ),
      ),
      binding_count: bindings,
      default:
        firstBoolean(agent.default, agent.isDefault, agent.is_default) ?? false,
    };
    const parsed = ObservatoryAgentSchema.safeParse(output);
    if (!parsed.success) {
      throw new ObservatoryCollectorError(
        "CLI_SCHEMA_INVALID",
        `OpenClaw agents JSON has an invalid whitelisted agent at index ${index}.`,
      );
    }
    return parsed.data;
  });
  return agents.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

function mapRuntime(
  candidate: unknown,
  observedAgentCount: number,
): ObservatoryRuntime {
  const status = asRecord(candidate);
  if (!status) {
    throw new ObservatoryCollectorError(
      "CLI_SCHEMA_INVALID",
      "OpenClaw status JSON is not an object.",
    );
  }
  const runtime = firstRecord(status.runtime);
  const gateway = firstRecord(status.gateway, runtime?.gateway);
  const gatewayService = firstRecord(
    status.gatewayService,
    status.gateway_service,
  );
  const gatewayServiceRuntime = firstRecord(gatewayService?.runtime);
  const agents = firstRecord(status.agents, runtime?.agents);
  const tasks = firstRecord(status.taskTotals, status.tasks, runtime?.tasks);
  const taskStatuses = firstRecord(tasks?.byStatus, tasks?.by_status);
  const runtimeVersion = firstString(
    status.runtimeVersion,
    status.runtime_version,
    status.version,
    runtime?.version,
  );
  if (!runtimeVersion) {
    throw new ObservatoryCollectorError(
      "CLI_SCHEMA_INVALID",
      "OpenClaw status JSON does not contain a runtime version.",
    );
  }
  const gatewayServiceStatus = firstString(gatewayServiceRuntime?.status);

  const active =
    safeCount(tasks?.active) ??
    safeCount(tasks?.running) ??
    safeCount(taskStatuses?.running) ??
    0;
  const queued =
    safeCount(tasks?.queued) ??
    safeCount(tasks?.pending) ??
    safeCount(taskStatuses?.queued) ??
    0;
  const completed =
    safeCount(tasks?.completed) ?? safeCount(taskStatuses?.succeeded) ?? 0;
  const failed =
    safeCount(tasks?.failed) ??
    safeCount(tasks?.failures) ??
    (safeCount(taskStatuses?.failed) ?? 0) +
      (safeCount(taskStatuses?.timed_out) ?? 0) +
      (safeCount(taskStatuses?.lost) ?? 0);
  const output = {
    runtime_version: runtimeVersion,
    gateway_running:
      gatewayServiceStatus === undefined
        ? (firstBoolean(gateway?.running, status.gatewayRunning) ?? false)
        : gatewayServiceStatus.trim().toLowerCase() === "running",
    gateway_reachable:
      firstBoolean(gateway?.reachable, status.gatewayReachable) ?? false,
    configured_agent_count:
      safeCount(status.configuredAgentCount) ??
      safeCount(status.configured_agent_count) ??
      safeCount(agents?.configured) ??
      safeCount(agents?.count) ??
      (Array.isArray(agents?.agents) ? agents.agents.length : undefined) ??
      observedAgentCount,
    task_totals: {
      total:
        safeCount(tasks?.total) ?? active + queued + completed + failed,
      active,
      queued,
      completed,
      failed,
    },
  };
  const parsed = ObservatoryRuntimeSchema.safeParse(output);
  if (!parsed.success) {
    throw new ObservatoryCollectorError(
      "CLI_SCHEMA_INVALID",
      "OpenClaw status JSON cannot be reduced to the approved runtime whitelist.",
    );
  }
  return parsed.data;
}

async function runJsonCommand(
  runCommand: CommandRunner,
  args: readonly string[],
  timeoutMs: number,
  label: "agents" | "status",
): Promise<unknown> {
  let result: CommandResult;
  try {
    result = await runCommand({ command: "openclaw", args, timeoutMs });
  } catch {
    throw new ObservatoryCollectorError(
      "COMMAND_FAILED",
      `Unable to run OpenClaw ${label}. Verify that the OpenClaw CLI is installed and available.`,
    );
  }
  if (result.timedOut) {
    throw new ObservatoryCollectorError(
      "COMMAND_TIMEOUT",
      `OpenClaw ${label} exceeded the ${timeoutMs}ms timeout.`,
    );
  }
  if (
    result.outputLimitExceeded ||
    Buffer.byteLength(result.stdout, "utf8") > OBSERVATORY_CLI_STDOUT_MAX_BYTES
  ) {
    throw new ObservatoryCollectorError(
      "RESOURCE_LIMIT_EXCEEDED",
      `OpenClaw ${label} exceeded the ${OBSERVATORY_CLI_STDOUT_MAX_BYTES}-byte stdout limit.`,
    );
  }
  if (result.exitCode !== 0) {
    throw new ObservatoryCollectorError(
      "COMMAND_FAILED",
      `OpenClaw ${label} failed with exit code ${result.exitCode}. Run the command locally for details.`,
    );
  }
  return parseCliJson(result.stdout, label);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}

function observatoryDigestMaterial(
  snapshot: ObservatoryCollectionEnvelope,
): unknown {
  const {
    generated_at: _generatedAt,
    source_digest: _sourceDigest,
    registry,
    ...stableEnvelope
  } = snapshot;
  const {
    collected_at: _collectedAt,
    digest: _registryDigest,
    ...stableSource
  } = registry.source;
  return {
    ...stableEnvelope,
    registry: {
      ...registry,
      source: stableSource,
    },
  };
}

export function computeObservatorySnapshotDigest(
  snapshot: ObservatoryCollectionEnvelope,
): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(observatoryDigestMaterial(snapshot))))
    .digest("hex");
}

export function upgradeObservatorySnapshotToV2(
  coreSnapshotInput: unknown,
  inventoryInput: unknown,
): ObservatoryCollectionEnvelopeV2 {
  const coreSnapshot = ObservatoryCollectionEnvelopeV1Schema.parse(
    coreSnapshotInput,
  );
  const inventory = ObservatoryAssetInventorySchema.parse(inventoryInput);
  const placeholderDigest = "0".repeat(64);
  const draft = ObservatoryCollectionEnvelopeV2Schema.parse({
    ...coreSnapshot,
    schema_version: OBSERVATORY_COLLECTION_SCHEMA_VERSION_V2,
    collector_version: OBSERVATORY_COLLECTOR_VERSION_V2,
    source_digest: placeholderDigest,
    registry: {
      ...coreSnapshot.registry,
      source: { ...coreSnapshot.registry.source, digest: placeholderDigest },
    },
    ...inventory,
  });
  const digest = computeObservatorySnapshotDigest(draft);
  return ObservatoryCollectionEnvelopeV2Schema.parse({
    ...draft,
    source_digest: digest,
    registry: {
      ...draft.registry,
      source: { ...draft.registry.source, digest },
    },
  });
}

export async function collectObservatorySnapshot(
  input: { registryPath: string },
  dependencies: CollectorDependencies,
): Promise<ObservatoryCollectionEnvelope> {
  const timeoutMs = dependencies.commandTimeoutMs ?? 10_000;
  let html: string;
  try {
    html = await dependencies.readTextFile(input.registryPath);
  } catch (error) {
    if (error instanceof ObservatoryCollectorError) throw error;
    throw new ObservatoryCollectorError(
      "REGISTRY_READ_FAILED",
      "Unable to read the explicitly configured canonical registry source.",
    );
  }
  if (
    Buffer.byteLength(html, "utf8") > OBSERVATORY_REGISTRY_HTML_MAX_BYTES
  ) {
    throw new ObservatoryCollectorError(
      "RESOURCE_LIMIT_EXCEEDED",
      `The canonical registry source exceeded the ${OBSERVATORY_REGISTRY_HTML_MAX_BYTES}-byte input limit.`,
    );
  }

  const agentsCandidate = await runJsonCommand(
    dependencies.runCommand,
    ["agents", "list", "--json"],
    timeoutMs,
    "agents",
  );
  const statusCandidate = await runJsonCommand(
    dependencies.runCommand,
    ["status", "--json"],
    timeoutMs,
    "status",
  );
  const agents = mapAgents(agentsCandidate);
  const runtime = mapRuntime(statusCandidate, agents.length);
  const generatedAt = dependencies.now().toISOString();
  const placeholderDigest = "0".repeat(64);
  let registry: ObservatoryCollectionEnvelope["registry"];
  try {
    registry = parseOrchestrationRegistryHtml(html, {
      collected_at: generatedAt,
      digest: placeholderDigest,
    });
  } catch {
    throw new ObservatoryCollectorError(
      "REGISTRY_INVALID",
      "The configured canonical registry source is invalid or unsupported.",
    );
  }

  const draftResult = ObservatoryCollectionEnvelopeSchema.safeParse({
    schema_version: OBSERVATORY_COLLECTION_SCHEMA_VERSION,
    status: "success",
    generated_at: generatedAt,
    source_digest: placeholderDigest,
    collector_version: OBSERVATORY_COLLECTOR_VERSION,
    registry,
    agents,
    runtime,
    summary: {
      freshness: registry.source.freshness,
      ...registry.summary,
      agent_count: agents.length,
      binding_count: agents.reduce(
        (count, agent) => count + agent.binding_count,
        0,
      ),
      configured_agent_count: runtime.configured_agent_count,
      gateway_running: runtime.gateway_running,
      gateway_reachable: runtime.gateway_reachable,
      task_totals: runtime.task_totals,
    },
  });
  if (!draftResult.success) {
    throw new ObservatoryCollectorError(
      "SNAPSHOT_INVALID",
      "The whitelisted Observatory snapshot failed schema validation.",
    );
  }
  const digest = computeObservatorySnapshotDigest(draftResult.data);
  const finalResult = ObservatoryCollectionEnvelopeSchema.safeParse({
    ...draftResult.data,
    source_digest: digest,
    registry: {
      ...draftResult.data.registry,
      source: { ...draftResult.data.registry.source, digest },
    },
  });
  if (!finalResult.success) {
    throw new ObservatoryCollectorError(
      "SNAPSHOT_INVALID",
      "The digested Observatory snapshot failed schema validation.",
    );
  }
  return finalResult.data;
}

export async function writeObservatorySnapshotAtomically(
  snapshot: ObservatoryCollectionEnvelope,
  destinationPath: string,
  files: AtomicFileAdapter,
  createTempPath: (destinationPath: string) => string = (destination) =>
    join(
      dirname(destination),
      `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
    ),
  beforeRename?: () => Promise<void>,
): Promise<void> {
  const tempPath = createTempPath(destinationPath);
  let handle: AtomicWritableFile | undefined;
  let ownsTemp = false;
  let closed = false;
  try {
    handle = await files.openExclusive(tempPath);
    ownsTemp = true;
    await handle.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    await handle.sync?.();
    await handle.close();
    closed = true;
    await beforeRename?.();
    await files.rename(tempPath, destinationPath);
    ownsTemp = false;
  } catch (error) {
    if (handle && !closed) {
      try {
        await handle.close();
      } catch {
        // Preserve the primary atomic-write failure.
      }
    }
    if (ownsTemp) {
      try {
        await files.remove(tempPath);
      } catch {
        // Never remove anything except this task-owned temp path.
      }
    }
    if (error instanceof ObservatoryCollectorError) throw error;
    throw new ObservatoryCollectorError(
      "ATOMIC_WRITE_FAILED",
      "Unable to atomically replace the local Observatory snapshot; the prior file was preserved.",
    );
  }

  if (!files.syncDirectory) return;
  try {
    await files.syncDirectory(dirname(destinationPath));
  } catch (error) {
    if (isExpectedUnsupportedDirectorySync(error)) return;
    throw new ObservatoryCollectorError(
      "DIRECTORY_SYNC_FAILED",
      "The Observatory snapshot was replaced, but its destination directory could not be durably synchronized.",
    );
  }
}

function isExpectedUnsupportedDirectorySync(error: unknown): boolean {
  if (error === null || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  const code = error.code;
  return (
    code === "EINVAL" ||
    code === "ENOTSUP" ||
    code === "EOPNOTSUPP" ||
    code === "EISDIR" ||
    (process.platform === "win32" && code === "EPERM")
  );
}

async function resolveSafeDestinationPath(
  sourcePath: string,
  destinationPath: string,
  identities: FileIdentityAdapter,
): Promise<string> {
  let sourceCanonical: string;
  let destinationResolved: string | undefined;
  let sourceIdentity: FileIdentity | undefined;
  let destinationIdentity: FileIdentity | undefined;
  try {
    const sourceResolved = await identities.realpathIfExists(sourcePath);
    if (!sourceResolved) {
      throw new ObservatoryCollectorError(
        "FILE_IDENTITY_FAILED",
        "The canonical registry source no longer exists.",
      );
    }
    sourceCanonical = sourceResolved;

    destinationResolved = await identities.realpathIfExists(
      destinationPath,
    );
    [sourceIdentity, destinationIdentity] = await Promise.all([
      identities.statIfExists(sourcePath),
      identities.statIfExists(destinationPath),
    ]);
  } catch (error) {
    if (error instanceof ObservatoryCollectorError) throw error;
    throw new ObservatoryCollectorError(
      "FILE_IDENTITY_FAILED",
      "Unable to verify that the local snapshot destination is distinct from the canonical source.",
    );
  }

  const sameCanonicalPath =
    destinationResolved !== undefined &&
    sourceCanonical === destinationResolved;
  const sameFileIdentity =
    sourceIdentity !== undefined &&
    destinationIdentity !== undefined &&
    String(sourceIdentity.device) === String(destinationIdentity.device) &&
    String(sourceIdentity.inode) === String(destinationIdentity.inode);
  if (sameCanonicalPath || sameFileIdentity) {
    throw new ObservatoryCollectorError(
      "SOURCE_WRITE_FORBIDDEN",
      "The local snapshot destination resolves to the canonical registry source.",
    );
  }

  try {
    const canonicalParent = await identities.realpathIfExists(
      dirname(destinationPath),
    );
    const destinationName = basename(destinationPath);
    if (!canonicalParent || !destinationName) {
      throw new ObservatoryCollectorError(
        "FILE_IDENTITY_FAILED",
        "The local snapshot destination parent cannot be resolved safely.",
      );
    }
    const pinnedDestination = join(canonicalParent, destinationName);
    if (sourceCanonical === pinnedDestination) {
      throw new ObservatoryCollectorError(
        "SOURCE_WRITE_FORBIDDEN",
        "The local snapshot destination resolves to the canonical registry source.",
      );
    }
    return pinnedDestination;
  } catch (error) {
    if (error instanceof ObservatoryCollectorError) throw error;
    throw new ObservatoryCollectorError(
      "FILE_IDENTITY_FAILED",
      "Unable to resolve the local snapshot destination parent safely.",
    );
  }
}

export async function collectAndWriteObservatorySnapshot(
  input: { registryPath: string; destinationPath: string },
  dependencies: CollectAndWriteDependencies,
): Promise<ObservatoryCollectionEnvelope> {
  const snapshot = await collectObservatorySnapshot(input, dependencies);
  await writeObservatorySnapshotWithSourceProtection(
    snapshot,
    input,
    dependencies,
  );
  return snapshot;
}

export async function writeObservatorySnapshotWithSourceProtection(
  snapshot: ObservatoryCollectionEnvelope,
  input: { registryPath: string; destinationPath: string },
  dependencies: Pick<
    CollectAndWriteDependencies,
    "files" | "identities" | "createTempPath"
  >,
): Promise<void> {
  const pinnedDestination = await resolveSafeDestinationPath(
    input.registryPath,
    input.destinationPath,
    dependencies.identities,
  );
  await writeObservatorySnapshotAtomically(
    snapshot,
    pinnedDestination,
    dependencies.files,
    dependencies.createTempPath,
    async () => {
      const revalidatedDestination = await resolveSafeDestinationPath(
        input.registryPath,
        input.destinationPath,
        dependencies.identities,
      );
      if (revalidatedDestination !== pinnedDestination) {
        throw new ObservatoryCollectorError(
          "FILE_IDENTITY_FAILED",
          "The local snapshot destination changed before atomic replacement.",
        );
      }
    },
  );
}
