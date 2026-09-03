import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectVersionManager } from "@/components/observatory/ProjectVersionManager";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";

const version: ObservatoryProjectVersionRow = {
  id: "22222222-2222-4222-8222-222222222222", project_key: "plato/dashboard",
  version_label: "1.0.0", semver: "1.0.0", title: "First release", description: "", status: "planned",
  target_date: null, released_at: null, is_backlog: false, row_version: 1,
  created_by: "admin", created_at: "2026-09-02T00:00:00Z", updated_by: "admin", updated_at: "2026-09-02T00:00:00Z",
};

describe("ProjectVersionManager", () => {
  it("creates, edits and exposes only legal lifecycle actions without delete", () => {
    render(<ProjectVersionManager projects={[{ projectKey: "plato/dashboard", title: "Dashboard", owner: "plato", status: "active" }]} versions={[version]} />);
    expect(screen.getByRole("button", { name: "创建计划版本" })).toBeInTheDocument();
    expect(screen.getAllByText("1.0.0").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "转为进行中" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "转为已取消" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /删除/u })).not.toBeInTheDocument();
  });

  it("renders the six-state roadmap with release, authority, predecessor, and Gate context", () => {
    const statuses = ["planned", "active", "gate_ready", "released", "archived", "cancelled"] as const;
    const roadmap = statuses.map((status, index): ObservatoryProjectVersionRow => ({
      ...version,
      id: `${index + 1}2222222-2222-4222-8222-222222222222`,
      version_label: `0.${index + 1}.0`,
      semver: `0.${index + 1}.0`,
      title: `${status} outcome`,
      status,
      is_release_target: status === "planned",
      milestone_ref: `milestone-${index + 1}`,
      predecessor_version_id: index === 0 ? null : `${index}2222222-2222-4222-8222-222222222222`,
      roadmap_ref: "knowledge/product-version-roadmap.md",
      approved_plan_ref: "plan/revision-4",
      acceptance_summary: status === "gate_ready" ? "Required items accepted" : "",
      dependencies_summary: "Runtime dependency",
      dependencies_satisfied: status === "gate_ready",
      artifacts_accepted: status === "gate_ready",
      verification_complete: status === "gate_ready",
      roadmap_reconciled: false,
      user_gate_decision_ref: status === "released" ? "decision/user-gate-7" : null,
    }));

    render(<ProjectVersionManager projects={[{ projectKey: "plato/dashboard", title: "Dashboard", owner: "plato", status: "active" }]} versions={roadmap} />);

    for (const label of ["计划中", "进行中", "待发布验收", "已发布", "已归档", "已取消"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Release target").some((node) => node.classList.contains("project-version-release-target"))).toBe(true);
    expect(screen.getAllByText("Predecessor")[1].closest("div")).toHaveTextContent("0.1.0");
    expect(screen.getAllByText("knowledge/product-version-roadmap.md")[0]).toBeInTheDocument();
    expect(screen.getAllByText("plan/revision-4")[0]).toBeInTheDocument();
    expect(screen.getByText(/Release Gate · 4\/5 complete/u)).toBeInTheDocument();
    expect(screen.getAllByText(/User Gate · pending/u).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("SemVer for 0.1.0")).toHaveValue("0.1.0");
    expect(screen.getAllByLabelText("Predecessor version").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Canonical roadmap reference").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Approved Plan reference").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("SemVer for 0.4.0")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("SemVer for 0.5.0")).not.toBeInTheDocument();
    expect(screen.getAllByText("Released and archived roadmap records are immutable.")).toHaveLength(2);
  });

  it("shows safe legacy placeholders when contract fields are absent", () => {
    render(<ProjectVersionManager projects={[{ projectKey: "plato/dashboard", title: "Dashboard", owner: "plato", status: "active" }]} versions={[version]} />);
    expect(screen.getByText("Predecessor").closest("div")).toHaveTextContent("none recorded");
    expect(screen.getByText(/Authority refs · not recorded/u)).toBeInTheDocument();
    expect(screen.getByText(/Release Gate · 0\/5 complete/u)).toBeInTheDocument();
  });
});
