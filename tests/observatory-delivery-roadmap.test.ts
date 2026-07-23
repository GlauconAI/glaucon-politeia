import { describe, expect, it } from "vitest";

import { deriveDeliveryRoadmap } from "@/lib/observatory/delivery-roadmap";
import type { DeliveryGovernance } from "@/lib/observatory/governance-schema";

function governance(
  features: DeliveryGovernance["features"],
): DeliveryGovernance {
  const milestoneIds = [...new Set(features.map((feature) => feature.milestone_id))];
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
    milestones: milestoneIds.map((id) => ({
      id,
      name: id === "M2" ? "Delivery Governance" : id,
      status_label: "Active",
      status_category: "active",
      forecast: "2026-08-10",
      variance: "not_recorded",
      feature_ids: features
        .filter((feature) => feature.milestone_id === id)
        .map((feature) => feature.id),
      evidence_refs: [],
      source: "dashboard/edad-tracker.md",
    })),
    features,
    tasks: [],
    executor_runs: [],
    gates: [],
    plan_revisions: [],
    risks: [],
    dependencies: [],
    summary: {
      milestone_count: milestoneIds.length,
      feature_count: features.length,
      task_count: 0,
      run_count: 0,
      gate_count: 0,
      accepted_count: 0,
      active_count: milestoneIds.length + features.length,
      planned_count: 0,
      at_risk_count: 0,
      missing_date_count: features.reduce(
        (count, feature) =>
          count +
          Number(feature.baseline_finish === "not_recorded") +
          Number(feature.forecast_finish === "not_recorded") +
          Number(feature.actual_finish === "not_recorded"),
        0,
      ),
      open_risk_count: 0,
      open_dependency_count: 0,
    },
    source: {
      collected_at: "2026-07-23T18:20:20.140Z",
      files: [
        "dashboard/README.md",
        "dashboard/development-baseline.md",
        "dashboard/edad-tracker.md",
        "dashboard/estimate-calibration.md",
      ],
      source_digest:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      health: "healthy",
    },
  };
}

function feature(
  id: string,
  dates: {
    baseline: string;
    forecast: string;
    actual?: string;
    status?: DeliveryGovernance["features"][number]["status_category"];
  },
): DeliveryGovernance["features"][number] {
  return {
    id,
    milestone_id: "M2",
    name: `Feature ${id}`,
    scope: "Must",
    status_label: dates.status ?? "Active",
    status_category: dates.status ?? "active",
    contract_id: `EC-F${id.replace("OBS-F", "")}`,
    contract_type: "IMPLEMENT",
    estimate_hours: 8,
    confidence: "Low",
    baseline_finish: dates.baseline,
    forecast_finish: dates.forecast,
    actual_finish: dates.actual ?? "not_recorded",
    gate_requirement: "Production Gate",
    source: "dashboard/development-baseline.md",
  };
}

describe("deriveDeliveryRoadmap", () => {
  it("classifies early, on-time, and late rows from actual evidence", () => {
    const roadmap = deriveDeliveryRoadmap(
      governance([
        feature("OBS-F201", {
          baseline: "2026-07-10",
          forecast: "2026-07-11",
          actual: "2026-07-09",
        }),
        feature("OBS-F202", {
          baseline: "2026-07-11",
          forecast: "2026-07-11",
          actual: "2026-07-11",
        }),
        feature("OBS-F203", {
          baseline: "2026-07-12",
          forecast: "2026-07-14",
          actual: "2026-07-15",
        }),
      ]),
    );

    expect(roadmap.rows.map(({ variance_days, review_status }) => [
      variance_days,
      review_status,
    ])).toEqual([
      [-1, "on_track"],
      [0, "on_track"],
      [3, "off_track"],
    ]);
    expect(roadmap.first_slip?.feature_id).toBe("OBS-F203");
    expect(roadmap.review.status).toBe("off_track");
  });

  it("uses current plan for forward variance and finds the earliest slip", () => {
    const roadmap = deriveDeliveryRoadmap(
      governance([
        feature("OBS-F210", {
          baseline: "2026-07-20",
          forecast: "2026-07-24",
        }),
        feature("OBS-F209", {
          baseline: "2026-07-18",
          forecast: "2026-07-19",
        }),
      ]),
    );

    expect(roadmap.first_slip).toMatchObject({
      feature_id: "OBS-F209",
      comparison: "current_plan",
      variance_days: 1,
    });
  });

  it("never invents missing dates and preserves explicit risk", () => {
    const roadmap = deriveDeliveryRoadmap(
      governance([
        feature("OBS-F220", {
          baseline: "not_recorded",
          forecast: "2026-07-24",
        }),
        feature("OBS-F221", {
          baseline: "2026-07-20",
          forecast: "not_recorded",
        }),
        feature("OBS-F222", {
          baseline: "2026-07-20",
          forecast: "2026-07-20",
          status: "at_risk",
        }),
      ]),
    );

    expect(roadmap.rows.map(({ review_status, variance_days }) => [
      review_status,
      variance_days,
    ])).toEqual([
      ["unknown", null],
      ["at_risk", null],
      ["at_risk", 0],
    ]);
    expect(roadmap.date_domain).toEqual({
      start: "2026-07-20",
      end: "2026-07-24",
    });
  });

  it("returns a bounded empty review", () => {
    expect(deriveDeliveryRoadmap(governance([]))).toMatchObject({
      rows: [],
      first_slip: null,
      date_domain: null,
      review: { status: "unknown" },
    });
  });
});
