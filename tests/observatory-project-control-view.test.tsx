import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectControlView } from "@/components/observatory/ProjectControlView";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

describe("ProjectControlView", () => {
  it("renders authority, DAG, control semantics, ledgers, and decisions", () => {
    const snapshot = ProjectControlSnapshotSchema.parse(
      asgardProjectControlFixture(),
    );
    render(<ProjectControlView project={snapshot.projects[0]} />);

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
  });
});
