import { describe, expect, it } from "vitest";

import {
  classifyDueOn,
  formatDueLabel,
  vancouverDateAt,
} from "@/lib/observatory/work-item-due";

describe("Work Item due-date classification", () => {
  it("uses the Vancouver calendar day across DST boundaries", () => {
    expect(vancouverDateAt("2026-03-08T07:59:59.000Z")).toBe("2026-03-07");
    expect(vancouverDateAt("2026-03-08T08:00:00.000Z")).toBe("2026-03-08");
    expect(vancouverDateAt("2026-11-01T06:59:59.000Z")).toBe("2026-10-31");
    expect(vancouverDateAt("2026-11-01T07:00:00.000Z")).toBe("2026-11-01");
  });

  it.each([
    [null, "missing"],
    ["2028-02-28", "overdue"],
    ["2028-02-29", "today"],
    ["2028-03-01", "tomorrow"],
    ["2028-03-02", "later"],
  ] as const)("classifies %s as %s", (dueOn, expected) => {
    expect(classifyDueOn(dueOn, "2028-02-29")).toBe(expected);
  });

  it("formats deterministic operator labels", () => {
    expect(formatDueLabel("2026-09-22", "2026-09-23")).toBe("Overdue · 2026-09-22");
    expect(formatDueLabel("2026-09-23", "2026-09-23")).toBe("Due today");
    expect(formatDueLabel("2026-09-24", "2026-09-23")).toBe("Due tomorrow");
    expect(formatDueLabel("2026-10-01", "2026-09-23")).toBe("Due 2026-10-01");
    expect(formatDueLabel(null, "2026-09-23")).toBeNull();
  });
});
