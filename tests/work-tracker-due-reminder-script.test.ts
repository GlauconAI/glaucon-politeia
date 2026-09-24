import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runDueReminder } from "../scripts/work-tracker/due-reminder.mjs";

function outputBuffer() {
  let value = "";
  return {
    stream: { write: (chunk: string) => { value += chunk; } },
    value: () => value,
  };
}

function database(rows: Record<string, unknown>[]) {
  let query = "";
  const sql = Object.assign(
    async (strings: TemplateStringsArray) => {
      query = strings.join("?");
      return rows;
    },
    { end: vi.fn().mockResolvedValue(undefined) },
  );
  return { connect: vi.fn(() => sql), query: () => query, end: sql.end };
}

describe("model-free Work Tracker due reminder", () => {
  it("loads local database configuration, runs one bounded query, and prints the digest", async () => {
    const stdout = outputBuffer();
    const stderr = outputBuffer();
    const db = database([{
      id: "item-1",
      title: "Ship reminder",
      project_ref: "plato/dashboard",
      owner: "Glaucon",
      assigned_agent_id: "plato",
      state: "in_progress",
      priority: "high",
      due_on: "2026-09-23",
      total_matching_items: "250",
    }]);

    await expect(runDueReminder({
      cwd: "/private/repo",
      now: new Date("2026-09-23T19:00:00.000Z"),
      readFile: vi.fn().mockResolvedValue("SUPABASE_DB_URL='postgres://secret@example.invalid/db'\n"),
      connect: db.connect,
      stdout: stdout.stream,
      stderr: stderr.stream,
    })).resolves.toBe(0);

    expect(db.connect).toHaveBeenCalledWith("postgres://secret@example.invalid/db");
    expect(db.query()).toContain("items.due_on <= ?::date");
    expect(db.query()).toContain("count(*) over() as total_matching_items");
    expect(db.query()).toContain("case items.priority");
    expect(db.query()).toContain("items.id");
    expect(db.query()).toContain("limit 200");
    expect(db.query()).not.toContain("select *");
    expect(stdout.value()).toContain("Work Tracker｜到期事项 · 2026-09-23");
    expect(stdout.value()).toContain("Ship reminder");
    expect(stdout.value()).toContain("另有 249 项未展开。");
    expect(stdout.value()).not.toContain("postgres://");
    expect(stderr.value()).toBe("");
    expect(db.end).toHaveBeenCalledOnce();
  });

  it("prints nothing when no item matches", async () => {
    const stdout = outputBuffer();
    const stderr = outputBuffer();
    const db = database([]);

    await expect(runDueReminder({
      readFile: vi.fn().mockResolvedValue("SUPABASE_DB_URL=postgres://secret/db"),
      connect: db.connect,
      stdout: stdout.stream,
      stderr: stderr.stream,
      now: new Date("2026-09-23T19:00:00.000Z"),
    })).resolves.toBe(0);
    expect(stdout.value()).toBe("");
    expect(stderr.value()).toBe("");
  });

  it("fails with one stable private-safe error", async () => {
    const stdout = outputBuffer();
    const stderr = outputBuffer();

    await expect(runDueReminder({
      readFile: vi.fn().mockRejectedValue(new Error("postgres://secret/db")),
      stdout: stdout.stream,
      stderr: stderr.stream,
    })).resolves.toBe(1);
    expect(stdout.value()).toBe("");
    expect(stderr.value()).toBe("WORK_TRACKER_DUE_REMINDER_FAILED\n");
    expect(stderr.value()).not.toContain("postgres://");
  });

  it("contains no Agent-turn or model API integration", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/work-tracker/due-reminder.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(/openai|anthropic|agentturn|sessions_spawn/iu);
    expect(source).toContain('ssl: "require"');
  });
});
