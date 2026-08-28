import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectControlView } from "@/components/observatory/ProjectControlView";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";

const boundWorkItem: ObservatoryWorkItemRow = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "feature",
  title: "Validate coordinate interaction",
  description: "Run the coordinate interaction slice.",
  state: "in_progress",
  priority: "high",
  owner_id: "22222222-2222-4222-8222-222222222222",
  assigned_agent_id: "plato",
  acceptance_criteria: "The slice is deterministic.",
  project_ref: null,
  milestone_ref: null,
  project_key: "asgard/archaea-gacha-game",
  plan_revision: 3,
  stage_id: "stage-05b",
  work_package_id: "wp-05b-coordinate-slice",
  idempotency_key: "project-control-test",
  version: 1,
  created_by: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-08-23T20:00:00Z",
  updated_at: "2026-08-23T20:00:00Z",
  risk_level: "unclassified",
  agent_claim_enabled: false,
  authorized_paths: [],
  allowed_action_classes: [],
  claim_approved_by: null,
  claim_approved_at: null,
};

describe("ProjectControlView", () => {
  it("renders authority, DAG, control semantics, ledgers, and decisions", () => {
    const snapshot = ProjectControlSnapshotSchema.parse(
      asgardProjectControlFixture(),
    );
    render(
      <ProjectControlView
        project={snapshot.projects[0]}
        boundWorkItems={[boundWorkItem]}
        workTrackerAvailable
        sourceStatus="stale"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Asgard Archaea Game" }),
    ).toBeInTheDocument();
    expect(screen.getByText("OpenClaw Orchestrator")).toBeInTheDocument();
    expect(screen.getByText("Plan revision 3")).toBeInTheDocument();
    expect(screen.getAllByText("User + Owner line").length).toBeGreaterThan(0);
    expect(screen.getByText("Prototype freeze")).toBeInTheDocument();
    expect(screen.getByText("Coordinate interaction slice")).toBeInTheDocument();

    const dag = screen.getByRole("list", { name: "Stage dependency order" });
    expect(
      within(dag).getByText("3D board interaction prototype"),
    ).toBeInTheDocument();
    expect(within(dag).getAllByText(/Depends on/).length).toBeGreaterThan(0);
    expect(screen.getByText("Current canonical")).toBeInTheDocument();
    expect(screen.getByText("Evidence blocked")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current control" })).toBeInTheDocument();
    expect(screen.getByText("Current Stages")).toBeInTheDocument();
    expect(screen.getByText("Core direction")).toBeInTheDocument();
    expect(screen.getByText("No Stage is currently admissible.")).toBeInTheDocument();
    expect(within(dag).getAllByText(/^Unlocks/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Execution lines" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bound Work Tracker cards" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Validate coordinate interaction" })).toHaveAttribute(
      "href",
      `/work-tracker/items/${boundWorkItem.id}`,
    );
    expect(screen.getByRole("heading", { name: "Outcome reviews" })).toBeInTheDocument();
    expect(screen.getByText("Prototype outcome")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "last-known-good Project Control facts",
    );
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });
});
