import type { DeliveryGovernance } from "./governance-schema";

export type BaselineReviewStatus =
  | "on_track"
  | "at_risk"
  | "off_track"
  | "unknown";

export type RoadmapRow = {
  feature_id: string;
  feature_name: string;
  milestone_id: string;
  original_baseline: string;
  current_plan: string;
  actual: string;
  comparison: "actual" | "current_plan" | null;
  variance_days: number | null;
  review_status: BaselineReviewStatus;
  evidence_refs: string[];
};

export type DeliveryRoadmap = {
  rows: RoadmapRow[];
  date_domain: { start: string; end: string } | null;
  first_slip: RoadmapRow | null;
  review: {
    status: BaselineReviewStatus;
    on_track_count: number;
    at_risk_count: number;
    off_track_count: number;
    unknown_count: number;
    summary: string;
  };
  plan_revisions: DeliveryGovernance["plan_revisions"];
};

function dateKey(value: string): string | null {
  if (value === "not_recorded") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function dayOrdinal(value: string): number | null {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dateVarianceDays(
  baseline: string,
  comparison: string,
): number | null {
  const baselineDay = dayOrdinal(baseline);
  const comparisonDay = dayOrdinal(comparison);
  return baselineDay === null || comparisonDay === null
    ? null
    : comparisonDay - baselineDay;
}

function rowStatus(
  status: DeliveryGovernance["features"][number]["status_category"],
  hasBaseline: boolean,
  variance: number | null,
): BaselineReviewStatus {
  if (!hasBaseline) return "unknown";
  if (variance !== null && variance > 0) return "off_track";
  if (status === "blocked" || status === "at_risk" || variance === null) {
    return "at_risk";
  }
  return "on_track";
}

function reviewSummary(
  status: BaselineReviewStatus,
  counts: Omit<DeliveryRoadmap["review"], "status" | "summary">,
): string {
  if (status === "off_track") {
    return `${counts.off_track_count} roadmap item(s) have evidenced positive variance.`;
  }
  if (status === "at_risk") {
    return `${counts.at_risk_count} roadmap item(s) need date or risk resolution.`;
  }
  if (status === "on_track") {
    return `${counts.on_track_count} roadmap item(s) are on or ahead of baseline.`;
  }
  return "No roadmap item has enough baseline evidence for a review.";
}

export function deriveDeliveryRoadmap(
  governance: DeliveryGovernance,
): DeliveryRoadmap {
  const rows = governance.features.map((feature): RoadmapRow => {
    const actual = dateKey(feature.actual_finish);
    const current = dateKey(feature.forecast_finish);
    const baseline = dateKey(feature.baseline_finish);
    const comparison = actual
      ? ("actual" as const)
      : current
        ? ("current_plan" as const)
        : null;
    const variance = comparison
      ? dateVarianceDays(
          feature.baseline_finish,
          comparison === "actual"
            ? feature.actual_finish
            : feature.forecast_finish,
        )
      : null;
    return {
      feature_id: feature.id,
      feature_name: feature.name,
      milestone_id: feature.milestone_id,
      original_baseline: baseline ?? "not_recorded",
      current_plan: current ?? "not_recorded",
      actual: actual ?? "not_recorded",
      comparison,
      variance_days: variance,
      review_status: rowStatus(feature.status_category, Boolean(baseline), variance),
      evidence_refs: [feature.id, feature.contract_id, feature.source],
    };
  });

  const recordedDates = rows.flatMap((row) =>
    [row.original_baseline, row.current_plan, row.actual].filter(
      (value) => value !== "not_recorded",
    ),
  );
  const date_domain = recordedDates.length
    ? {
        start: [...recordedDates].sort()[0],
        end: [...recordedDates].sort().at(-1) as string,
      }
    : null;
  const first_slip =
    rows
      .filter(
        (row) =>
          row.variance_days !== null &&
          row.variance_days > 0 &&
          row.original_baseline !== "not_recorded",
      )
      .sort(
        (left, right) =>
          left.original_baseline.localeCompare(right.original_baseline) ||
          left.feature_id.localeCompare(right.feature_id),
      )[0] ?? null;
  const counts = {
    on_track_count: rows.filter((row) => row.review_status === "on_track").length,
    at_risk_count: rows.filter((row) => row.review_status === "at_risk").length,
    off_track_count: rows.filter((row) => row.review_status === "off_track").length,
    unknown_count: rows.filter((row) => row.review_status === "unknown").length,
  };
  const status: BaselineReviewStatus = counts.off_track_count
    ? "off_track"
    : counts.at_risk_count
      ? "at_risk"
      : counts.on_track_count
        ? "on_track"
        : "unknown";

  return {
    rows,
    date_domain,
    first_slip,
    review: {
      status,
      ...counts,
      summary: reviewSummary(status, counts),
    },
    plan_revisions: governance.plan_revisions,
  };
}
