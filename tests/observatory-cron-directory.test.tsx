import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CronDirectory,
  type CronDirectoryFilters,
} from "@/components/observatory/CronDirectory";
import type { DashboardCronEntry } from "@/lib/observatory/dashboard-directory";

const crons: DashboardCronEntry[] = [
  {
    assetId: "cron:daily",
    id: "daily",
    name: "Daily refresh",
    owner: "plato",
    enabled: true,
    health: "healthy",
    freshness: "fresh",
    collectedAt: "2026-08-31T18:10:00.000Z",
    scheduleType: "cron",
    scheduleValue: "0 18 * * *",
    scheduleSummary: "Cron · 0 18 * * *",
    timezone: "America/Vancouver",
    lastStatus: "success",
    lastRunAt: "2026-08-31T18:00:00.000Z",
    nextRunAt: "2026-09-01T01:00:00.000Z",
    consecutiveErrors: 0,
    runtimeTarget: "isolated",
  },
  {
    assetId: "cron:interval",
    id: "interval",
    name: "Quarter-hour sync",
    owner: "socrates",
    enabled: false,
    health: "disabled",
    freshness: "fresh",
    collectedAt: "2026-08-31T18:10:00.000Z",
    scheduleType: "every",
    scheduleValue: "900000",
    scheduleSummary: "Every 15 minutes",
    timezone: null,
    lastStatus: null,
    lastRunAt: null,
    nextRunAt: null,
    consecutiveErrors: null,
    runtimeTarget: "main",
  },
  {
    assetId: "cron:renewal",
    id: "renewal",
    name: "Renewal reminder",
    owner: "plato",
    enabled: true,
    health: "failed",
    freshness: "stale",
    collectedAt: "2026-08-30T18:10:00.000Z",
    scheduleType: "at",
    scheduleValue: "2026-10-01T16:00:00.000Z",
    scheduleSummary: "Once · 2026-10-01T16:00:00.000Z",
    timezone: null,
    lastStatus: "failed",
    lastRunAt: "2026-08-30T18:00:00.000Z",
    nextRunAt: "2026-10-01T16:00:00.000Z",
    consecutiveErrors: 2,
    runtimeTarget: "session-bound",
  },
];

const defaults: CronDirectoryFilters = {
  q: "",
  owner: "all",
  type: "all",
  enabled: "all",
  health: "all",
  sort: "next",
};

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("CronDirectory", () => {
  it("uses a responsive card and statistic grid", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/\.dashboard-cron-stats\s*\{[^}]*display:\s*grid/u);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*\.dashboard-cron-stats[\s\S]*grid-template-columns:\s*repeat\(2,/u,
    );
  });

  it("shows total, enabled, attention, and schedule-type statistics", () => {
    render(
      <CronDirectory
        crons={crons}
        initialFilters={defaults}
        sourceStatus="fresh"
        sourceCollectedAt="2026-08-31T18:10:00.000Z"
      />,
    );

    expect(screen.getByText("3 Cron Jobs")).toBeInTheDocument();
    expect(screen.getByText("2 enabled")).toBeInTheDocument();
    expect(screen.getByText("1 needs attention")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /calendar expression.*1/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fixed interval.*1/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /one-time task.*1/i }))
      .toBeInTheDocument();
  });

  it("searches and filters by Owner, type, enabled state, and health", () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    render(
      <CronDirectory
        crons={crons}
        initialFilters={defaults}
        sourceStatus="fresh"
        sourceCollectedAt={null}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: /search Cron Jobs/i }), {
      target: { value: "reminder" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Cron owner/i }), {
      target: { value: "plato" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /schedule type/i }), {
      target: { value: "at" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /enabled state/i }), {
      target: { value: "enabled" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /run health/i }), {
      target: { value: "failed" },
    });

    expect(screen.getByRole("heading", { name: "Renewal reminder" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Daily refresh" }))
      .not.toBeInTheDocument();
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/dashboard/crons?q=reminder&owner=plato&type=at&enabled=enabled&health=failed",
    );
  });

  it("filters with schedule statistic buttons and sorts by name", () => {
    render(
      <CronDirectory
        crons={crons}
        initialFilters={{ ...defaults, sort: "name" }}
        sourceStatus="fresh"
        sourceCollectedAt={null}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /fixed interval.*1/i }),
    );
    expect(screen.getByRole("heading", { name: "Quarter-hour sync" }))
      .toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Daily refresh" }))
      .not.toBeInTheDocument();
  });

  it("renders every safe card field and no mutation controls", () => {
    render(
      <CronDirectory
        crons={[crons[2]!]}
        initialFilters={defaults}
        sourceStatus="stale"
        sourceCollectedAt="2026-08-30T18:10:00.000Z"
      />,
    );

    const card = screen.getByRole("article");
    expect(within(card).getByText("Renewal reminder")).toBeInTheDocument();
    expect(within(card).getByText("plato")).toBeInTheDocument();
    expect(within(card).getAllByText("failed").length).toBeGreaterThan(0);
    expect(within(card).getByText("One-time task")).toBeInTheDocument();
    expect(within(card).getByText("2026-10-01T16:00:00.000Z"))
      .toBeInTheDocument();
    expect(within(card).getByText("session-bound")).toBeInTheDocument();
    expect(within(card).getByText("renewal")).toBeInTheDocument();
    expect(within(card).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/source.*stale/i);
    expect(screen.queryByRole("button", { name: /run|delete|disable/i }))
      .not.toBeInTheDocument();
  });

  it("renders Not reported for legacy missing fields and an empty state", () => {
    render(
      <CronDirectory
        crons={[crons[1]!]}
        initialFilters={{ ...defaults, q: "missing" }}
        sourceStatus="failed"
        sourceCollectedAt={null}
      />,
    );

    expect(screen.getByText(/No Cron Jobs match/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/source.*failed/i);
  });
});
