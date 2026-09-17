import { describe, expect, it } from "vitest";

import {
  buildCronOperations,
  isEnabledRecurringCron,
} from "@/lib/observatory/cron-operations";
import type { DashboardCronEntry } from "@/lib/observatory/dashboard-directory";

const FROM = "2026-09-17T07:00:00.000Z";

function entry(
  id: string,
  owner: string,
  overrides: Partial<DashboardCronEntry>,
): DashboardCronEntry {
  return {
    assetId: `cron:${id}`,
    id,
    name: id,
    owner,
    enabled: true,
    health: "healthy",
    freshness: "fresh",
    collectedAt: FROM,
    scheduleType: "cron",
    scheduleValue: "0 9 * * *",
    scheduleSummary: "Cron · 0 9 * * *",
    timezone: "America/Vancouver",
    lastStatus: "success",
    lastRunAt: "2026-09-16T16:00:00.000Z",
    nextRunAt: "2026-09-17T16:00:00.000Z",
    consecutiveErrors: 0,
    runtimeTarget: "isolated",
    ...overrides,
  };
}

describe("Cron operations model", () => {
  it("recognizes only enabled calendar and interval schedules as recurring", () => {
    expect(isEnabledRecurringCron(entry("daily", "plato", {}))).toBe(true);
    expect(
      isEnabledRecurringCron(
        entry("interval", "plato", {
          scheduleType: "every",
          scheduleValue: "900000",
        }),
      ),
    ).toBe(true);
    expect(
      isEnabledRecurringCron(entry("once", "plato", { scheduleType: "at" })),
    ).toBe(false);
    expect(
      isEnabledRecurringCron(entry("off", "plato", { enabled: false })),
    ).toBe(false);
  });

  it("projects timezone-aware Cron and fixed interval occurrences deterministically", () => {
    const model = buildCronOperations(
      [
        entry("daily", "plato", {}),
        entry("interval", "giskard", {
          scheduleType: "every",
          scheduleValue: String(6 * 60 * 60 * 1000),
          scheduleSummary: "Every 6 hours",
          timezone: null,
          nextRunAt: "2026-09-17T09:00:00.000Z",
        }),
      ],
      { from: FROM, horizonDays: 1 },
    );

    expect(
      model.occurrences
        .filter((occurrence) => occurrence.job.id === "daily")
        .map((occurrence) => occurrence.startsAt),
    ).toEqual(["2026-09-17T16:00:00.000Z"]);
    expect(
      model.occurrences
        .filter((occurrence) => occurrence.job.id === "interval")
        .map((occurrence) => occurrence.startsAt),
    ).toEqual([
      "2026-09-17T09:00:00.000Z",
      "2026-09-17T15:00:00.000Z",
      "2026-09-17T21:00:00.000Z",
      "2026-09-18T03:00:00.000Z",
    ]);
    expect(model.issues).toEqual([]);
    expect(model.dayGroups.map((group) => group.dayKey)).toEqual([
      "2026-09-17",
    ]);
  });

  it("finds same-minute hard conflicts and overlapping fifteen-minute crowded windows", () => {
    const model = buildCronOperations(
      [
        entry("a", "plato", {}),
        entry("b", "giskard", {}),
        entry("c", "socrates", {
          scheduleValue: "10 9 * * *",
          scheduleSummary: "Cron · 10 9 * * *",
          nextRunAt: "2026-09-17T16:10:00.000Z",
        }),
      ],
      { from: FROM, horizonDays: 1 },
    );

    expect(model.hardConflicts).toHaveLength(1);
    expect(model.hardConflicts[0]).toMatchObject({
      level: "hard",
      jobCount: 2,
      agentCount: 2,
      startsAt: "2026-09-17T16:00:00.000Z",
    });
    expect(model.crowdedWindows).toHaveLength(1);
    expect(model.crowdedWindows[0]).toMatchObject({
      level: "crowded",
      jobCount: 3,
      agentCount: 3,
      startsAt: "2026-09-17T16:00:00.000Z",
      endsAt: "2026-09-17T16:10:00.000Z",
    });
  });

  it("keeps every crowded window bounded to fifteen minutes across continuous load", () => {
    const model = buildCronOperations(
      [
        entry("at-zero", "plato", {}),
        entry("at-ten", "giskard", {
          scheduleValue: "10 9 * * *",
          scheduleSummary: "Cron · 10 9 * * *",
          nextRunAt: "2026-09-17T16:10:00.000Z",
        }),
        entry("at-twenty", "socrates", {
          scheduleValue: "20 9 * * *",
          scheduleSummary: "Cron · 20 9 * * *",
          nextRunAt: "2026-09-17T16:20:00.000Z",
        }),
      ],
      { from: FROM, horizonDays: 1 },
    );

    expect(model.crowdedWindows).toHaveLength(2);
    expect(
      model.crowdedWindows.every(
        (group) =>
          new Date(group.endsAt).getTime() - new Date(group.startsAt).getTime() <=
          15 * 60 * 1000,
      ),
    ).toBe(true);
    expect(model.crowdedWindows.map((group) => [group.startsAt, group.endsAt]))
      .toEqual([
        ["2026-09-17T16:00:00.000Z", "2026-09-17T16:10:00.000Z"],
        ["2026-09-17T16:10:00.000Z", "2026-09-17T16:20:00.000Z"],
      ]);
  });

  it("groups recurring load by Agent and orders jobs by their next occurrence", () => {
    const model = buildCronOperations(
      [
        entry("later", "plato", {
          scheduleValue: "30 10 * * *",
          nextRunAt: "2026-09-17T17:30:00.000Z",
        }),
        entry("earlier", "plato", {}),
        entry("attention", "giskard", {
          health: "failed",
          consecutiveErrors: 2,
        }),
      ],
      { from: FROM, horizonDays: 1 },
    );

    expect(model.agentSummaries.map((summary) => summary.owner)).toEqual([
      "giskard",
      "plato",
    ]);
    expect(model.agentSummaries[0]).toMatchObject({
      owner: "giskard",
      attentionCount: 1,
    });
    expect(model.agentSummaries[1]?.jobs.map((job) => job.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("reports invalid and capped schedules without hiding valid jobs", () => {
    const model = buildCronOperations(
      [
        entry("valid", "plato", {}),
        entry("bad-expression", "plato", { scheduleValue: "bad cron" }),
        entry("bad-timezone", "plato", { timezone: "Mars/Olympus" }),
        entry("bad-interval", "plato", {
          scheduleType: "every",
          scheduleValue: "zero",
          nextRunAt: FROM,
        }),
        entry("missing-anchor", "plato", {
          scheduleType: "every",
          scheduleValue: "900000",
          nextRunAt: null,
        }),
        entry("capped", "plato", {
          scheduleType: "every",
          scheduleValue: "60000",
          nextRunAt: "2026-09-17T07:01:00.000Z",
        }),
      ],
      { from: FROM, horizonDays: 1, maxOccurrencesPerJob: 2 },
    );

    expect(model.occurrences.some((occurrence) => occurrence.job.id === "valid"))
      .toBe(true);
    expect(
      Object.fromEntries(model.issues.map((issue) => [issue.name, issue.reason])),
    ).toEqual({
      "bad-expression": "invalid-expression",
      "bad-timezone": "invalid-timezone",
      "bad-interval": "invalid-interval",
      "missing-anchor": "missing-anchor",
      capped: "occurrence-cap",
    });
  });
});
