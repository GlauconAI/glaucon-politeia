import {
  ObservatoryAssetSchema,
  ObservatoryRelationshipSchema,
  type ObservatoryAsset,
  type ObservatoryRelationship,
} from "#observatory-asset-schema";

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

function safeMetadataToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[a-z0-9][a-z0-9._+-]{0,127}$/iu.test(normalized)
    ? normalized
    : undefined;
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
    const description =
      typeof record?.description === "string"
        ? safeText(record.description, "")
        : "";
    const installSource = safeMetadataToken(record?.source);
    const version = safeMetadataToken(record?.version);
    const labels = [
      {
        key: "eligibility",
        value: disabled ? "disabled" : eligible ? "ready" : "missing",
      },
      ...(description
        ? [{ key: "description", value: description }]
        : []),
      ...(installSource
        ? [{ key: "install_source", value: installSource }]
        : []),
      ...(version ? [{ key: "version", value: version }] : []),
    ];
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
      summary:
        description ||
        (disabled ? "Disabled" : eligible ? "Ready" : "Requirements missing"),
      labels,
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

function safeNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function safeIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "number" && value < 0) return undefined;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function safeCronExpression(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, 160);
  return /^[a-z0-9*?,/\-#LW]+(?: [a-z0-9*?,/\-#LW]+){4,6}$/iu.test(
    normalized,
  )
    ? normalized
    : undefined;
}

function safeTimezone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 128);
  const segments = normalized.split("/");
  return /^[a-z0-9._+-]+(?:\/[a-z0-9._+-]+)*$/iu.test(normalized) &&
    segments.every((segment) => segment !== "." && segment !== "..")
    ? normalized
    : undefined;
}

function runtimeTarget(value: unknown): "isolated" | "main" | "session-bound" | "unknown" {
  if (value === "isolated") return "isolated";
  if (value === "main") return "main";
  if (value === "current") return "session-bound";
  if (typeof value === "string" && value.startsWith("session:")) {
    return "session-bound";
  }
  return "unknown";
}

function durationSummary(milliseconds: number): string {
  const units = [
    [86_400_000, "day"],
    [3_600_000, "hour"],
    [60_000, "minute"],
    [1_000, "second"],
  ] as const;
  const [unitMs, label] =
    units.find(([candidate]) => milliseconds >= candidate && milliseconds % candidate === 0) ??
    ([1, "millisecond"] as const);
  const value = Math.max(1, Math.round(milliseconds / unitMs));
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function cronScheduleSummary(schedule: UnknownRecord | undefined): {
  kind: string;
  summary: string;
  value?: { key: string; value: string };
  timezone?: string;
} {
  const kind = safeText(schedule?.kind, "unknown").toLocaleLowerCase();
  if (kind === "every") {
    const everyMs = safeNonNegativeInteger(schedule?.everyMs);
    if (everyMs !== undefined && everyMs > 0) {
      return {
        kind,
        summary: `Every ${durationSummary(everyMs)}`,
        value: { key: "schedule_interval_ms", value: String(everyMs) },
      };
    }
  }
  if (kind === "cron") {
    const expression = safeCronExpression(schedule?.expr);
    const timezone = safeTimezone(schedule?.tz);
    return {
      kind,
      summary: expression ? `Cron · ${expression}` : "Cron schedule",
      ...(expression
        ? { value: { key: "schedule_expression", value: expression } }
        : {}),
      ...(timezone ? { timezone } : {}),
    };
  }
  if (kind === "at") {
    const at = safeIsoTimestamp(schedule?.at);
    return {
      kind,
      summary: at ? `Once · ${at}` : "One-time schedule",
      ...(at ? { value: { key: "schedule_at", value: at } } : {}),
    };
  }
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
    const enabled = boolean(record?.enabled);
    const lastStatus = logicalToken(
      state?.lastStatus ?? state?.lastRunStatus ?? record?.lastRunStatus,
      "unknown",
    );
    const consecutiveErrors = safeNonNegativeInteger(
      state?.consecutiveErrors ?? record?.consecutiveErrors,
    );
    const lastRunAt = safeIsoTimestamp(
      state?.lastRunAtMs ?? record?.lastRunAtMs,
    );
    const nextRunAt = safeIsoTimestamp(
      state?.nextRunAtMs ?? record?.nextRunAtMs,
    );
    const failed = ["failed", "error", "timed-out", "lost"].includes(lastStatus);
    const health: ObservatoryAsset["health"] =
      enabled === false
        ? "disabled"
        : failed
          ? "failed"
          : consecutiveErrors && consecutiveErrors > 0
            ? "degraded"
            : enabled !== true || lastStatus === "unknown"
              ? "unknown"
              : "healthy";
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
      health,
      summary: schedule.summary,
      labels: [
        { key: "schedule_type", value: schedule.kind },
        {
          key: "enabled",
          value:
            enabled === true
              ? "enabled"
              : enabled === false
                ? "disabled"
                : "unknown",
        },
        ...(schedule.value ? [schedule.value] : []),
        ...(schedule.timezone
          ? [{ key: "timezone", value: schedule.timezone }]
          : []),
        { key: "last_status", value: lastStatus },
        ...(lastRunAt ? [{ key: "last_run_at", value: lastRunAt }] : []),
        ...(nextRunAt ? [{ key: "next_run_at", value: nextRunAt }] : []),
        ...(consecutiveErrors !== undefined
          ? [{ key: "consecutive_errors", value: String(consecutiveErrors) }]
          : []),
        { key: "runtime_target", value: runtimeTarget(record?.sessionTarget) },
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
