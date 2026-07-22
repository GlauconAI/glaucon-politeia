import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FreshnessSummary } from "@/components/observatory/FreshnessSummary";
import { SystemInventory } from "@/components/observatory/SystemInventory";
import type {
  ObservatoryAsset,
  ObservatorySourceHealth,
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
    labels: [{ key: "eligibility", value: "ready" }],
  },
  {
    id: "cron:dashboard-refresh",
    kind: "cron",
    name: "Dashboard refresh",
    owner: "plato",
    authority: "observed",
    source: "openclaw/cron-list",
    collected_at: "2026-07-22T21:00:00.000Z",
    freshness: "stale",
    health: "failed",
    summary: "Every 15 minutes",
    labels: [{ key: "last_status", value: "failed" }],
  },
  {
    id: "knowledge:plato-academy",
    kind: "knowledge",
    name: "plato-academy",
    owner: "plato-academy",
    authority: "observed",
    source: "vault/plato-academy",
    collected_at: "2026-07-22T22:00:00.000Z",
    freshness: "fresh",
    health: "healthy",
    summary: "Knowledge area present · metadata only",
    labels: [],
  },
];

const sourceHealth: ObservatorySourceHealth[] = [
  {
    domain: "skills",
    status: "fresh",
    health: "healthy",
    collected_at: "2026-07-22T22:00:00.000Z",
    last_success_at: "2026-07-22T22:00:00.000Z",
    asset_count: 1,
  },
  {
    domain: "operations",
    status: "failed",
    health: "failed",
    collected_at: "2026-07-22T22:00:00.000Z",
    last_success_at: "2026-07-22T21:00:00.000Z",
    asset_count: 1,
    error_code: "COMMAND_FAILED",
  },
];

describe("FreshnessSummary", () => {
  it("summarizes healthy, stale, and failed source domains with safe diagnostics", () => {
    render(<FreshnessSummary sources={sourceHealth} />);

    const region = screen.getByRole("region", { name: /source health/i });
    expect(within(region).getByText("1 healthy")).toBeInTheDocument();
    expect(within(region).getByText("1 failed")).toBeInTheDocument();
    expect(within(region).getByText("COMMAND_FAILED")).toBeInTheDocument();
    expect(within(region).getAllByText(/last success/i)).toHaveLength(2);
  });
});

describe("SystemInventory", () => {
  it("searches all domains and shows provenance on each asset", () => {
    render(<SystemInventory assets={assets} />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: /search system assets/i }),
      { target: { value: "weather" } },
    );

    expect(screen.getByRole("heading", { name: "weather" })).toBeInTheDocument();
    expect(screen.getByText("openclaw/skills-list")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard refresh" })).not.toBeInTheDocument();
  });

  it("filters by domain and health using labelled native selects", () => {
    render(<SystemInventory assets={assets} />);
    fireEvent.change(screen.getByRole("combobox", { name: /asset domain/i }), {
      target: { value: "operations" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /asset health/i }), {
      target: { value: "failed" },
    });

    expect(screen.getByRole("heading", { name: "Dashboard refresh" })).toBeInTheDocument();
    expect(screen.getByText("stale", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "weather" })).not.toBeInTheDocument();
  });

  it("renders a useful empty result", () => {
    render(<SystemInventory assets={[]} />);
    expect(screen.getByText(/no system assets reported/i)).toBeInTheDocument();
  });
});
