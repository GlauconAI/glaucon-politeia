import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlowAnalytics } from "@/components/observatory/FlowAnalytics";
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

describe("FlowAnalytics", () => {
  it("renders metrics, no-fabrication states, provenance, and throughput table", () => {
    render(<FlowAnalytics governance={governance} />);

    const analytics = screen.getByRole("region", {
      name: /flow analytics and forecast/i,
    });
    expect(within(analytics).getByText("WIP")).toBeInTheDocument();
    expect(within(analytics).getByText("Throughput · 30 days")).toBeInTheDocument();
    expect(within(analytics).getByText("Cycle Time")).toBeInTheDocument();
    expect(within(analytics).getByText("SLE · P85")).toBeInTheDocument();
    expect(within(analytics).getByText("Blocked Time")).toBeInTheDocument();
    expect(within(analytics).getByText("Waiting Time")).toBeInTheDocument();
    expect(
      within(analytics).getAllByText(/explicit state-transition evidence/i),
    ).toHaveLength(2);
    expect(within(analytics).getByText("OBS-T1061")).toBeInTheDocument();
    expect(
      within(analytics).getByRole("table", { name: /daily throughput evidence/i }),
    ).toBeInTheDocument();
    expect(within(analytics).getByText(/at least 3 completed tasks/i)).toBeInTheDocument();
  });

  it("renders an evidenced forecast interval and confidence", () => {
    const sourceTask = governance.tasks[0];
    render(
      <FlowAnalytics
        governance={{
          ...governance,
          tasks: [
            {
              ...sourceTask,
              id: "OBS-T1061",
              actual_start: "2026-07-18T00:00:00Z",
              actual_finish: "2026-07-19T00:00:00Z",
            },
            {
              ...sourceTask,
              id: "OBS-T1062",
              contract_id: "EC-T1062",
              actual_start: "2026-07-19T00:00:00Z",
              actual_finish: "2026-07-20T00:00:00Z",
            },
            {
              ...sourceTask,
              id: "OBS-T1063",
              contract_id: "EC-T1063",
              actual_start: "2026-07-20T00:00:00Z",
              actual_finish: "2026-07-21T00:00:00Z",
            },
            {
              ...sourceTask,
              id: "OBS-T1064",
              contract_id: "EC-T1064",
              status_label: "Planned",
              status_category: "planned",
              actual_start: "not_recorded",
              actual_finish: "not_recorded",
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText(/low confidence/i)).not.toHaveLength(0);
    expect(screen.getByText(/forecast interval/i)).toBeInTheDocument();
    expect(screen.getByText(/remaining tasks: 1/i)).toBeInTheDocument();
  });
});
