import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GovernanceProjectionError,
  projectDashboardGovernance,
} from "@/lib/observatory/governance-markdown";

const fixtureRoot = join(
  process.cwd(),
  "tests/fixtures/observatory-governance",
);

function sources() {
  return {
    readme: readFileSync(join(fixtureRoot, "README.md"), "utf8"),
    baseline: readFileSync(
      join(fixtureRoot, "development-baseline.md"),
      "utf8",
    ),
    tracker: readFileSync(join(fixtureRoot, "edad-tracker.md"), "utf8"),
    calibration: readFileSync(
      join(fixtureRoot, "estimate-calibration.md"),
      "utf8",
    ),
  };
}

describe("projectDashboardGovernance", () => {
  it("projects hierarchy, contracts, runs, gates, risks, and dependencies", () => {
    const result = projectDashboardGovernance(sources(), {
      collectedAt: "2026-07-23T04:30:00.000Z",
    });

    expect(result.project).toMatchObject({
      id: "dashboard",
      accountable_owner: "Plato",
      phase: "M2｜Delivery Governance",
      baseline_status: "candidate",
    });
    expect(result.milestones[0]).toMatchObject({
      id: "M2",
      feature_ids: ["OBS-F106"],
      status_category: "planned",
    });
    expect(result.features[0]).toMatchObject({
      id: "OBS-F106",
      milestone_id: "M2",
      contract_type: "IMPLEMENT",
      forecast_finish: "not_recorded",
      gate_requirement: "Production Gate",
    });
    expect(result.tasks[0]).toMatchObject({
      id: "OBS-T1061",
      feature_id: "OBS-F106",
      evidence_refs: ["design"],
    });
    expect(result.executor_runs[0]).toMatchObject({
      id: "RUN-T1061-01",
      sequence: 1,
      rework: false,
    });
    expect(result.gates[0]).toMatchObject({ id: "GATE-M1", status: "Passed" });
    expect(result.risks[0].id).toBe("R1");
    expect(result.dependencies[0]).toMatchObject({
      id: "DEP-001",
      needed_by: "M2",
    });
    expect(result.summary).toMatchObject({
      milestone_count: 1,
      feature_count: 1,
      task_count: 1,
      run_count: 1,
      gate_count: 1,
      planned_count: 3,
      open_risk_count: 1,
      open_dependency_count: 1,
    });
  });

  it("is deterministic and never serializes Markdown links or private values", () => {
    const input = sources();
    input.baseline = input.baseline.replace(
      "[[design]]",
      "[design](https://example.com/private?token=secret) /Users/private private@example.com",
    );
    const first = projectDashboardGovernance(input, {
      collectedAt: "2026-07-23T04:30:00.000Z",
    });
    const second = projectDashboardGovernance(input, {
      collectedAt: "2026-07-23T04:30:00.000Z",
    });

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(
      /https?:|token|\/Users\/|private@example/u,
    );
  });

  it("keeps only the display label from aliased wiki links", () => {
    const input = sources();
    input.baseline = input.baseline.replace(
      "[[design]]",
      "[[private/source-contract|approved design evidence]]",
    );

    const result = projectDashboardGovernance(input, {
      collectedAt: "2026-07-23T04:30:00.000Z",
    });

    expect(result.tasks[0].evidence_refs).toEqual([
      "approved design evidence",
    ]);
    expect(JSON.stringify(result)).not.toContain("private/source-contract");
  });

  it("keeps an active milestone active when a nested local gate has passed", () => {
    const input = sources();
    input.tracker = input.tracker.replace(
      "Next / planned",
      "Active / Project Cockpit local Gate passed",
    );

    const result = projectDashboardGovernance(input, {
      collectedAt: "2026-07-23T04:30:00.000Z",
    });

    expect(result.milestones[0].status_category).toBe("active");
  });

  it("fails closed on duplicate ids, dangling parents, and format drift", () => {
    const duplicate = sources();
    duplicate.baseline = duplicate.baseline.replace(
      "| OBS-T1061｜Define cockpit read model",
      "| OBS-T9999｜Unknown task\n| OBS-T1061｜Define cockpit read model",
    );
    expect(() =>
      projectDashboardGovernance(duplicate, {
        collectedAt: "2026-07-23T04:30:00.000Z",
      }),
    ).toThrow(GovernanceProjectionError);

    const drift = sources();
    drift.baseline = drift.baseline.replace(
      "| Feature | Milestone |",
      "| Initiative | Phase |",
    );
    expect(() =>
      projectDashboardGovernance(drift, {
        collectedAt: "2026-07-23T04:30:00.000Z",
      }),
    ).toThrow(GovernanceProjectionError);
  });
});
