import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GovernanceReview } from "@/components/observatory/GovernanceReview";
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

describe("GovernanceReview", () => {
  it("renders formal review, period reports, issues, history, and safe export", () => {
    render(<GovernanceReview governance={governance} />);

    const review = screen.getByRole("region", {
      name: /governance reports and review/i,
    });
    expect(within(review).getByText("Formal Governance Review")).toBeInTheDocument();
    expect(within(review).getByText("At risk")).toBeInTheDocument();
    expect(within(review).getByText("Weekly report")).toBeInTheDocument();
    expect(within(review).getByText("Monthly report")).toBeInTheDocument();
    expect(within(review).getByText("Data quality")).toBeInTheDocument();

    const issues = within(review).getByRole("table", {
      name: /governance issues/i,
    });
    expect(within(issues).getByText("Owner")).toBeInTheDocument();
    expect(within(issues).getByText("Status")).toBeInTheDocument();
    expect(within(issues).getByText("Evidence")).toBeInTheDocument();
    expect(within(issues).getByText("Source")).toBeInTheDocument();
    expect(within(issues).getByText("R1")).toBeInTheDocument();

    expect(within(review).getByText("DIR-0003")).toBeInTheDocument();
    expect(within(review).getByText("GATE-M1")).toBeInTheDocument();
    const exportLink = within(review).getByRole("link", {
      name: /export governance report/i,
    });
    expect(exportLink).toHaveAttribute(
      "download",
      expect.stringMatching(/^governance-report-.*\.json$/),
    );
    expect(exportLink.getAttribute("href")).toMatch(
      /^data:application\/json;charset=utf-8,/,
    );
  });

  it("renders explicit delay attribution from source evidence", () => {
    render(
      <GovernanceReview
        governance={{
          ...governance,
          dependencies: [
            {
              ...governance.dependencies[0],
              dependency: "External vendor dependency approval",
              status: "Blocked",
            },
          ],
        }}
      />,
    );

    const attribution = screen.getByRole("region", {
      name: /delay attribution/i,
    });
    expect(within(attribution).getByText("approval")).toBeInTheDocument();
    expect(within(attribution).getByText("dependency")).toBeInTheDocument();
    expect(within(attribution).getByText("external")).toBeInTheDocument();
    expect(within(attribution).getAllByText("DEP-001")).not.toHaveLength(0);
  });
});
