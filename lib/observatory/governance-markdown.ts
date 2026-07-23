import { createHash } from "node:crypto";

import {
  DeliveryGovernanceSchema,
  GOVERNANCE_MAX_EVIDENCE_LENGTH,
  GOVERNANCE_MAX_TEXT_LENGTH,
  GOVERNANCE_SOURCE_FILES,
  summarizeDeliveryGovernance,
  type DeliveryGovernance,
  type GovernanceStatusCategory,
} from "#observatory-governance-schema";

export type DashboardGovernanceSources = {
  readme: string;
  baseline: string;
  tracker: string;
  calibration: string;
};

type Row = Record<string, string>;
type Table = { header: string[]; rows: Row[]; start: number };

export class GovernanceProjectionError extends Error {
  readonly code = "GOVERNANCE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "GovernanceProjectionError";
  }
}

function splitRow(line: string): string[] {
  const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  let wikiDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (char === "`") inCode = !inCode;
    if (!inCode && char === "[" && next === "[") {
      wikiDepth += 1;
      cell += "[[";
      index += 1;
      continue;
    }
    if (!inCode && char === "]" && next === "]" && wikiDepth > 0) {
      wikiDepth -= 1;
      cell += "]]";
      index += 1;
      continue;
    }
    if (char === "|" && !inCode && wikiDepth === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function isSeparator(line: string): boolean {
  return splitRow(line).every((value) => /^:?-{3,}:?$/.test(value));
}

function tables(markdown: string): Table[] {
  const lines = markdown.split(/\r?\n/);
  const result: Table[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|") || !isSeparator(lines[index + 1])) {
      continue;
    }
    const header = splitRow(lines[index]);
    const rows: Row[] = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
      const cells = splitRow(lines[cursor]);
      if (cells.length !== header.length) {
        throw new GovernanceProjectionError("A governance table row has drifted.");
      }
      rows.push(Object.fromEntries(header.map((key, cell) => [key, cells[cell]])));
      cursor += 1;
    }
    result.push({ header, rows, start: index });
    index = cursor - 1;
  }
  return result;
}

function requireTable(
  markdown: string,
  requiredHeader: readonly string[],
): Table {
  const match = tables(markdown).find((table) =>
    requiredHeader.every((header) => table.header.includes(header)),
  );
  if (!match) {
    throw new GovernanceProjectionError(
      `Required governance table is missing: ${requiredHeader.join(", ")}.`,
    );
  }
  return match;
}

function safeText(input: string, max = GOVERNANCE_MAX_TEXT_LENGTH): string {
  const withoutWiki = input.replace(
    /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
    (_match, target: string, label: string | undefined) => label || target,
  );
  const withoutLinks = withoutWiki.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const withoutCode = withoutLinks.replace(/`([^`]+)`/g, "$1");
  const withoutPrivate = withoutCode
    .replace(
      /(?:\/Users\/|[A-Za-z]:\\|\\\\)[^\s；。，,;]+/g,
      "[private-path]",
    )
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, "[private-email]")
    .replace(/https?:\/\/[^\s；。，,;]+/g, "[external-link]")
    .replace(/\b(?:token|password|secret|api[_-]?key)\s*[=:]\s*\S+/gi, "[secret]");
  const normalized = withoutPrivate
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, max) || "Not recorded";
}

function statusCategory(label: string): GovernanceStatusCategory {
  if (/at risk|risk|风险/i.test(label)) return "at_risk";
  if (/blocked|阻塞/i.test(label)) return "blocked";
  if (/partial|部分/i.test(label)) return "partial";
  if (/accepted/i.test(label)) return "accepted";
  if (/active|progress|执行中/i.test(label)) return "active";
  if (/done|passed|complete|closed|完成/i.test(label)) return "done";
  if (/planned|next|pending|计划/i.test(label)) return "planned";
  return "unknown";
}

function dateFact(input: string): string {
  const value = input.trim();
  if (!value || /^(?:TBD|—|-|Unavailable|N\/A|Not recorded)$/i.test(value)) {
    return "not_recorded";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return value;
  }
  const local = value.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s+(PDT|PST)$/,
  );
  if (local) {
    return `${local[1]}T${local[2]}${local[3] === "PDT" ? "-07:00" : "-08:00"}`;
  }
  return "not_recorded";
}

function idAndName(input: string): [string, string] {
  const [id, ...name] = input.split("｜");
  return [safeText(id), safeText(name.join("｜") || id)];
}

function milestoneId(input: string): string {
  const [raw] = input.split("｜");
  return /^M\d+$/i.test(raw.trim())
    ? raw.trim().toUpperCase()
    : raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function contract(input: string): { id: string; type: DeliveryGovernance["features"][number]["contract_type"] } {
  const match = input.match(
    /\b(EC-(?:F|T)\d+)\b\s*[·-]\s*(GOV-DOC|IMPLEMENT|VERIFY|UX|OPS)\b/,
  );
  if (!match) {
    throw new GovernanceProjectionError("An Execution Contract has drifted.");
  }
  return {
    id: match[1],
    type: match[2] as DeliveryGovernance["features"][number]["contract_type"],
  };
}

function hours(input: string): number {
  const parsed = Number.parseFloat(input.replace(/h$/i, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new GovernanceProjectionError("An estimate is malformed.");
  }
  return parsed;
}

function evidenceRefs(input = ""): string[] {
  if (!input.trim()) return [];
  const safe = safeText(input, GOVERNANCE_MAX_EVIDENCE_LENGTH);
  if (safe === "Not recorded") return [];
  return [safe];
}

function headingBefore(markdown: string, lineIndex: number): string {
  const lines = markdown.split(/\r?\n/);
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const match = lines[index].match(/^####\s+(OBS-F\d+)(?:｜(.+))?/);
    if (match) return match[1];
  }
  throw new GovernanceProjectionError("A Task table has no parent Feature heading.");
}

function field(markdown: string, name: string): string | undefined {
  const bullet = markdown.match(
    new RegExp(`^-\\s*${name}\\s*:\\s*(.+)$`, "imu"),
  )?.[1];
  return bullet ? safeText(bullet) : undefined;
}

function featureGateRequirements(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  let featureId: string | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^####\s+(OBS-F\d+)(?:｜.+)?\s*$/);
    if (heading) {
      featureId = heading[1];
      continue;
    }
    if (!featureId) continue;
    const gate = line.match(/^Gate(?:\s+requirement)?[：:]\s*(.+)$/i);
    if (gate) {
      result.set(featureId, safeText(gate[1]));
      featureId = undefined;
    }
  }

  return result;
}

export function projectDashboardGovernance(
  sources: DashboardGovernanceSources,
  options: { collectedAt: string },
): DeliveryGovernance {
  const featureTable = requireTable(sources.baseline, [
    "Feature",
    "Milestone",
    "Execution Contract",
    "Status",
  ]);
  const milestoneTable = requireTable(sources.tracker, [
    "Milestone",
    "Accountable Owner",
    "Status",
    "Gate Evidence",
  ]);
  const riskTable = requireTable(sources.tracker, ["ID", "风险", "影响", "状态", "缓解"]);
  const dependencyTable = requireTable(sources.tracker, [
    "Dependency",
    "Owner",
    "Needed By",
    "Status",
  ]);
  const revisionTable = requireTable(sources.tracker, [
    "Version",
    "日期",
    "类型",
    "变更",
    "批准",
  ]);
  const runTable = requireTable(sources.calibration, [
    "Run ID",
    "Functional Role",
    "Sequence",
    "Start",
    "Finish",
    "Active Time",
  ]);
  const gateRequirements = featureGateRequirements(sources.baseline);

  const featureRows = featureTable.rows.map((row) => {
    const [id, name] = idAndName(row.Feature);
    const execution = contract(row["Execution Contract"]);
    return {
      id,
      milestone_id: milestoneId(row.Milestone),
      name,
      scope: safeText(row.Scope || "Not recorded"),
      status_label: safeText(row.Status),
      status_category: statusCategory(row.Status),
      contract_id: execution.id,
      contract_type: execution.type,
      estimate_hours: hours(row.Estimate),
      confidence: safeText(row.Confidence) as "Low" | "Medium" | "High",
      baseline_finish: dateFact(row["Baseline Finish"]),
      forecast_finish: dateFact(row["Forecast Finish"]),
      actual_finish: dateFact(row["Actual Finish"] || ""),
      gate_requirement: gateRequirements.get(id) || "",
      source: "dashboard/development-baseline.md" as const,
    };
  });

  const taskTables = tables(sources.baseline).filter((table) =>
    ["Task", "Execution Contract", "Estimate", "Status"].every((header) =>
      table.header.includes(header),
    ),
  );
  const tasks = taskTables.flatMap((table) => {
    const featureId = headingBefore(sources.baseline, table.start);
    return table.rows.map((row) => {
      const [id, name] = idAndName(row.Task);
      const execution = contract(row["Execution Contract"]);
      return {
        id,
        feature_id: featureId,
        name,
        status_label: safeText(row.Status),
        status_category: statusCategory(row.Status),
        contract_id: execution.id,
        contract_type: execution.type,
        estimate_hours: hours(row.Estimate),
        confidence: safeText(row.Confidence) as "Low" | "Medium" | "High",
        forecast_finish: dateFact(row["Forecast Finish"]),
        actual_start: dateFact(row["Actual Start"] || ""),
        actual_finish: dateFact(row["Actual Finish"] || ""),
        evidence_refs: evidenceRefs(row.Evidence),
        source: "dashboard/development-baseline.md" as const,
      };
    });
  });

  const milestones = milestoneTable.rows.map((row) => {
    const [rawId, name] = idAndName(row.Milestone);
    const id = milestoneId(rawId);
    return {
      id,
      name,
      status_label: safeText(row.Status),
      status_category: statusCategory(row.Status),
      forecast: dateFact(row.Forecast),
      variance: safeText(row.Variance || "not_recorded"),
      feature_ids: featureRows
        .filter((feature) => feature.milestone_id === id)
        .map((feature) => feature.id)
        .sort(),
      evidence_refs: evidenceRefs(row["Gate Evidence"]),
      source: "dashboard/edad-tracker.md" as const,
    };
  });

  const executorRuns = runTable.rows.map((row) => ({
    id: safeText(row["Run ID"]),
    task_ref: safeText(row["Task ID"] || row["Task / Bundle"]),
    functional_role: safeText(row["Functional Role"]),
    sequence: Number.parseInt(row.Sequence, 10),
    started_at: dateFact(row.Start),
    finished_at: dateFact(row.Finish),
    active_time: safeText(row["Active Time"]),
    artifact: safeText(row.Artifact || ""),
    evidence_summary: safeText(
      row.Evidence || "",
      GOVERNANCE_MAX_EVIDENCE_LENGTH,
    ),
    rework: /true|yes/i.test(row["Rework Tag"] || row.Rework || ""),
    source: "dashboard/estimate-calibration.md" as const,
  }));

  const gates = revisionTable.rows
    .filter((row) => /^GATE-/i.test(row.Version))
    .map((row) => ({
      id: safeText(row.Version),
      date: dateFact(row["日期"]),
      type: safeText(row["类型"]),
      result: safeText(row["变更"]),
      status: safeText(row["批准"]),
      evidence_summary: safeText(row["变更"], GOVERNANCE_MAX_EVIDENCE_LENGTH),
      reviewer_run_id: "not_recorded" as const,
      source: "dashboard/edad-tracker.md" as const,
    }));

  const planRevisions = revisionTable.rows
    .filter((row) => /^DIR-/i.test(row.Version))
    .map((row) => ({
      id: safeText(row.Version),
      date: dateFact(row["日期"]),
      type: safeText(row["类型"]),
      summary: safeText(row["变更"], GOVERNANCE_MAX_EVIDENCE_LENGTH),
      approval: safeText(row["批准"]),
      source: "dashboard/edad-tracker.md" as const,
    }));

  const risks = riskTable.rows.map((row) => ({
    id: safeText(row.ID),
    description: safeText(row["风险"]),
    impact: safeText(row["影响"]),
    status: safeText(row["状态"]),
    mitigation: safeText(row["缓解"], GOVERNANCE_MAX_EVIDENCE_LENGTH),
    source: "dashboard/edad-tracker.md" as const,
  }));
  const dependencies = dependencyTable.rows.map((row, index) => ({
    id: `DEP-${String(index + 1).padStart(3, "0")}`,
    dependency: safeText(row.Dependency),
    owner: safeText(row.Owner),
    needed_by: safeText(row["Needed By"]),
    status: safeText(row.Status),
    source: "dashboard/edad-tracker.md" as const,
  }));

  const charterTable = tables(sources.tracker).find((table) =>
    ["项目", "内容"].every((header) => table.header.includes(header)),
  );
  const charter = Object.fromEntries(
    (charterTable?.rows ?? []).map((row) => [row["项目"], safeText(row["内容"])]),
  );
  const latestDirection = revisionTable.rows
    .filter((row) => /^DIR-/i.test(row.Version))
    .at(-1)?.Version;
  const project = {
    id: "dashboard",
    name: charter.Project || "Dashboard",
    accountable_owner:
      field(sources.readme, "Accountable Owner") ||
      charter["Accountable Owner"] ||
      "Plato",
    phase:
      field(sources.readme, "Current Phase") ||
      charter["Current Phase"] ||
      "not_recorded",
    health: (/healthy/i.test(
      field(sources.readme, "Current Health") || charter["Current Health"] || "",
    )
      ? "healthy"
      : "unknown") as DeliveryGovernance["project"]["health"],
    plan_revision:
      field(sources.readme, "Current Plan Revision") ||
      latestDirection ||
      "not_recorded",
    baseline_status: (/candidate/i.test(
      field(sources.readme, "Development Baseline") ||
        charter["Development Baseline"] ||
        sources.baseline.slice(0, 2_000),
    )
      ? "candidate"
      : "unknown") as DeliveryGovernance["project"]["baseline_status"],
    source: "dashboard/README.md" as const,
  };

  const sourceDigest = createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(sources).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    )
    .digest("hex");
  const withoutSummary = {
    project,
    milestones: milestones.sort((left, right) => left.id.localeCompare(right.id)),
    features: featureRows.sort((left, right) => left.id.localeCompare(right.id)),
    tasks: tasks.sort((left, right) => left.id.localeCompare(right.id)),
    executor_runs: executorRuns.sort(
      (left, right) =>
        left.sequence - right.sequence || left.id.localeCompare(right.id),
    ),
    gates: gates.sort((left, right) => left.id.localeCompare(right.id)),
    plan_revisions: planRevisions.sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    risks: risks.sort((left, right) => left.id.localeCompare(right.id)),
    dependencies,
    source: {
      collected_at: options.collectedAt,
      files: [...GOVERNANCE_SOURCE_FILES] as [
        (typeof GOVERNANCE_SOURCE_FILES)[0],
        (typeof GOVERNANCE_SOURCE_FILES)[1],
        (typeof GOVERNANCE_SOURCE_FILES)[2],
        (typeof GOVERNANCE_SOURCE_FILES)[3],
      ],
      source_digest: sourceDigest,
      health: "healthy" as const,
    },
  };

  try {
    return DeliveryGovernanceSchema.parse({
      ...withoutSummary,
      summary: summarizeDeliveryGovernance(withoutSummary),
    });
  } catch {
    throw new GovernanceProjectionError(
      "Dashboard governance documents failed strict projection.",
    );
  }
}
