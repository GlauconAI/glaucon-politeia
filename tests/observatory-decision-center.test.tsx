import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DecisionCenter } from "@/components/observatory/DecisionCenter";
import { listProjectControlDecisions } from "@/lib/observatory/project-control";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

describe("DecisionCenter", () => {
  it("separates evidence-blocked work from audited decisions", () => {
    const snapshot = ProjectControlSnapshotSchema.parse(asgardProjectControlFixture());
    render(<DecisionCenter decisions={listProjectControlDecisions(snapshot)} />);

    expect(screen.getByRole("heading", { name: "Decision Center" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs evidence" })).toBeInTheDocument();
    expect(screen.getByText("Freeze prototype interfaces")).toBeInTheDocument();
    expect(screen.getByText("2 missing evidence records")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decision audit" })).toBeInTheDocument();
    expect(screen.getByText("Choose the core direction")).toBeInTheDocument();
    expect(screen.getByText("Mutualism network")).toBeInTheDocument();
  });
});
