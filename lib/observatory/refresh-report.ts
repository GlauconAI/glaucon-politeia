type ReportCategory =
  | "projects"
  | "skills"
  | "agents"
  | "tools"
  | "repositories"
  | "profiles"
  | "rules"
  | "configs"
  | "knowledge"
  | "agendas"
  | "crons"
  | "gateways"
  | "runtimes";

interface ReportEntity {
  id: string;
  label: string;
}

interface SnapshotLike {
  registry?: {
    project_groups?: Array<{
      projects?: Array<{
        project_key?: string;
        name?: string;
        title?: string;
      }>;
    }>;
  };
  agents?: Array<{ id?: string; display_name?: string }>;
  assets?: Array<{
    id?: string;
    kind?: string;
    name?: string;
    owner?: string;
  }>;
  relationships?: unknown[];
}

export interface ObservatoryRefreshReport {
  version: 1;
  status: "success";
  completed_at: string;
  duration_ms: number;
  baseline_created: boolean;
  totals: {
    projects: number;
    skills: number;
    agents: number;
    tools: number;
    repositories: number;
    assets: number;
    relationships: number;
  };
  changes: Record<ReportCategory, { added: string[]; removed: string[] }>;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  projects: "Project",
  skills: "Skill",
  agents: "Agent",
  tools: "Tool",
  repositories: "Repository",
  profiles: "Profile",
  rules: "Rule",
  configs: "Config",
  knowledge: "Knowledge",
  agendas: "Agenda",
  crons: "Cron",
  gateways: "Gateway",
  runtimes: "Runtime",
};

function safeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/gu, " ").trim();
  if (!normalized) return fallback;
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}…`;
}

function snapshotEntities(
  input: unknown,
): Record<ReportCategory, ReportEntity[]> {
  const snapshot = (input ?? {}) as SnapshotLike;
  const projects = (snapshot.registry?.project_groups ?? []).flatMap((group) =>
    (group.projects ?? []).flatMap((project) => {
      if (typeof project.project_key !== "string") return [];
      const name = safeLabel(project.title ?? project.name, project.project_key);
      return [{ id: project.project_key, label: `${name} (${project.project_key})` }];
    }),
  );
  const agents = (snapshot.agents ?? []).flatMap((agent) => {
    if (typeof agent.id !== "string") return [];
    return [{ id: agent.id, label: safeLabel(agent.display_name, agent.id) }];
  });
  const assets = snapshot.assets ?? [];
  const assetsByKind = (kind: string): ReportEntity[] =>
    assets.flatMap((asset) => {
      if (asset.kind !== kind || typeof asset.id !== "string") return [];
      const name = safeLabel(asset.name, asset.id);
      const owner = safeLabel(asset.owner, "");
      const label = kind === "repository" || !owner ? name : `${owner}/${name}`;
      return [{ id: asset.id, label }];
    });
  return {
    projects,
    skills: assetsByKind("skill"),
    agents,
    tools: assetsByKind("tool"),
    repositories: assetsByKind("repository"),
    profiles: assetsByKind("profile"),
    rules: assetsByKind("rule"),
    configs: assetsByKind("config"),
    knowledge: assetsByKind("knowledge"),
    agendas: assetsByKind("agenda"),
    crons: assetsByKind("cron"),
    gateways: assetsByKind("gateway"),
    runtimes: assetsByKind("runtime"),
  };
}

function diffEntities(
  previous: ReportEntity[],
  current: ReportEntity[],
): { added: string[]; removed: string[] } {
  const before = new Map(previous.map((entity) => [entity.id, entity.label]));
  const after = new Map(current.map((entity) => [entity.id, entity.label]));
  return {
    added: [...after]
      .filter(([id]) => !before.has(id))
      .map(([, label]) => label)
      .sort((left, right) => left.localeCompare(right)),
    removed: [...before]
      .filter(([id]) => !after.has(id))
      .map(([, label]) => label)
      .sort((left, right) => left.localeCompare(right)),
  };
}

function requireTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new TypeError("Refresh report timestamps must be canonical ISO timestamps.");
  }
  return value;
}

export function createObservatoryRefreshReport(
  previousSnapshot: unknown | null,
  currentSnapshot: unknown,
  completedAt: string,
  durationMs: number,
): ObservatoryRefreshReport {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new TypeError("Refresh report duration must be a non-negative integer.");
  }
  const current = snapshotEntities(currentSnapshot);
  const previous = snapshotEntities(previousSnapshot);
  const snapshot = (currentSnapshot ?? {}) as SnapshotLike;
  const changes = Object.fromEntries(
    (Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((category) => [
      category,
      previousSnapshot === null
        ? { added: [], removed: [] }
        : diffEntities(previous[category], current[category]),
    ]),
  ) as ObservatoryRefreshReport["changes"];
  return {
    version: 1,
    status: "success",
    completed_at: requireTimestamp(completedAt),
    duration_ms: durationMs,
    baseline_created: previousSnapshot === null,
    totals: {
      projects: current.projects.length,
      skills: current.skills.length,
      agents: current.agents.length,
      tools: current.tools.length,
      repositories: current.repositories.length,
      assets: snapshot.assets?.length ?? 0,
      relationships: snapshot.relationships?.length ?? 0,
    },
    changes,
  };
}

function localTimestamp(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function durationLabel(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

function itemSummary(items: string[]): string {
  const visible = items.slice(0, 8);
  const remainder = items.length - visible.length;
  return `${visible.join("、")}${remainder > 0 ? `，另有 ${remainder} 项` : ""}`;
}

export function formatObservatoryRefreshSuccessMessage(
  report: ObservatoryRefreshReport,
  options: { recovered: boolean; retentionOk: boolean },
): string {
  const changeLines = (Object.keys(CATEGORY_LABELS) as ReportCategory[]).flatMap(
    (category) => {
      const change = report.changes[category];
      if (change.added.length === 0 && change.removed.length === 0) return [];
      const details = [
        change.added.length > 0 ? `新增 ${itemSummary(change.added)}` : "",
        change.removed.length > 0 ? `删除 ${itemSummary(change.removed)}` : "",
      ].filter(Boolean);
      return [`• ${CATEGORY_LABELS[category]}：${details.join("；")}`];
    },
  );
  const changes = report.baseline_created
    ? "首次建立对比基线，本次不报告新增和删除"
    : changeLines.length > 0
      ? changeLines.join("\n")
      : "本次未发现受监控资产的新增和删除";
  const status = options.recovered
    ? "已恢复，Dashboard 已使用最新信息"
    : "更新成功，Dashboard 已使用最新信息";
  return [
    "Dashboard 每日更新完成",
    `时间：${localTimestamp(report.completed_at)}（Vancouver）`,
    `状态：${status}`,
    `耗时：${durationLabel(report.duration_ms)}`,
    "",
    "本次变化",
    changes,
    "",
    "当前规模",
    `• Project ${report.totals.projects} · Skill ${report.totals.skills} · Agent ${report.totals.agents} · Tool ${report.totals.tools} · Repository ${report.totals.repositories}`,
    `• 资产 ${report.totals.assets} · 关系 ${report.totals.relationships}`,
    `历史 Snapshot 保留：${options.retentionOk ? "正常" : "异常"}`,
  ].join("\n");
}

export function redactObservatoryDiagnostic(input: string): string {
  return input
    .slice(0, 16_384)
    .replace(/(Bearer\s+)[^\s]+/giu, "$1[REDACTED]")
    .replace(
      /((?:SUPABASE_)?(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY)[A-Z0-9_]*\s*[:=]\s*)[^\s]+/giu,
      "$1[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/giu, "$1[REDACTED]@");
}

export function formatObservatoryRefreshFailureMessage(input: {
  failedAt: string;
  stage: "collect" | "publish" | "orchestration";
  failureCode: string;
  diagnosticFile: string;
}): string {
  const stageLabel = {
    collect: "信息采集",
    publish: "发布到 Dashboard 数据库",
    orchestration: "刷新流程",
  }[input.stage];
  return [
    "Dashboard 每日更新未完成",
    `时间：${localTimestamp(requireTimestamp(input.failedAt))}（Vancouver）`,
    "状态：刷新失败，Dashboard 继续使用上一份有效数据",
    `阶段：${stageLabel}`,
    `错误代码：${input.failureCode}`,
    `诊断日志：${safeLabel(input.diagnosticFile, "未生成")}`,
    "后续：保留错误记录，下一次按日程自动重试",
  ].join("\n");
}
