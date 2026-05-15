import { describe, expect, it } from "vitest";

import {
  exportTodosCsv,
  exportTodosJson,
  filterTodos,
  sortTodos,
  todoStorageFromJson,
} from "@/lib/todos/model";

const todos = [
  { id: "1", title: "Low", notes: "", priority: "low" as const, completed: false, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "2", title: "High", notes: "a,b", priority: "high" as const, completed: true, createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
];

describe("todo model", () => {
  it("filters and sorts todos", () => {
    expect(filterTodos(todos, "active")).toHaveLength(1);
    expect(sortTodos(todos, "priority")[0].priority).toBe("high");
  });

  it("exports json and csv safely", () => {
    expect(exportTodosJson(todos)).toContain('"version": 1');
    expect(exportTodosCsv(todos)).toContain('"a,b"');
  });

  it("falls back for invalid storage", () => {
    expect(todoStorageFromJson("not json")).toEqual({ version: 1, todos: [] });
  });
});
