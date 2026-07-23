import {
  deriveDeliveryAnalytics,
  type DeliveryAnalytics,
  type DeliveryEvent,
} from "./delivery-analytics";
import {
  deriveDeliveryRoadmap,
  type DeliveryRoadmap,
} from "./delivery-roadmap";
import type { DeliveryGovernance } from "./governance-schema";

export type ReviewStatus = "on_track" | "at_risk" | "off_track";
export type IssueCategory =
  | "risk"
  | "dependency"
  | "schedule"
  | "status"
  | "forecast"
  | "data_quality"
  | "gate";
export type DelayCategory =
  | "scope"
  | "dependency"
  | "approval"
  | "technical_unknown"
  | "rework"
  | "capacity"
  | "external"
  | "unclassified";

export type GovernanceIssue = {
  id: string;
  category: IssueCategory;
  severity: "high" | "medium" | "low";
  summary: string;
  owner: string;
  status: string;
  evidence_refs: string[];
  source: string;
};

export type PeriodReport = {
  id: string;
  kind: "weekly" | "monthly";
  period_start: string;
  period_end: string;
  completed_tasks: number;
  executor_runs: number;
  gate_decisions: number;
  evidence_refs: string[];
  summary: string;
};

export type DataQualityFinding = {
  id: string;
  status: "missing" | "insufficient";
  summary: string;
  evidence_refs: string[];
};

export type GovernanceReport = {
  review: {
    status: ReviewStatus;
    summary: string;
    generated_at: string;
    source_digest: string;
    source_files: string[];
  };
  issues: GovernanceIssue[];
  delay_attribution: Array<{
    category: DelayCategory;
    evidence_refs: string[];
  }>;
  weekly: PeriodReport;
  monthly: PeriodReport;
  data_quality: DataQualityFinding[];
  plan_revisions: DeliveryGovernance["plan_revisions"];
  gates: DeliveryGovernance["gates"];
};

const DAY_MS = 86_400_000;

function dateKey(value: string | number): string {
  const instant = typeof value === "number" ? value : Date.parse(value);
  return new Date(instant).toISOString().slice(0, 10);
}

function isOpen(value: string): boolean {
  return !/available|done|closed|met|passed|accepted|resolved/i.test(value);
}

function riskSeverity(risk: DeliveryGovernance["risks"][number]) {
  return /critical|severe|high|blocking/i.test(`${risk.impact} ${risk.description}`)
    ? ("high" as const)
    : ("medium" as const);
}

function buildIssues(
  governance: DeliveryGovernance,
  roadmap: DeliveryRoadmap,
  analytics: DeliveryAnalytics,
): GovernanceIssue[] {
  const riskIssues = governance.risks
    .filter((risk) => isOpen(risk.status))
    .map(
      (risk): GovernanceIssue => ({
        id: `risk:${risk.id}`,
        category: "risk",
        severity: riskSeverity(risk),
        summary: `${risk.description}: ${risk.impact}`,
        owner: "Not recorded",
        status: risk.status,
        evidence_refs: [risk.id],
        source: risk.source,
      }),
    );
  const dependencyIssues = governance.dependencies
    .filter((dependency) => isOpen(dependency.status))
    .map(
      (dependency): GovernanceIssue => ({
        id: `dependency:${dependency.id}`,
        category: "dependency",
        severity: /blocked|critical/i.test(dependency.status) ? "high" : "medium",
        summary: dependency.dependency,
        owner: dependency.owner || "Not recorded",
        status: dependency.status,
        evidence_refs: [dependency.id],
        source: dependency.source,
      }),
    );
  const scheduleIssues = roadmap.rows
    .filter((row) => row.review_status === "off_track")
    .map(
      (row): GovernanceIssue => ({
        id: `schedule:${row.feature_id}`,
        category: "schedule",
        severity: "high",
        summary: `${row.feature_name} is ${row.variance_days} day(s) behind baseline.`,
        owner: governance.project.accountable_owner || "Not recorded",
        status: "Off track",
        evidence_refs: row.evidence_refs,
        source: "dashboard/development-baseline.md",
      }),
    );
  const statusIssues = [...governance.features, ...governance.tasks]
    .filter((item) => ["blocked", "at_risk"].includes(item.status_category))
    .map(
      (item): GovernanceIssue => ({
        id: `status:${item.id}`,
        category: "status",
        severity: item.status_category === "blocked" ? "high" : "medium",
        summary: `${item.id} · ${item.name}`,
        owner: governance.project.accountable_owner || "Not recorded",
        status: item.status_label,
        evidence_refs: [item.id],
        source: item.source,
      }),
    );
  const forecastIssues: GovernanceIssue[] =
    analytics.forecast.status === "insufficient_evidence"
      ? [
          {
            id: "forecast:insufficient-evidence",
            category: "forecast",
            severity: "medium",
            summary: analytics.forecast.reason || "Forecast evidence is insufficient.",
            owner: governance.project.accountable_owner || "Not recorded",
            status: "Insufficient evidence",
            evidence_refs: analytics.forecast.evidence_refs.length
              ? analytics.forecast.evidence_refs
              : [governance.source.source_digest.slice(0, 12)],
            source: "dashboard/estimate-calibration.md",
          },
        ]
      : [];
  const qualityIssues: GovernanceIssue[] = governance.summary.missing_date_count
    ? [
        {
          id: "data-quality:missing-dates",
          category: "data_quality",
          severity: "low",
          summary: `${governance.summary.missing_date_count} required date fact(s) are not recorded.`,
          owner: governance.project.accountable_owner || "Not recorded",
          status: "Open",
          evidence_refs: [governance.source.source_digest.slice(0, 12)],
          source: "dashboard/development-baseline.md",
        },
      ]
    : [];
  const gateIssues = governance.gates
    .filter((gate) => isOpen(gate.status))
    .map(
      (gate): GovernanceIssue => ({
        id: `gate:${gate.id}`,
        category: "gate",
        severity: "medium",
        summary: `${gate.id} · ${gate.result}`,
        owner: governance.project.accountable_owner || "Not recorded",
        status: gate.status,
        evidence_refs: [gate.id],
        source: gate.source,
      }),
    );
  return [
    ...riskIssues,
    ...dependencyIssues,
    ...scheduleIssues,
    ...statusIssues,
    ...forecastIssues,
    ...qualityIssues,
    ...gateIssues,
  ].sort((left, right) => left.id.localeCompare(right.id));
}

const DELAY_PATTERNS: Array<[DelayCategory, RegExp]> = [
  ["scope", /scope|requirement|范围|需求/i],
  ["dependency", /dependency|dependent|依赖/i],
  ["approval", /approval|approve|审批|批准/i],
  ["technical_unknown", /technical unknown|unknown|技术未知|技术/i],
  ["rework", /rework|返工/i],
  ["capacity", /capacity|bandwidth|容量|人力/i],
  ["external", /external|vendor|third[- ]party|外部|供应商/i],
];

function delayAttribution(
  governance: DeliveryGovernance,
  issues: GovernanceIssue[],
): GovernanceReport["delay_attribution"] {
  const evidence = [
    ...issues.map((issue) => ({
      id: issue.evidence_refs[0] || issue.id,
      text: issue.summary,
    })),
    ...governance.executor_runs.map((run) => ({
      id: run.id,
      text: `${run.evidence_summary} ${run.rework ? "rework" : ""}`,
    })),
    ...governance.gates.map((gate) => ({
      id: gate.id,
      text: `${gate.result} ${gate.evidence_summary}`,
    })),
  ];
  return DELAY_PATTERNS.flatMap(([category, pattern]) => {
    const refs = [
      ...new Set(
        evidence
          .filter(({ text }) => pattern.test(text))
          .map(({ id }) => id),
      ),
    ].sort();
    return refs.length ? [{ category, evidence_refs: refs }] : [];
  });
}

function periodReport(
  kind: PeriodReport["kind"],
  governance: DeliveryGovernance,
  events: DeliveryEvent[],
  days: number,
): PeriodReport {
  const end = Date.parse(governance.source.collected_at);
  const start = end - (days - 1) * DAY_MS;
  const inPeriod = events.filter((event) => {
    const at = Date.parse(event.occurred_at);
    return at >= start && at <= end;
  });
  const completedTasks = inPeriod.filter(
    (event) => event.kind === "task_completed",
  );
  const executorRuns = inPeriod.filter(
    (event) => event.kind === "run_completed",
  );
  const gates = inPeriod.filter((event) => event.kind === "gate");
  const periodEnd = dateKey(end);
  const periodStart = dateKey(start);
  return {
    id: `${kind}-${periodEnd}-${governance.source.source_digest.slice(0, 8)}`,
    kind,
    period_start: periodStart,
    period_end: periodEnd,
    completed_tasks: completedTasks.length,
    executor_runs: executorRuns.length,
    gate_decisions: gates.length,
    evidence_refs: [...new Set(inPeriod.map(({ record_id }) => record_id))].sort(),
    summary: `${completedTasks.length} Task completion(s), ${executorRuns.length} Executor Run(s), and ${gates.length} Gate decision(s).`,
  };
}

function dataQuality(
  governance: DeliveryGovernance,
  analytics: DeliveryAnalytics,
): DataQualityFinding[] {
  const findings: DataQualityFinding[] = [];
  if (governance.summary.missing_date_count) {
    findings.push({
      id: "quality:missing-dates",
      status: "missing",
      summary: `${governance.summary.missing_date_count} date fact(s) are not recorded.`,
      evidence_refs: [governance.source.source_digest.slice(0, 12)],
    });
  }
  if (analytics.blocked_time_hours.status === "not_recorded") {
    findings.push({
      id: "quality:blocked-duration",
      status: "missing",
      summary: analytics.blocked_time_hours.reason || "Blocked duration is not recorded.",
      evidence_refs: [governance.source.source_digest.slice(0, 12)],
    });
  }
  if (analytics.waiting_time_hours.status === "not_recorded") {
    findings.push({
      id: "quality:waiting-duration",
      status: "missing",
      summary: analytics.waiting_time_hours.reason || "Waiting duration is not recorded.",
      evidence_refs: [governance.source.source_digest.slice(0, 12)],
    });
  }
  if (analytics.forecast.status === "insufficient_evidence") {
    findings.push({
      id: "quality:forecast-sample",
      status: "insufficient",
      summary: analytics.forecast.reason || "Forecast evidence is insufficient.",
      evidence_refs: analytics.forecast.evidence_refs.length
        ? analytics.forecast.evidence_refs
        : [governance.source.source_digest.slice(0, 12)],
    });
  }
  return findings;
}

export function deriveGovernanceReport(
  governance: DeliveryGovernance,
): GovernanceReport {
  const roadmap = deriveDeliveryRoadmap(governance);
  const analytics = deriveDeliveryAnalytics(governance);
  const issues = buildIssues(governance, roadmap, analytics);
  const hasBlocked = issues.some(
    (issue) => issue.severity === "high" && issue.category !== "schedule",
  );
  const status: ReviewStatus =
    roadmap.review.status === "off_track" || hasBlocked
      ? "off_track"
      : issues.length || roadmap.review.status === "at_risk"
        ? "at_risk"
        : "on_track";
  const summary =
    status === "off_track"
      ? "Evidence shows material schedule or delivery blockers."
      : status === "at_risk"
        ? "Open governance or data-quality issues require attention."
        : "No evidenced delivery exception is open.";
  return {
    review: {
      status,
      summary,
      generated_at: governance.source.collected_at,
      source_digest: governance.source.source_digest,
      source_files: [...governance.source.files],
    },
    issues,
    delay_attribution: delayAttribution(governance, issues),
    weekly: periodReport("weekly", governance, analytics.events, 7),
    monthly: periodReport("monthly", governance, analytics.events, 30),
    data_quality: dataQuality(governance, analytics),
    plan_revisions: [...governance.plan_revisions].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    gates: [...governance.gates].sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    ),
  };
}

export function serializeGovernanceReport(report: GovernanceReport): string {
  const serialized = JSON.stringify(report, null, 2);
  if (serialized.length > 200_000) {
    throw new Error("Governance report export exceeds the safe size limit.");
  }
  return serialized;
}
