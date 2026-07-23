import type { DeliveryGovernance } from "./governance-schema";

export type MetricStatus =
  | "available"
  | "insufficient_evidence"
  | "not_recorded";

export type DeliveryMetric = {
  value: number | null;
  unit: string;
  sample_size: number;
  status: MetricStatus;
  reason: string | null;
  evidence_refs: string[];
};

export type DeliveryEvent = {
  id: string;
  kind:
    | "task_started"
    | "task_completed"
    | "run_started"
    | "run_completed"
    | "gate";
  occurred_at: string;
  source: string;
  record_id: string;
  rework: boolean;
};

export type DeliveryForecast = {
  status: "available" | "insufficient_evidence";
  sample_size: number;
  remaining_tasks: number;
  point_finish: string | null;
  interval_start: string | null;
  interval_end: string | null;
  confidence: "Low" | "Medium" | "High" | "Not available";
  reason: string | null;
  evidence_refs: string[];
};

export type DeliveryAnalytics = {
  events: DeliveryEvent[];
  daily_throughput: Array<{ date: string; count: number; evidence_refs: string[] }>;
  wip: DeliveryMetric;
  throughput_30d: DeliveryMetric;
  age_days: DeliveryMetric;
  cycle_time_hours: DeliveryMetric;
  sle_hours: DeliveryMetric;
  blocked_time_hours: DeliveryMetric;
  waiting_time_hours: DeliveryMetric;
  rework_runs: DeliveryMetric;
  prediction_error_days: DeliveryMetric;
  baseline_variance_days: DeliveryMetric;
  forecast: DeliveryForecast;
  source_digest: string;
  collected_at: string;
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function timestamp(value: string): number | null {
  if (value === "not_recorded") return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function dateKey(value: number | string): string {
  const instant = typeof value === "number" ? value : Date.parse(value);
  return new Date(instant).toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function nearestRank(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index];
}

function metric(
  value: number | null,
  unit: string,
  sampleSize: number,
  status: MetricStatus,
  evidenceRefs: string[],
  reason: string | null = null,
): DeliveryMetric {
  return {
    value,
    unit,
    sample_size: sampleSize,
    status,
    reason,
    evidence_refs: [...new Set(evidenceRefs)].sort(),
  };
}

function daysBetween(left: string, right: string): number | null {
  const start = timestamp(left);
  const finish = timestamp(right);
  return start === null || finish === null
    ? null
    : Math.round((finish - start) / DAY_MS);
}

function addUtcDays(value: string, days: number): string {
  const start = Date.parse(`${dateKey(value)}T00:00:00Z`);
  return dateKey(start + days * DAY_MS);
}

function deliveryEvents(governance: DeliveryGovernance): DeliveryEvent[] {
  const taskEvents = governance.tasks.flatMap((task): DeliveryEvent[] => {
    const events: DeliveryEvent[] = [];
    if (timestamp(task.actual_start) !== null) {
      events.push({
        id: `${task.id}:started`,
        kind: "task_started",
        occurred_at: task.actual_start,
        source: task.source,
        record_id: task.id,
        rework: false,
      });
    }
    if (timestamp(task.actual_finish) !== null) {
      events.push({
        id: `${task.id}:completed`,
        kind: "task_completed",
        occurred_at: task.actual_finish,
        source: task.source,
        record_id: task.id,
        rework: false,
      });
    }
    return events;
  });
  const runEvents = governance.executor_runs.flatMap((run): DeliveryEvent[] => {
    const events: DeliveryEvent[] = [];
    if (timestamp(run.started_at) !== null) {
      events.push({
        id: `${run.id}:started`,
        kind: "run_started",
        occurred_at: run.started_at,
        source: run.source,
        record_id: run.id,
        rework: run.rework,
      });
    }
    if (timestamp(run.finished_at) !== null) {
      events.push({
        id: `${run.id}:completed`,
        kind: "run_completed",
        occurred_at: run.finished_at,
        source: run.source,
        record_id: run.id,
        rework: run.rework,
      });
    }
    return events;
  });
  const gateEvents = governance.gates.flatMap((gate): DeliveryEvent[] =>
    timestamp(gate.date) === null
      ? []
      : [
          {
            id: `${gate.id}:gate`,
            kind: "gate" as const,
            occurred_at: gate.date,
            source: gate.source,
            record_id: gate.id,
            rework: false,
          },
        ],
  );
  return [...taskEvents, ...runEvents, ...gateEvents].sort(
    (left, right) =>
      (timestamp(left.occurred_at) ?? 0) - (timestamp(right.occurred_at) ?? 0) ||
      left.id.localeCompare(right.id),
  );
}

function throughputSeries(
  completed: Array<{ id: string; at: number }>,
): Array<{ date: string; count: number; evidence_refs: string[] }> {
  if (!completed.length) return [];
  const start = Math.min(...completed.map(({ at }) => at));
  const end = Math.max(...completed.map(({ at }) => at));
  const result = [];
  for (
    let cursor = Date.parse(`${dateKey(start)}T00:00:00Z`);
    cursor <= Date.parse(`${dateKey(end)}T00:00:00Z`);
    cursor += DAY_MS
  ) {
    const date = dateKey(cursor);
    const records = completed.filter(({ at }) => dateKey(at) === date);
    result.push({
      date,
      count: records.length,
      evidence_refs: records.map(({ id }) => id).sort(),
    });
  }
  return result;
}

function deriveForecast(
  governance: DeliveryGovernance,
  completed: Array<{ id: string; at: number }>,
  daily: DeliveryAnalytics["daily_throughput"],
): DeliveryForecast {
  const remainingTasks = governance.tasks.filter(
    (task) =>
      timestamp(task.actual_finish) === null &&
      !["done", "accepted"].includes(task.status_category),
  ).length;
  const distinctDates = new Set(completed.map(({ at }) => dateKey(at))).size;
  const evidenceRefs = completed.map(({ id }) => id).sort();
  if (completed.length < 3 || distinctDates < 2 || !daily.length) {
    return {
      status: "insufficient_evidence",
      sample_size: completed.length,
      remaining_tasks: remainingTasks,
      point_finish: null,
      interval_start: null,
      interval_end: null,
      confidence: "Not available",
      reason:
        "Forecast requires at least 3 completed Tasks across at least 2 completion dates.",
      evidence_refs: evidenceRefs,
    };
  }
  const counts = daily.map(({ count }) => count);
  const averageRate = completed.length / daily.length;
  const fastRate = nearestRank(counts, 0.75) ?? 0;
  const observedFloor = 1 / daily.length;
  const slowRate = Math.max(nearestRank(counts, 0.25) ?? 0, observedFloor);
  const pointDays = remainingTasks ? Math.ceil(remainingTasks / averageRate) : 0;
  const fastDays = remainingTasks
    ? Math.ceil(remainingTasks / Math.max(fastRate, observedFloor))
    : 0;
  const slowDays = remainingTasks ? Math.ceil(remainingTasks / slowRate) : 0;
  const confidence =
    completed.length >= 10 ? "High" : completed.length >= 5 ? "Medium" : "Low";
  return {
    status: "available",
    sample_size: completed.length,
    remaining_tasks: remainingTasks,
    point_finish: addUtcDays(governance.source.collected_at, pointDays),
    interval_start: addUtcDays(governance.source.collected_at, fastDays),
    interval_end: addUtcDays(governance.source.collected_at, slowDays),
    confidence,
    reason: null,
    evidence_refs: evidenceRefs,
  };
}

export function deriveDeliveryAnalytics(
  governance: DeliveryGovernance,
): DeliveryAnalytics {
  const collectedAt = timestamp(governance.source.collected_at) ?? Date.now();
  const completed = governance.tasks.flatMap((task) => {
    const at = timestamp(task.actual_finish);
    return at === null ? [] : [{ id: task.id, at }];
  });
  const wipTasks = governance.tasks.filter(
    (task) =>
      timestamp(task.actual_start) !== null &&
      timestamp(task.actual_finish) === null,
  );
  const ages = wipTasks.flatMap((task) => {
    const start = timestamp(task.actual_start);
    return start === null ? [] : [(collectedAt - start) / DAY_MS];
  });
  const cycles = governance.tasks.flatMap((task) => {
    const start = timestamp(task.actual_start);
    const finish = timestamp(task.actual_finish);
    return start === null || finish === null || finish < start
      ? []
      : [(finish - start) / HOUR_MS];
  });
  const dailyThroughput = throughputSeries(completed);
  const thirtyDayStart = collectedAt - 29 * DAY_MS;
  const completedThirtyDays = completed.filter(
    ({ at }) => at >= thirtyDayStart && at <= collectedAt,
  );
  const reworkRuns = governance.executor_runs.filter((run) => run.rework);
  const predictionErrors = governance.features.flatMap((feature) => {
    const value = daysBetween(feature.forecast_finish, feature.actual_finish);
    return value === null ? [] : [{ value, id: feature.id }];
  });
  const baselineVariances = governance.features.flatMap((feature) => {
    const value = daysBetween(feature.baseline_finish, feature.actual_finish);
    return value === null ? [] : [{ value, id: feature.id }];
  });
  const noStateTransitions =
    "Explicit state-transition evidence is required; status labels do not encode duration.";

  return {
    events: deliveryEvents(governance),
    daily_throughput: dailyThroughput,
    wip: metric(
      wipTasks.length,
      "tasks",
      wipTasks.length,
      "available",
      wipTasks.map(({ id }) => id),
    ),
    throughput_30d: metric(
      completedThirtyDays.length,
      "tasks / 30 days",
      completedThirtyDays.length,
      completedThirtyDays.length ? "available" : "insufficient_evidence",
      completedThirtyDays.map(({ id }) => id),
      completedThirtyDays.length ? null : "No completed Task date was recorded in the latest 30 days.",
    ),
    age_days: metric(
      median(ages),
      "days",
      ages.length,
      ages.length ? "available" : "insufficient_evidence",
      wipTasks.map(({ id }) => id),
      ages.length ? null : "No started, unfinished Task has a recorded Actual Start.",
    ),
    cycle_time_hours: metric(
      median(cycles),
      "hours",
      cycles.length,
      cycles.length ? "available" : "insufficient_evidence",
      completed.map(({ id }) => id),
      cycles.length ? null : "No completed Task has both Actual Start and Actual Finish.",
    ),
    sle_hours: metric(
      cycles.length >= 5 ? nearestRank(cycles, 0.85) : null,
      "hours (P85)",
      cycles.length,
      cycles.length >= 5 ? "available" : "insufficient_evidence",
      completed.map(({ id }) => id),
      cycles.length >= 5 ? null : "SLE requires at least 5 completed Task cycle-time samples.",
    ),
    blocked_time_hours: metric(null, "hours", 0, "not_recorded", [], noStateTransitions),
    waiting_time_hours: metric(null, "hours", 0, "not_recorded", [], noStateTransitions),
    rework_runs: metric(
      reworkRuns.length,
      "runs",
      reworkRuns.length,
      "available",
      reworkRuns.map(({ id }) => id),
    ),
    prediction_error_days: metric(
      median(predictionErrors.map(({ value }) => value)),
      "days",
      predictionErrors.length,
      predictionErrors.length ? "available" : "insufficient_evidence",
      predictionErrors.map(({ id }) => id),
      predictionErrors.length
        ? null
        : "Prediction error requires both Feature Forecast Finish and Actual Finish.",
    ),
    baseline_variance_days: metric(
      median(baselineVariances.map(({ value }) => value)),
      "days",
      baselineVariances.length,
      baselineVariances.length ? "available" : "insufficient_evidence",
      baselineVariances.map(({ id }) => id),
      baselineVariances.length
        ? null
        : "Baseline variance requires both Feature Baseline Finish and Actual Finish.",
    ),
    forecast: deriveForecast(governance, completed, dailyThroughput),
    source_digest: governance.source.source_digest,
    collected_at: governance.source.collected_at,
  };
}
