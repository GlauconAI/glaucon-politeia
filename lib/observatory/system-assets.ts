import {
  ObservatoryAssetSchema,
  ObservatoryRelationshipSchema,
  type ObservatoryAsset,
  type ObservatoryRelationship,
} from "@/lib/observatory/asset-schema";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function collection(value: unknown, key: string): unknown[] {
  const record = asRecord(value);
  const candidate = record?.[key];
  if (!Array.isArray(candidate)) {
    throw new Error(`Expected an ${key} array from the OpenClaw command.`);
  }
  return candidate;
}

function safeText(value: unknown, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .trim()
    .slice(0, 512);
  return normalized || fallback;
}

function logicalToken(value: unknown, fallback: string): string {
  const normalized = safeText(value, fallback)
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 160);
  return normalized || fallback;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asset(value: unknown): ObservatoryAsset {
  return ObservatoryAssetSchema.parse(value);
}

function relationship(value: unknown): ObservatoryRelationship {
  return ObservatoryRelationshipSchema.parse(value);
}

export function projectSkillAssets(
  agentId: string,
  candidate: unknown,
  collectedAt: string,
): { assets: ObservatoryAsset[]; relationships: ObservatoryRelationship[] } {
  const owner = logicalToken(agentId, "unknown-agent");
  const assets = collection(candidate, "skills").map((entry, index) => {
    const record = asRecord(entry);
    const name = safeText(record?.name ?? record?.id, `skill-${index + 1}`);
    const id = logicalToken(record?.id ?? name, `skill-${index + 1}`);
    const eligible =
      boolean(record?.eligible) ??
      boolean(record?.ready) ??
      (safeText(record?.status, "").toLocaleLowerCase() === "ready");
    const disabled = boolean(record?.disabled) === true;
    return asset({
      id: `skill:${owner}:${id}`,
      kind: "skill",
      name,
      owner,
      authority: "observed",
      source: "openclaw/skills-list",
      collected_at: collectedAt,
      freshness: "fresh",
      health: disabled ? "disabled" : eligible ? "healthy" : "degraded",
      summary: disabled ? "Disabled" : eligible ? "Ready" : "Requirements missing",
      labels: [
        {
          key: "eligibility",
          value: disabled ? "disabled" : eligible ? "ready" : "missing",
        },
      ],
    });
  });
  assets.sort((left, right) => left.id.localeCompare(right.id));
  return {
    assets,
    relationships: assets.map((skill) =>
      relationship({
        from: `agent:${owner}`,
        to: skill.id,
        kind: "exposes",
        authority: "observed",
        source: "openclaw/skills-list",
      }),
    ),
  };
}

export function projectPluginAssets(
  candidate: unknown,
  collectedAt: string,
): ObservatoryAsset[] {
  return collection(candidate, "plugins")
    .map((entry, index) => {
      const record = asRecord(entry);
      const name = safeText(record?.name ?? record?.id, `plugin-${index + 1}`);
      const id = logicalToken(record?.id ?? name, `plugin-${index + 1}`);
      const enabled = boolean(record?.enabled) !== false;
      const status = safeText(record?.status, enabled ? "unknown" : "disabled")
        .toLocaleLowerCase();
      const failed = ["failed", "error", "invalid"].includes(status);
      const healthy = ["loaded", "ready", "enabled", "active"].includes(status);
      return asset({
        id: `tool:${id}`,
        kind: "tool",
        name,
        owner: "OpenClaw",
        authority: "observed",
        source: "openclaw/plugins-list",
        collected_at: collectedAt,
        freshness: "fresh",
        health: !enabled
          ? "disabled"
          : failed
            ? "failed"
            : healthy
              ? "healthy"
              : "unknown",
        summary: !enabled
          ? "Disabled"
          : failed
            ? "Failed"
            : healthy
              ? "Loaded"
              : "Status unknown",
        labels: [{ key: "status", value: status || "unknown" }],
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function cronScheduleSummary(schedule: UnknownRecord | undefined): {
  kind: string;
  summary: string;
} {
  const kind = safeText(schedule?.kind, "unknown").toLocaleLowerCase();
  if (kind === "every" && typeof schedule?.everyMs === "number") {
    const minutes = Math.max(1, Math.round(schedule.everyMs / 60_000));
    return { kind, summary: `Every ${minutes} minute${minutes === 1 ? "" : "s"}` };
  }
  if (kind === "cron") return { kind, summary: "Cron schedule" };
  if (kind === "at") return { kind, summary: "One-time schedule" };
  return { kind: "unknown", summary: "Schedule unknown" };
}

export function projectCronAssets(
  candidate: unknown,
  collectedAt: string,
): { assets: ObservatoryAsset[]; relationships: ObservatoryRelationship[] } {
  const pairs = collection(candidate, "jobs").map((entry, index) => {
    const record = asRecord(entry);
    const state = asRecord(record?.state);
    const rawId = safeText(record?.id ?? record?.jobId, `job-${index + 1}`);
    const id = logicalToken(rawId, `job-${index + 1}`);
    const owner = logicalToken(record?.agentId, "unassigned");
    const enabled = boolean(record?.enabled) !== false;
    const lastStatus = logicalToken(state?.lastStatus, "unknown");
    const failed = ["failed", "error", "timed-out", "lost"].includes(lastStatus);
    const schedule = cronScheduleSummary(asRecord(record?.schedule));
    const cronAsset = asset({
      id: `cron:${id}`,
      kind: "cron",
      name: safeText(record?.name, rawId),
      owner,
      authority: "observed",
      source: "openclaw/cron-list",
      collected_at: collectedAt,
      freshness: "fresh",
      health: !enabled ? "disabled" : failed ? "failed" : "healthy",
      summary: schedule.summary,
      labels: [
        { key: "schedule", value: schedule.kind },
        { key: "last_status", value: lastStatus },
      ],
    });
    return {
      asset: cronAsset,
      relationship:
        owner === "unassigned"
          ? undefined
          : relationship({
              from: cronAsset.id,
              to: `agent:${owner}`,
              kind: "runs-as",
              authority: "observed",
              source: "openclaw/cron-list",
            }),
    };
  });
  pairs.sort((left, right) => left.asset.id.localeCompare(right.asset.id));
  return {
    assets: pairs.map((pair) => pair.asset),
    relationships: pairs.flatMap((pair) =>
      pair.relationship ? [pair.relationship] : [],
    ),
  };
}

export function projectGatewayAssets(
  candidate: unknown,
  collectedAt: string,
): ObservatoryAsset[] {
  const root = asRecord(candidate);
  if (!root) throw new Error("Expected a Gateway status object.");
  const service = asRecord(root.service ?? root.gatewayService);
  const runtime = asRecord(service?.runtime);
  const rpc = asRecord(root.rpc ?? root.probe);
  const status = safeText(runtime?.status ?? service?.status, "unknown")
    .trim()
    .toLocaleLowerCase();
  const running = status === "running";
  const reachable = boolean(rpc?.ok) ?? boolean(root.reachable) ?? false;
  const health = running && reachable ? "healthy" : running ? "degraded" : "failed";
  return [
    asset({
      id: "gateway:openclaw",
      kind: "gateway",
      name: "OpenClaw Gateway",
      owner: "OpenClaw",
      authority: "observed",
      source: "openclaw/gateway-status",
      collected_at: collectedAt,
      freshness: "fresh",
      health,
      summary:
        running && reachable
          ? "Running and reachable"
          : running
            ? "Running but unreachable"
            : "Not running",
      labels: [
        { key: "service", value: running ? "running" : "stopped" },
        { key: "rpc", value: reachable ? "reachable" : "unreachable" },
      ],
    }),
  ];
}
