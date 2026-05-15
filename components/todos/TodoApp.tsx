"use client";

import { useEffect, useMemo, useState } from "react";

import {
  exportTodosCsv,
  exportTodosJson,
  filterTodos,
  sortTodos,
  todoStorageFromJson,
  todoStorageKey,
  type Todo,
  type TodoFilter,
  type TodoPriority,
  type TodoSort,
} from "@/lib/todos/model";

function now() {
  return new Date().toISOString();
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    if (typeof window === "undefined") return [];
    return todoStorageFromJson(localStorage.getItem(todoStorageKey)).todos;
  });
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [sort, setSort] = useState<TodoSort>("priority");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<TodoPriority>("medium");

  useEffect(() => {
    localStorage.setItem(todoStorageKey, exportTodosJson(todos));
  }, [todos]);

  const visible = useMemo(
    () => sortTodos(filterTodos(todos, filter), sort),
    [todos, filter, sort],
  );
  const activeCount = todos.filter((todo) => !todo.completed).length;
  const completedCount = todos.length - activeCount;

  function addTodo() {
    if (!title.trim()) return;
    const timestamp = now();
    setTodos((current) => [
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        notes: notes.trim(),
        priority,
        completed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...current,
    ]);
    setTitle("");
    setNotes("");
    setPriority("medium");
  }

  function updateTodo(id: string, patch: Partial<Todo>) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, ...patch, updatedAt: now() } : todo,
      ),
    );
  }

  return (
    <section className="todo-page">
      <div className="todo-toolbar">
        <div>
          <p className="eyebrow">Local tool</p>
          <h1>TODO</h1>
          <p>总计 {todos.length} · 进行中 {activeCount} · 已完成 {completedCount}</p>
        </div>
        <button className="button-secondary" onClick={() => download("todos.json", exportTodosJson(todos), "application/json")}>导出 JSON</button>
        <button className="button-secondary" onClick={() => download("todos.csv", exportTodosCsv(todos), "text/csv")}>导出 CSV</button>
      </div>

      <div className="todo-form">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题" />
        <select value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="备注" />
        <button className="button-primary" onClick={addTodo}>添加待办</button>
      </div>

      <div className="todo-form">
        <select value={filter} onChange={(event) => setFilter(event.target.value as TodoFilter)}>
          <option value="all">全部</option>
          <option value="active">进行中</option>
          <option value="completed">已完成</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as TodoSort)}>
          <option value="priority">按优先级</option>
          <option value="newest">创建时间新到旧</option>
          <option value="oldest">创建时间旧到新</option>
        </select>
      </div>

      <ul className="todo-list">
        {visible.map((todo) => (
          <li key={todo.id} className="todo-item">
            <input type="checkbox" checked={todo.completed} onChange={(event) => updateTodo(todo.id, { completed: event.target.checked })} />
            <input value={todo.title} onChange={(event) => updateTodo(todo.id, { title: event.target.value })} />
            <input value={todo.notes} onChange={(event) => updateTodo(todo.id, { notes: event.target.value })} />
            <span>{todo.priority}</span>
            <button className="button-secondary" onClick={() => setTodos((current) => current.filter((item) => item.id !== todo.id))}>删除</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
