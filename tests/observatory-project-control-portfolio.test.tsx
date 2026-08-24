import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectControlPortfolio } from "@/components/observatory/ProjectControlPortfolio";
import { ProjectControlSnapshotSchema } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

describe("ProjectControlPortfolio", () => {
  it("renders retained producer facts as stale when source health is stale", () => {
    const snapshot = ProjectControlSnapshotSchema.parse(asgardProjectControlFixture());
    render(
      <ProjectControlPortfolio
        snapshot={snapshot}
        sourceStatus="stale"
        collectedAt="2026-08-23T20:10:00Z"
        registryProjects={[{ projectKey: "plato/dashboard", title: "Dashboard" }]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "last-known-good Project Control facts",
    );
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText("Registry match unavailable")).toBeInTheDocument();
    expect(screen.getByText("Unmatched Project")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });
});
