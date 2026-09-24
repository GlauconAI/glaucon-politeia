import { describe, expect, it } from "vitest";

import { renderWorkItemDueDigest } from "@/lib/observatory/work-item-due-digest";

const baseItem = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ship Concerto reminders",
  projectRef: "plato/dashboard",
  owner: "Glaucon",
  assignedAgentId: "plato",
  state: "in_progress",
  priority: "high",
  dueOn: "2026-09-23",
} as const;

describe("Work Tracker due digest", () => {
  it("groups only unfinished overdue, today, and tomorrow items", () => {
    const output = renderWorkItemDueDigest({
      today: "2026-09-23",
      baseUrl: "https://402v.com/work-tracker",
      items: [
        { ...baseItem, id: "1", title: "Old", dueOn: "2026-09-20" },
        { ...baseItem, id: "2", title: "Today" },
        { ...baseItem, id: "3", title: "Tomorrow", dueOn: "2026-09-24" },
        { ...baseItem, id: "4", title: "Later", dueOn: "2026-09-25" },
        { ...baseItem, id: "5", title: "Done", state: "done" },
        { ...baseItem, id: "6", title: "No date", dueOn: null },
      ],
    });

    expect(output).toContain("已逾期（1）");
    expect(output).toContain("今天到期（1）");
    expect(output).toContain("明天到期（1）");
    expect(output).toContain("Old");
    expect(output).toContain("Today");
    expect(output).toContain("Tomorrow");
    expect(output).not.toContain("Later");
    expect(output).not.toContain("Done");
    expect(output).not.toContain("No date");
    expect(output).toContain("https://402v.com/work-tracker");
  });

  it("sorts by group, date, priority, Project, and title", () => {
    const output = renderWorkItemDueDigest({
      today: "2026-09-23",
      baseUrl: "https://402v.com/work-tracker",
      items: [
        { ...baseItem, id: "1", title: "Zulu", priority: "low", dueOn: "2026-09-22" },
        { ...baseItem, id: "2", title: "Alpha", priority: "urgent", dueOn: "2026-09-22" },
        { ...baseItem, id: "3", title: "Earlier", priority: "low", dueOn: "2026-09-20" },
      ],
    });

    expect(output.indexOf("Earlier")).toBeLessThan(output.indexOf("Alpha"));
    expect(output.indexOf("Alpha")).toBeLessThan(output.indexOf("Zulu"));
  });

  it("normalizes user-authored control characters into one plain-text line", () => {
    const output = renderWorkItemDueDigest({
      today: "2026-09-23",
      baseUrl: "https://402v.com/work-tracker",
      items: [{
        ...baseItem,
        title: "Break\nmessage\u0000 *markdown*",
        projectRef: "plato\r/dashboard",
      }],
    });

    expect(output).toContain("plato /dashboard / Break message *markdown*");
    expect(output).not.toContain("\u0000");
  });

  it("bounds item count and UTF-8 bytes while reporting omissions", () => {
    const output = renderWorkItemDueDigest({
      today: "2026-09-23",
      baseUrl: "https://402v.com/work-tracker",
      maxItems: 2,
      maxBytes: 500,
      items: Array.from({ length: 8 }, (_, index) => ({
        ...baseItem,
        id: String(index),
        title: `事项 ${index} ${"很长".repeat(20)}`,
      })),
    });

    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(500);
    expect(output).toMatch(/另有 \d+ 项未展开/u);
  });

  it("returns an empty string when no item matches", () => {
    expect(
      renderWorkItemDueDigest({
        today: "2026-09-23",
        baseUrl: "https://402v.com/work-tracker",
        items: [{ ...baseItem, state: "done" }],
      }),
    ).toBe("");
  });
});
