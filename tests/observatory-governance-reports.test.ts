import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  deriveGovernanceReport,
  serializeGovernanceReport,
} from "@/lib/observatory/governance-reports";
import { projectDashboardGovernance } from "@/lib/observatory/governance-markdown";

const root = join(process.cwd(), "tests/fixtures/observatory-governance");

function governance() {
  return projectDashboardGovernance(
    {
      readme: readFileSync(join(root, "README.md"), "utf8"),
      baseline: readFileSync(join(root, "development-baseline.md"), "utf8"),
      tracker: readFileSync(join(root, "edad-tracker.md"), "utf8"),
      calibration: readFileSync(join(root, "estimate-calibration.md"), "utf8"),
    },
    { collectedAt: "2026-07-23T18:20:20.140Z" },
  );
}

describe("deriveGovernanceReport", () => {
  it("builds an off-track review with source-linked issues and explicit attribution", () => {
    const model = governance();
    model.features[0] = {
      ...model.features[0],
      baseline_finish: "2026-07-20",
      forecast_finish: "2026-07-22",
      actual_finish: "2026-07-23",
    };
    model.risks[0] = {
      ...model.risks[0],
      impact: "High delivery impact",
      description: "External vendor approval blocked",
    };
    model.dependencies[0] = {
      ...model.dependencies[0],
      dependency: "External API dependency",
      status: "Blocked",
    };

    const report = deriveGovernanceReport(model);

    expect(report.review).toMatchObject({
      status: "off_track",
      source_digest: model.source.source_digest,
    });
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "risk:R1",
          category: "risk",
          owner: "Not recorded",
          status: "Open",
          source: "dashboard/edad-tracker.md",
        }),
        expect.objectContaining({
          id: "dependency:DEP-001",
          owner: "OpenClaw Project Flow",
          status: "Blocked",
        }),
        expect.objectContaining({
          id: "schedule:OBS-F106",
          category: "schedule",
          severity: "high",
        }),
      ]),
    );
    expect(report.delay_attribution.map(({ category }) => category)).toEqual(
      expect.arrayContaining(["approval", "dependency", "external"]),
    );
    expect(report.issues.every((issue) => issue.evidence_refs.length > 0)).toBe(
      true,
    );
  });

  it("creates deterministic weekly/monthly reports and data-quality findings", () => {
    const first = deriveGovernanceReport(governance());
    const second = deriveGovernanceReport(governance());

    expect(first).toEqual(second);
    expect(first.weekly).toMatchObject({
      id: expect.stringMatching(/^weekly-2026-07-23-/),
      period_start: "2026-07-17",
      period_end: "2026-07-23",
      completed_tasks: 1,
      executor_runs: 1,
      gate_decisions: 1,
    });
    expect(first.monthly).toMatchObject({
      id: expect.stringMatching(/^monthly-2026-07-23-/),
      period_start: "2026-06-24",
      period_end: "2026-07-23",
    });
    expect(first.data_quality.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "quality:missing-dates",
        "quality:blocked-duration",
        "quality:waiting-duration",
      ]),
    );
  });

  it("serializes a bounded safe audit artifact", () => {
    const report = deriveGovernanceReport(governance());
    const json = serializeGovernanceReport(report);
    const parsed = JSON.parse(json);

    expect(parsed.review.source_digest).toBe(report.review.source_digest);
    expect(parsed.export_json).toBeUndefined();
    expect(json.length).toBeLessThan(200_000);
    expect(json).not.toMatch(/\/Users\/|password|secret|raw_markdown/i);
  });
});
