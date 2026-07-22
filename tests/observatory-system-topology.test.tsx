import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SystemTopology } from "@/components/observatory/SystemTopology";
import type {
  ObservatoryAsset,
  ObservatoryRelationship,
} from "@/lib/observatory/asset-schema";

const assets: ObservatoryAsset[] = [
  {
    id: "skill:plato:weather",
    kind: "skill",
    name: "weather",
    owner: "plato",
    authority: "observed",
    source: "openclaw/skills-list",
    collected_at: "2026-07-22T22:00:00.000Z",
    freshness: "fresh",
    health: "healthy",
    summary: "Ready",
    labels: [],
  },
];
const relationship: ObservatoryRelationship = {
  from: "agent:plato",
  to: "skill:plato:weather",
  kind: "exposes",
  authority: "observed",
  source: "openclaw/skills-list",
};

describe("SystemTopology", () => {
  it("uses a semantic relationship list as the accessible source", () => {
    render(
      <SystemTopology
        assets={assets}
        coreEndpointLabels={{ "agent:plato": "Plato" }}
        relationships={[relationship]}
      />,
    );

    const region = screen.getByRole("region", { name: /system topology/i });
    expect(within(region).getByRole("list")).toBeInTheDocument();
    expect(within(region).getByRole("listitem")).toHaveTextContent(
      "Plato exposes weather",
    );
    expect(within(region).getByText("openclaw/skills-list")).toBeInTheDocument();
    expect(region.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("caps visual edges while retaining the complete semantic list", () => {
    const relationships = Array.from({ length: 30 }, (_, index) => ({
      ...relationship,
      kind: `relation-${index}`,
    }));
    render(
      <SystemTopology
        assets={assets}
        coreEndpointLabels={{ "agent:plato": "Plato" }}
        relationships={relationships}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(30);
    expect(document.querySelectorAll("svg line")).toHaveLength(20);
  });
});
