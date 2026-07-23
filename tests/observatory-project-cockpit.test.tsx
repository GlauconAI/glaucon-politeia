import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectCockpit } from "@/components/observatory/ProjectCockpit";
import { projectDashboardGovernance } from "@/lib/observatory/governance-markdown";

const root = join(process.cwd(), "tests/fixtures/observatory-governance");
const governance = projectDashboardGovernance(
  {
    readme: readFileSync(join(root, "README.md"), "utf8"),
    baseline: readFileSync(join(root, "development-baseline.md"), "utf8"),
    tracker: readFileSync(join(root, "edad-tracker.md"), "utf8"),
    calibration: readFileSync(join(root, "estimate-calibration.md"), "utf8"),
  },
  { collectedAt: "2026-07-23T04:30:00.000Z" },
);

describe("ProjectCockpit", () => {
  it("renders portfolio facts, hierarchy, contracts, and missing dates", () => {
    render(<ProjectCockpit governance={governance} />);

    const cockpit = screen.getByRole("region", { name: /project cockpit/i });
    expect(within(cockpit).getByText("Dashboard")).toBeInTheDocument();
    expect(within(cockpit).getByText(/candidate baseline/i)).toBeInTheDocument();
    expect(within(cockpit).getByText("M2")).toBeInTheDocument();
    expect(
      within(cockpit).getByText(/OBS-F106 · Dashboard Project Cockpit/i),
    ).toBeInTheDocument();
    expect(
      within(cockpit).getByText(/OBS-T1061 · Define cockpit read model/i),
    ).toBeInTheDocument();
    expect(within(cockpit).getAllByText("IMPLEMENT").length).toBeGreaterThan(0);
    expect(within(cockpit).getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("searches the hierarchy and filters by normalized status", () => {
    render(<ProjectCockpit governance={governance} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search delivery hierarchy/i }),
      { target: { value: "T1061" } },
    );
    expect(screen.getByText(/OBS-T1061 · Define cockpit read model/i)).toBeInTheDocument();
    expect(screen.queryByText(/OBS-F106 · Dashboard Project Cockpit/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /filter delivery status/i }), {
      target: { value: "done" },
    });
    expect(screen.getByText(/no matching delivery items/i)).toBeInTheDocument();
  });

  it("renders Executor Runs, Gates, risks, dependencies, and safe evidence", () => {
    render(<ProjectCockpit governance={governance} />);

    expect(screen.getByText("RUN-T1061-01")).toBeInTheDocument();
    expect(screen.getByText("GATE-M1")).toBeInTheDocument();
    expect(screen.getByText("Baseline drift")).toBeInTheDocument();
    expect(screen.getByText("Project Flow artifacts")).toBeInTheDocument();
    expect(screen.getByText("Tests passed")).toBeInTheDocument();
  });

  it("renders a bounded empty state", () => {
    render(
      <ProjectCockpit
        governance={{
          ...governance,
          milestones: [],
          features: [],
          tasks: [],
          executor_runs: [],
          gates: [],
          risks: [],
          dependencies: [],
          summary: {
            milestone_count: 0,
            feature_count: 0,
            task_count: 0,
            run_count: 0,
            gate_count: 0,
            accepted_count: 0,
            active_count: 0,
            planned_count: 0,
            at_risk_count: 0,
            missing_date_count: 0,
            open_risk_count: 0,
            open_dependency_count: 0,
          },
        }}
      />,
    );

    expect(screen.getByText(/no delivery hierarchy records/i)).toBeInTheDocument();
  });
});
