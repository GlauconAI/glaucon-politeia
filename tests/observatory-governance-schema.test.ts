import { describe, expect, it } from "vitest";

import {
  DeliveryGovernanceSchema,
  type DeliveryGovernance,
} from "@/lib/observatory/governance-schema";

function governance(): DeliveryGovernance {
  return {
    project: {
      id: "dashboard",
      name: "Dashboard",
      accountable_owner: "Plato",
      phase: "M2",
      health: "healthy",
      plan_revision: "DIR-0003",
      baseline_status: "candidate",
      source: "dashboard/README.md",
    },
    milestones: [
      {
        id: "M2",
        name: "Delivery Governance",
        status_label: "Next",
        status_category: "planned",
        forecast: "not_recorded",
        variance: "not_recorded",
        feature_ids: ["OBS-F106"],
        evidence_refs: ["DIR-0003"],
        source: "dashboard/edad-tracker.md",
      },
    ],
    features: [
      {
        id: "OBS-F106",
        milestone_id: "M2",
        name: "Dashboard Project Cockpit",
        scope: "Must",
        status_label: "Planned",
        status_category: "planned",
        contract_id: "EC-F106",
        contract_type: "IMPLEMENT",
        estimate_hours: 9,
        confidence: "Low",
        baseline_finish: "2026-07-24",
        forecast_finish: "not_recorded",
        actual_finish: "not_recorded",
        gate_requirement: "Production Gate",
        source: "dashboard/development-baseline.md",
      },
    ],
    tasks: [
      {
        id: "OBS-T1061",
        feature_id: "OBS-F106",
        name: "Define cockpit read model",
        status_label: "Planned",
        status_category: "planned",
        contract_id: "EC-T1061",
        contract_type: "IMPLEMENT",
        estimate_hours: 3,
        confidence: "Low",
        forecast_finish: "2026-07-27",
        actual_start: "not_recorded",
        actual_finish: "not_recorded",
        evidence_refs: [],
        source: "dashboard/development-baseline.md",
      },
    ],
    executor_runs: [],
    gates: [],
    risks: [],
    dependencies: [],
    summary: {
      milestone_count: 1,
      feature_count: 1,
      task_count: 1,
      run_count: 0,
      gate_count: 0,
      accepted_count: 0,
      active_count: 0,
      planned_count: 3,
      at_risk_count: 0,
      missing_date_count: 5,
      open_risk_count: 0,
      open_dependency_count: 0,
    },
    source: {
      collected_at: "2026-07-23T04:00:00.000Z",
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

describe("DeliveryGovernanceSchema", () => {
  it("accepts a strict, internally consistent governance model", () => {
    expect(DeliveryGovernanceSchema.parse(governance())).toEqual(governance());
  });

  it("rejects duplicate ids and dangling hierarchy references", () => {
    const duplicate = governance();
    duplicate.features.push({ ...duplicate.features[0] });
    expect(DeliveryGovernanceSchema.safeParse(duplicate).success).toBe(false);

    const dangling = governance();
    dangling.tasks[0].feature_id = "OBS-F999";
    expect(DeliveryGovernanceSchema.safeParse(dangling).success).toBe(false);
  });

  it("rejects unknown contracts, malformed dates, and inconsistent summaries", () => {
    const contract = governance();
    contract.tasks[0].contract_type = "ROOT" as "IMPLEMENT";
    expect(DeliveryGovernanceSchema.safeParse(contract).success).toBe(false);

    const date = governance();
    date.tasks[0].forecast_finish = "tomorrow";
    expect(DeliveryGovernanceSchema.safeParse(date).success).toBe(false);

    const summary = governance();
    summary.summary.task_count = 2;
    expect(DeliveryGovernanceSchema.safeParse(summary).success).toBe(false);
  });

  it("rejects unknown fields and overlong text", () => {
    expect(
      DeliveryGovernanceSchema.safeParse({
        ...governance(),
        raw_markdown: "# private",
      }).success,
    ).toBe(false);

    const overlong = governance();
    overlong.project.name = "x".repeat(513);
    expect(DeliveryGovernanceSchema.safeParse(overlong).success).toBe(false);
  });
});
