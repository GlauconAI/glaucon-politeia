import { describe, expect, it } from "vitest";

import { deriveDeliveryAnalytics } from "@/lib/observatory/delivery-analytics";
import type { DeliveryGovernance } from "@/lib/observatory/governance-schema";

type Task = DeliveryGovernance["tasks"][number];

function task(
  id: string,
  actualStart: string,
  actualFinish: string,
  status: Task["status_category"] = "done",
): Task {
  return {
    id,
    feature_id: "OBS-F301",
    name: id,
    status_label: status,
    status_category: status,
    contract_id: `EC-T${id.replace("OBS-T", "")}`,
    contract_type: "IMPLEMENT",
    estimate_hours: 2,
    confidence: "Low",
    forecast_finish: "2026-07-07",
    actual_start: actualStart,
    actual_finish: actualFinish,
    evidence_refs: [`evidence-${id}`],
    source: "dashboard/development-baseline.md",
  };
}

function governance(tasks: Task[]): DeliveryGovernance {
  return {
    project: {
      id: "dashboard",
      name: "Dashboard",
      accountable_owner: "Plato",
      phase: "M2",
      health: "healthy",
      plan_revision: "DIR-0003",
      baseline_status: "approved",
      source: "dashboard/README.md",
    },
    milestones: [
      {
        id: "M2",
        name: "Delivery Governance",
        status_label: "Active",
        status_category: "active",
        forecast: "2026-07-20",
        variance: "not_recorded",
        feature_ids: ["OBS-F301"],
        evidence_refs: [],
        source: "dashboard/edad-tracker.md",
      },
    ],
    features: [
      {
        id: "OBS-F301",
        milestone_id: "M2",
        name: "Flow Analytics",
        scope: "Must",
        status_label: "Active",
        status_category: "active",
        contract_id: "EC-F301",
        contract_type: "IMPLEMENT",
        estimate_hours: 20,
        confidence: "Low",
        baseline_finish: "2026-07-04",
        forecast_finish: "2026-07-05",
        actual_finish: "2026-07-07",
        gate_requirement: "Production Gate",
        source: "dashboard/development-baseline.md",
      },
    ],
    tasks,
    executor_runs: [
      {
        id: "RUN-REWORK-01",
        task_ref: "OBS-T3001",
        functional_role: "Implementer",
        sequence: 1,
        started_at: "2026-07-02T00:00:00Z",
        finished_at: "2026-07-02T04:00:00Z",
        active_time: "4h",
        artifact: "commit abc",
        evidence_summary: "Rework verified",
        rework: true,
        source: "dashboard/estimate-calibration.md",
      },
    ],
    gates: [
      {
        id: "GATE-M2",
        date: "2026-07-07",
        type: "Quality Gate",
        result: "Passed",
        status: "Passed",
        evidence_summary: "Tests passed",
        reviewer_run_id: "not_recorded",
        source: "dashboard/edad-tracker.md",
      },
    ],
    plan_revisions: [],
    risks: [],
    dependencies: [],
    summary: {
      milestone_count: 1,
      feature_count: 1,
      task_count: tasks.length,
      run_count: 1,
      gate_count: 1,
      accepted_count: tasks.filter((value) => value.status_category === "done").length,
      active_count:
        2 + tasks.filter((value) => value.status_category === "active").length,
      planned_count: tasks.filter((value) => value.status_category === "planned").length,
      at_risk_count: 0,
      missing_date_count: tasks.reduce(
        (count, value) =>
          count +
          Number(value.forecast_finish === "not_recorded") +
          Number(value.actual_start === "not_recorded") +
          Number(value.actual_finish === "not_recorded"),
        0,
      ),
      open_risk_count: 0,
      open_dependency_count: 0,
    },
    source: {
      collected_at: "2026-07-10T00:00:00Z",
      files: [
        "dashboard/README.md",
        "dashboard/development-baseline.md",
        "dashboard/edad-tracker.md",
        "dashboard/estimate-calibration.md",
      ],
      source_digest:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      health: "healthy",
    },
  };
}

describe("deriveDeliveryAnalytics", () => {
  it("derives traceable flow metrics, SLE, rework, variance, and forecast", () => {
    const model = governance([
      task("OBS-T3001", "2026-06-30T00:00:00Z", "2026-07-01T00:00:00Z"),
      task("OBS-T3002", "2026-07-01T00:00:00Z", "2026-07-03T00:00:00Z"),
      task("OBS-T3003", "2026-06-30T00:00:00Z", "2026-07-03T00:00:00Z"),
      task("OBS-T3004", "2026-07-01T00:00:00Z", "2026-07-05T00:00:00Z"),
      task("OBS-T3005", "2026-07-01T00:00:00Z", "2026-07-06T00:00:00Z"),
      task("OBS-T3006", "2026-07-08T00:00:00Z", "not_recorded", "active"),
      task("OBS-T3007", "not_recorded", "not_recorded", "planned"),
      task("OBS-T3008", "not_recorded", "not_recorded", "planned"),
    ]);

    const analytics = deriveDeliveryAnalytics(model);

    expect(analytics.events.map(({ kind }) => kind)).toContain("task_completed");
    expect(analytics.wip).toMatchObject({ value: 1, status: "available" });
    expect(analytics.throughput_30d).toMatchObject({
      value: 5,
      sample_size: 5,
      status: "available",
    });
    expect(analytics.age_days.value).toBe(2);
    expect(analytics.cycle_time_hours.value).toBe(72);
    expect(analytics.sle_hours.value).toBe(120);
    expect(analytics.rework_runs).toMatchObject({ value: 1, sample_size: 1 });
    expect(analytics.prediction_error_days.value).toBe(2);
    expect(analytics.baseline_variance_days.value).toBe(3);
    expect(analytics.blocked_time_hours.status).toBe("not_recorded");
    expect(analytics.waiting_time_hours.status).toBe("not_recorded");
    expect(analytics.forecast).toMatchObject({
      status: "available",
      remaining_tasks: 3,
      point_finish: "2026-07-14",
      interval_start: "2026-07-13",
      interval_end: "2026-07-28",
      confidence: "Medium",
    });
    expect(analytics.wip.evidence_refs).toContain("OBS-T3006");
  });

  it("refuses to forecast from an insufficient sample", () => {
    const analytics = deriveDeliveryAnalytics(
      governance([
        task("OBS-T3001", "2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z"),
        task("OBS-T3002", "not_recorded", "not_recorded", "planned"),
      ]),
    );

    expect(analytics.sle_hours).toMatchObject({
      value: null,
      status: "insufficient_evidence",
    });
    expect(analytics.forecast).toMatchObject({
      status: "insufficient_evidence",
      sample_size: 1,
    });
    expect(analytics.forecast.reason).toMatch(/at least 3 completed tasks/i);
  });

  it("does not infer blocked or waiting duration from status labels", () => {
    const blocked = task(
      "OBS-T3010",
      "2026-07-08T00:00:00Z",
      "not_recorded",
      "blocked",
    );
    const analytics = deriveDeliveryAnalytics(governance([blocked]));

    expect(analytics.blocked_time_hours.value).toBeNull();
    expect(analytics.waiting_time_hours.value).toBeNull();
    expect(analytics.blocked_time_hours.reason).toMatch(
      /explicit state-transition evidence/i,
    );
  });
});
