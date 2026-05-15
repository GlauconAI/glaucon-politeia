export type TodoPriority = "low" | "medium" | "high";
export type TodoFilter = "all" | "active" | "completed";
export type TodoSort = "priority" | "newest" | "oldest";

export type Todo = {
  id: string;
  title: string;
  notes: string;
  priority: TodoPriority;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export const todoStorageKey = "vibe-academy.todos.v1";

export function filterTodos(todos: Todo[], filter: TodoFilter) {
  if (filter === "active") return todos.filter((todo) => !todo.completed);
  if (filter === "completed") return todos.filter((todo) => todo.completed);
  return todos;
}

const priorityRank: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

export function sortTodos(todos: Todo[], sort: TodoSort) {
  return [...todos].sort((a, b) => {
    if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority];
    if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function todoStorageFromJson(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "");
    if (parsed?.version === 1 && Array.isArray(parsed.todos)) return parsed;
  } catch {}
  return { version: 1, todos: [] as Todo[] };
}

export function exportTodosJson(todos: Todo[]) {
  return JSON.stringify({ version: 1, todos }, null, 2);
}

function csvCell(value: string | boolean) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function exportTodosCsv(todos: Todo[]) {
  const header = ["id", "title", "notes", "priority", "completed", "createdAt", "updatedAt"];
  return [
    header.join(","),
    ...todos.map((todo) =>
      [todo.id, todo.title, todo.notes, todo.priority, todo.completed, todo.createdAt, todo.updatedAt]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}
