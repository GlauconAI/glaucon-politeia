import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectVersionManager } from "@/components/observatory/ProjectVersionManager";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";

const version: ObservatoryProjectVersionRow = {
  id: "22222222-2222-4222-8222-222222222222", project_key: "plato/dashboard",
  version_label: "v1.0", title: "First release", description: "", status: "planned",
  target_date: null, released_at: null, is_backlog: false, row_version: 1,
  created_by: "admin", created_at: "2026-09-02T00:00:00Z", updated_by: "admin", updated_at: "2026-09-02T00:00:00Z",
};

describe("ProjectVersionManager", () => {
  it("creates, edits and exposes only legal lifecycle actions without delete", () => {
    render(<ProjectVersionManager projects={[{ projectKey: "plato/dashboard", title: "Dashboard", owner: "plato", status: "active" }]} versions={[version]} />);
    expect(screen.getByRole("button", { name: "创建计划版本" })).toBeInTheDocument();
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "转为进行中" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "转为已取消" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /删除/u })).not.toBeInTheDocument();
  });
});
