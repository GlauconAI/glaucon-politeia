import { describe, it, expect } from "vitest";
import { ageObservatorySnapshot } from "@/lib/observatory/read-freshness";
import { createObservatoryRefreshReport } from "@/lib/observatory/refresh-report";
import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";

describe("daily refresh contract", () => {
  it("ages source observations independently and preserves source failures without changing persisted data", () => {
    const source = { generated_at: "2026-10-19T16:30:00Z", registry: { source: { freshness: "fresh" } }, summary: { freshness: "fresh" }, source_health: [
      { domain: "operations", collected_at: "2026-10-19T16:30:00Z", status: "fresh", health: "healthy" },
      { domain: "project_controls", collected_at: "2026-10-19T16:30:00Z", status: "unknown", health: "degraded", error_code: "SOURCE_MISSING" },
    ] } as unknown as ObservatoryCollectionEnvelope;
    const day = ageObservatorySnapshot(source, new Date("2026-10-20T16:30:00Z"));
    expect(day.summary.freshness).toBe("fresh");
    const late = ageObservatorySnapshot(source, new Date("2026-10-21T00:00:00Z"));
    expect(late.summary.freshness).toBe("stale");
    expect("source_health" in late && late.source_health[0].status).toBe("stale");
    expect("source_health" in late && late.source_health[1].status).toBe("unknown");
    expect(source.summary.freshness).toBe("fresh");
  });
  it("reports a model update but ignores observation timestamp churn", () => {
    const before = { agents: [{ id: "plato", display_name: "Plato", model_label: "old", collected_at: "yesterday" }] };
    const after = { agents: [{ id: "plato", display_name: "Plato", model_label: "new", collected_at: "today" }] };
    const report = createObservatoryRefreshReport(before, after, "2026-10-19T16:30:00.000Z", 1);
    expect(report.changes.agents.updated).toEqual(["Plato"]);
    expect(createObservatoryRefreshReport(after, { agents: [{ ...after.agents[0], collected_at: "tomorrow" }] }, "2026-10-19T16:30:00.000Z", 1).changes.agents.updated).toEqual([]);
  });
});

import { summarizeProjectWork } from "@/lib/observatory/project-work-portfolio";
it("keeps live Work counts grouped by Project and state", () => {
  expect(summarizeProjectWork([{ project_key: "a/b", state: "review" }, { project_key: "a/b", state: "review" }, { project_key: null, state: "active" }])).toEqual([{ projectKey: "a/b", total: 2, states: { review: 2 } }]);
});

it("counts legacy project_ref bindings instead of dropping project work", () => {
  expect(summarizeProjectWork([{ project_key: null, project_ref: "shared/maestro", state: "review" }])[0].total).toBe(1);
});
it("ignores recurring cron run timestamps in labels", () => {
  const asset = { id: "cron:one", kind: "cron", name: "daily", labels: [{key: "next_run_at", value: "today"}, {key: "schedule", value: "daily"}] };
  const after = {...asset, labels: [{key: "next_run_at", value: "tomorrow"}, {key: "schedule", value: "daily"}]};
  expect(createObservatoryRefreshReport({assets:[asset]}, {assets:[after]}, "2026-10-19T16:30:00.000Z", 1).changes.crons.updated).toEqual([]);
});

import { spawnSync } from "node:child_process";
it("returns a nonzero safe failure notification for a bad daily configuration", () => {
  const result = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/observatory/daily-refresh.mjs"], { cwd: process.cwd(), encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("Dashboard 每日更新失败");
  expect(result.stdout).toContain("configuration");
  expect(result.stderr).toBe("");
});
