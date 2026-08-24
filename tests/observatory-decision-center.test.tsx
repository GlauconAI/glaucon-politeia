import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DecisionCenter } from "@/components/observatory/DecisionCenter";
import { listProjectControlDecisions } from "@/lib/observatory/project-control";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

describe("DecisionCenter", () => {
  it("separates evidence-blocked work from audited decisions", () => {
    const snapshot = ProjectControlSnapshotSchema.parse(asgardProjectControlFixture());
    const decisions = listProjectControlDecisions(snapshot);
    const base = decisions.find((decision) => decision.status === "evidence_blocked")!;
    const pending = {
      ...base,
      decision_id: "decision-pending",
      title: "Confirm operating envelope",
      status: "pending" as const,
      missing_evidence_refs: [],
    };
    const ready = {
      ...base,
      decision_id: "decision-ready",
      title: "Approve interaction contract",
      status: "ready" as const,
      missing_evidence_refs: [],
    };
    render(
      <DecisionCenter
        decisions={[...decisions, pending, ready]}
        sourceStatus="stale"
        collectedAt="2026-08-23T20:10:00Z"
      />,
    );

    expect(screen.getByRole("heading", { name: "Decision Center" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "last-known-good Project Control decisions",
    );
    expect(screen.getByRole("heading", { name: "Needs evidence" })).toBeInTheDocument();
    expect(screen.getByText("Freeze prototype interfaces")).toBeInTheDocument();
    expect(screen.getByText("2 missing evidence records")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision audit" })).toBeInTheDocument();
    expect(screen.getByText("Choose the core direction")).toBeInTheDocument();
    expect(screen.getByText("Mutualism network")).toBeInTheDocument();
    expect(screen.getAllByText("Accept").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Admit playable implementation.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Downstream Stages: stage-08").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Decision status")).toBeInTheDocument();
    expect(screen.getByLabelText("Gate")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    const pendingSection = screen.getByRole("heading", { name: "Pending decisions" }).closest("section")!;
    const readySection = screen.getByRole("heading", { name: "Ready decision packages" }).closest("section")!;
    expect(within(pendingSection).getByText("Confirm operating envelope")).toBeInTheDocument();
    expect(within(pendingSection).queryByText("Approve interaction contract")).not.toBeInTheDocument();
    expect(within(readySection).getByText("Approve interaction contract")).toBeInTheDocument();
    expect(within(readySection).queryByText("Confirm operating envelope")).not.toBeInTheDocument();
    expect(within(pendingSection).getByText("Suggested actions")).toBeInTheDocument();
    expect(within(pendingSection).getByText("Request evidence")).toBeInTheDocument();
    expect(within(pendingSection).getByText("Return minimal work package")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Decision status"), {
      target: { value: "recorded" },
    });
    expect(screen.queryByText("Freeze prototype interfaces")).not.toBeInTheDocument();
    expect(screen.getByText("Choose the core direction")).toBeInTheDocument();
  });
});
