import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeliveryRoadmap } from "@/components/observatory/DeliveryRoadmap";
import { projectDashboardGovernance } from "@/lib/observatory/governance-markdown";

const root = join(process.cwd(), "tests/fixtures/observatory-governance");
const governance = projectDashboardGovernance(
  {
    readme: readFileSync(join(root, "README.md"), "utf8"),
    baseline: readFileSync(join(root, "development-baseline.md"), "utf8"),
    tracker: readFileSync(join(root, "edad-tracker.md"), "utf8"),
    calibration: readFileSync(join(root, "estimate-calibration.md"), "utf8"),
  },
  { collectedAt: "2026-07-23T18:20:20.140Z" },
);

describe("DeliveryRoadmap", () => {
  it("renders three tracks, baseline review, revision history, and table fallback", () => {
    render(<DeliveryRoadmap governance={governance} />);

    const roadmap = screen.getByRole("region", { name: /three-track roadmap/i });
    expect(within(roadmap).getAllByText("Original Baseline")).not.toHaveLength(0);
    expect(within(roadmap).getAllByText("Current Approved Plan")).not.toHaveLength(0);
    expect(within(roadmap).getAllByText("Actual")).not.toHaveLength(0);
    expect(within(roadmap).getByText(/baseline review/i)).toBeInTheDocument();
    expect(within(roadmap).getAllByText(/on track/i)).not.toHaveLength(0);
    expect(within(roadmap).getByText("DIR-0003")).toBeInTheDocument();

    const table = within(roadmap).getByRole("table", {
      name: /roadmap date facts/i,
    });
    expect(within(table).getByText("OBS-F106")).toBeInTheDocument();
    expect(within(table).getByText("Not recorded")).toBeInTheDocument();
  });

  it("renders a bounded empty state", () => {
    render(
      <DeliveryRoadmap
        governance={{
          ...governance,
          milestones: [],
          features: [],
          tasks: [],
          summary: {
            ...governance.summary,
            milestone_count: 0,
            feature_count: 0,
            task_count: 0,
            accepted_count: 0,
            active_count: 0,
            planned_count: 0,
            at_risk_count: 0,
            missing_date_count: 0,
          },
        }}
      />,
    );

    expect(screen.getByText(/no roadmap items reported/i)).toBeInTheDocument();
  });
});
