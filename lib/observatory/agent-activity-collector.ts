import { createHash } from "node:crypto";

import {
  OBSERVATORY_AGENT_ACTIVITY_MAX_GROUPS,
  ObservatoryAgentActivitySnapshotSchema,
  type ObservatoryActivityValueSource,
  type ObservatoryAgentActivityRow,
  type ObservatoryAgentActivitySnapshot,
} from "#observatory-agent-activity-schema";
import { scanObservatoryPrivacy } from "#observatory-privacy-scan";
import type {
  CommandInvocation,
  CommandResult,
} from "#observatory-collector";
import type { ObservatoryAgent } from "#observatory-collection-schema";

const ACTIVITY_STDOUT_MAX_BYTES = 5 * 1024 * 1024;
const ACTIVITY_LIMIT = 500;
const UNKNOWN_VALUE = "unknown";

type UnknownRecord = Record<string, unknown>;

export type AgentActivityCommandRunner = (
  invocation: CommandInvocation,
) => Promise<CommandResult>;

interface AgentActivityDependencies {
  runCommand: AgentActivityCommandRunner;
  now(): Date;
  commandTimeoutMs?: number;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

function safeJson(result: CommandResult | undefined): unknown | undefined {
  if (
    !result ||
    result.exitCode !== 0 ||
    result.timedOut ||
    result.outputLimitExceeded ||
    Buffer.byteLength(result.stdout, "utf8") > ACTIVITY_STDOUT_MAX_BYTES
  ) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

async function runOptional(
  runCommand: AgentActivityCommandRunner,
  args: readonly string[],
  timeoutMs: number,
): Promise<unknown | undefined> {
  try {
    return safeJson(
      await runCommand({ command: "openclaw", args, timeoutMs }),
    );
  } catch {
    return undefined;
  }
}

function configuredThinking(candidate: unknown): Map<string, string | null> | undefined {
  const root = asRecord(candidate);
  const defaults = asRecord(root?.defaults);
  const entries = root?.entries;
  if (!root || !Array.isArray(entries)) return undefined;
  const fallback = firstString(defaults?.thinkingDefault) ?? null;
  const result = new Map<string, string | null>();
  for (const value of entries) {
    const entry = asRecord(value);
    const id = firstString(entry?.id);
    if (!entry || !id) continue;
    result.set(id, firstString(entry.thinkingDefault) ?? fallback);
  }
  return result;
}

function activityEntries(candidate: unknown): UnknownRecord[] | undefined {
  const root = asRecord(candidate);
  if (!root || !Array.isArray(root.sessions)) return undefined;
  return root.sessions.flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
}

function normalizedModel(record: UnknownRecord): string {
  const model = firstString(record.model, record.selectedModel, record.configuredModel);
  if (!model) return UNKNOWN_VALUE;
  if (model.includes("/")) return model;
  const provider = firstString(record.modelProvider);
  return provider ? `${provider}/${model}` : model;
}

function updatedAt(record: UnknownRecord): string | undefined {
  const candidate = record.updatedAt ?? record.updated_at;
  const date =
    typeof candidate === "number" && Number.isFinite(candidate)
      ? new Date(candidate)
      : typeof candidate === "string"
        ? new Date(candidate)
        : undefined;
  return date && Number.isFinite(date.valueOf()) ? date.toISOString() : undefined;
}

function normalizedState(record: UnknownRecord): ObservatoryAgentActivityRow["run_state"] {
  if (record.hasActiveRun === true) return "running";
  const status = firstString(record.status)?.toLocaleLowerCase() ?? "";
  if (status.includes("run") || status === "active") return "running";
  if (status.includes("queue") || status.includes("pending")) return "queued";
  if (status.includes("fail") || status.includes("error")) return "failed";
  if (status.includes("done") || status.includes("complete") || status.includes("success")) {
    return "done";
  }
  return "unknown";
}

function safeGroupLabel(value: unknown): string {
  const candidate =
    typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim()
      : "";
  if (!candidate || candidate.length > 256 || /\bid\s*:\s*\d+/iu.test(candidate)) {
    return "Telegram group";
  }
  const privacy = scanObservatoryPrivacy(candidate);
  return Object.values(privacy).some((count) => count > 0)
    ? "Telegram group"
    : candidate;
}

function activityIdentity(record: UnknownRecord, fallback: string): string {
  const internal = firstString(record.key) ?? fallback;
  return createHash("sha256").update(`observatory-agent-activity:${internal}`).digest("hex");
}

function valueSources(
  record: UnknownRecord,
  model: string,
  defaultModel: string,
  defaultThinking: string | null,
): {
  modelSource: ObservatoryActivityValueSource;
  thinking: string;
  thinkingSource: ObservatoryActivityValueSource;
} {
  const explicitThinking = firstString(record.thinkingLevel);
  const inheritedThinking = firstString(record.thinkingDefault) ?? defaultThinking;
  const thinking = explicitThinking ?? inheritedThinking ?? UNKNOWN_VALUE;
  return {
    modelSource:
      model === UNKNOWN_VALUE
        ? "unknown"
        : model === defaultModel
          ? "configured"
          : "override",
    thinking,
    thinkingSource: explicitThinking
      ? explicitThinking === defaultThinking
        ? "configured"
        : "override"
      : inheritedThinking
        ? "inherited"
        : "unknown",
  };
}

function toRow(
  record: UnknownRecord,
  options: {
    label: string;
    fallbackIdentity: string;
    defaultModel: string;
    defaultThinking: string | null;
  },
): ObservatoryAgentActivityRow | undefined {
  const timestamp = updatedAt(record);
  if (!timestamp) return undefined;
  const model = normalizedModel(record);
  const sources = valueSources(
    record,
    model,
    options.defaultModel,
    options.defaultThinking,
  );
  return {
    identity: activityIdentity(record, options.fallbackIdentity),
    label: options.label,
    model_label: model,
    model_source: sources.modelSource,
    thinking_level: sources.thinking,
    thinking_source: sources.thinkingSource,
    run_state: normalizedState(record),
    active: record.hasActiveRun === true,
    updated_at: timestamp,
  };
}

export async function collectAgentActivity(
  input: { agents: readonly ObservatoryAgent[] },
  dependencies: AgentActivityDependencies,
): Promise<ObservatoryAgentActivitySnapshot> {
  const timeoutMs = dependencies.commandTimeoutMs ?? 30_000;
  const [configCandidate, activityCandidate] = await Promise.all([
    runOptional(
      dependencies.runCommand,
      ["config", "get", "agents", "--json"],
      timeoutMs,
    ),
    runOptional(
      dependencies.runCommand,
      [
        "gateway",
        "call",
        "sessions.list",
        "--json",
        "--params",
        JSON.stringify({ limit: ACTIVITY_LIMIT }),
      ],
      timeoutMs,
    ),
  ]);
  const thinkingByAgent = configuredThinking(configCandidate);
  const activities = activityEntries(activityCandidate);
  const allowedAgentIds = new Set(input.agents.map((agent) => agent.id));
  const filteredActivities = (activities ?? []).filter(
    (record) => allowedAgentIds.has(firstString(record.agentId) ?? ""),
  );
  const status =
    thinkingByAgent && activities
      ? "ready"
      : thinkingByAgent || activities
        ? "partial"
        : "unavailable";

  const agents = [...input.agents]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((agent) => {
      const defaultThinking = thinkingByAgent?.get(agent.id) ?? null;
      const own = filteredActivities.filter(
        (record) => firstString(record.agentId) === agent.id,
      );
      const directCandidates = own
        .filter(
          (record) =>
            firstString(record.kind) === "direct" &&
            firstString(record.channel) === "telegram" &&
            (record.chatType === undefined || firstString(record.chatType) === "direct"),
        )
        .flatMap((record) => {
          const row = toRow(record, {
            label: "Telegram Direct",
            fallbackIdentity: `${agent.id}:direct`,
            defaultModel: agent.model_label,
            defaultThinking,
          });
          return row ? [row] : [];
        })
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at));

      const groupRecords = own.filter(
        (record) =>
          firstString(record.kind) === "group" &&
          firstString(record.channel) === "telegram",
      );
      const latestGroups = new Map<string, UnknownRecord>();
      for (const record of groupRecords) {
        const label = safeGroupLabel(record.displayName);
        const key = firstString(record.key) ?? `${agent.id}:${label}`;
        const prior = latestGroups.get(key);
        if (!prior || (updatedAt(record) ?? "") > (updatedAt(prior) ?? "")) {
          latestGroups.set(key, record);
        }
      }
      const telegramGroups = [...latestGroups.entries()]
        .flatMap(([key, record]) => {
          const row = toRow(record, {
            label: safeGroupLabel(record.displayName),
            fallbackIdentity: key,
            defaultModel: agent.model_label,
            defaultThinking,
          });
          return row ? [row] : [];
        })
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, OBSERVATORY_AGENT_ACTIVITY_MAX_GROUPS);

      return {
        agent_id: agent.id,
        default_thinking_level: defaultThinking,
        latest_direct: directCandidates[0] ?? null,
        telegram_groups: telegramGroups,
      };
    });

  return ObservatoryAgentActivitySnapshotSchema.parse({
    status,
    collected_at: dependencies.now().toISOString(),
    agents,
  });
}
