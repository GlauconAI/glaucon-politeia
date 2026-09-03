import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectVersionPicker } from "@/components/observatory/ProjectVersionPicker";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";

const base = {
  description: "",
  target_date: null,
  released_at: null,
  is_backlog: false,
  row_version: 1,
  created_by: "admin",
  created_at: "2026-09-02T00:00:00Z",
  updated_by: "admin",
  updated_at: "2026-09-02T00:00:00Z",
} as const;
const versions: ObservatoryProjectVersionRow[] = [
  { ...base, id: "11111111-1111-4111-8111-111111111111", project_key: "plato/dashboard", version_label: "Backlog", title: "待规划", status: "planned", is_backlog: true },
  { ...base, id: "22222222-2222-4222-8222-222222222222", project_key: "plato/dashboard", version_label: "v1.0", title: "Release", status: "active" },
  { ...base, id: "33333333-3333-4333-8333-333333333333", project_key: "amou/wenya-ai", version_label: "v2.0", title: "Other", status: "active" },
  { ...base, id: "44444444-4444-4444-8444-444444444444", project_key: "plato/dashboard", version_label: "v0.1", title: "Old", status: "archived" },
  { ...base, id: "55555555-5555-4555-8555-555555555555", project_key: "plato/dashboard", version_label: "v0.2", title: "Released", status: "released" },
  { ...base, id: "66666666-6666-4666-8666-666666666666", project_key: "plato/dashboard", version_label: "v0.3", title: "Cancelled", status: "cancelled" },
];

describe("ProjectVersionPicker", () => {
  it("shows only available versions from the selected Project", () => {
    const onChange = vi.fn();
    render(<ProjectVersionPicker id="version" versions={versions} projectKey="plato/dashboard" value="" onChange={onChange} />);
    expect(screen.getByRole("option", { name: "待规划 · 计划中" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "v1.0 · 进行中" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /v2.0/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /v0.1/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /v0.2/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /v0.3/u })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Project Version" }), { target: { value: versions[1].id } });
    expect(onChange).toHaveBeenCalledWith(versions[1].id);
  });

  it("is disabled until a Project is selected", () => {
    render(<ProjectVersionPicker id="version" versions={versions} projectKey="" value="" onChange={() => undefined} />);
    expect(screen.getByRole("combobox", { name: "Project Version" })).toBeDisabled();
  });

  it("does not expose an empty value in filter mode", () => {
    render(<ProjectVersionPicker id="version-filter" versions={versions} projectKey="plato/dashboard" value="all" onChange={() => undefined} allowAll />);
    const values = Array.from(
      (screen.getByRole("combobox", { name: "Project Version" }) as HTMLSelectElement).options,
      (option) => option.value,
    );
    expect(values[0]).toBe("all");
    expect(values).not.toContain("");
    expect(values).toContain(versions[3].id);
    expect(values).toContain(versions[4].id);
    expect(values).toContain(versions[5].id);
  });

  it("preserves a synthetic current option for a terminal historical binding", () => {
    render(<ProjectVersionPicker
      id="version-history"
      versions={versions}
      projectKey="plato/dashboard"
      value={versions[4].id}
      onChange={() => undefined}
    />);

    expect(screen.getByRole("option", { name: "Current version" })).toHaveValue(versions[4].id);
    expect(screen.queryByRole("option", { name: /v0.2/u })).not.toBeInTheDocument();
  });

  it("uses formal SemVer and marks the release target while preserving legacy labels", () => {
    render(<ProjectVersionPicker
      id="version-contract"
      versions={[
        { ...versions[1], semver: "1.0.0", is_release_target: true },
        { ...versions[0], semver: null },
      ]}
      projectKey="plato/dashboard"
      value=""
      onChange={() => undefined}
    />);
    expect(screen.getByRole("option", { name: "1.0.0 · 进行中 · Release target" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "待规划 · 计划中" })).toBeInTheDocument();
  });
});
