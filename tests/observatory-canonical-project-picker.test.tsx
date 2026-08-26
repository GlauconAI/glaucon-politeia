import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanonicalProjectPicker } from "@/components/observatory/CanonicalProjectPicker";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";

const projects: WorkTrackerProjectOption[] = [
  {
    projectKey: "plato/dashboard",
    title: "Dashboard",
    owner: "plato",
    status: "active",
  },
  {
    projectKey: "amou/wenya-ai",
    title: "问芽 AI",
    owner: "amou",
    status: "maintained",
  },
];

describe("CanonicalProjectPicker", () => {
  it("searches canonical Projects by title, key, owner, and status", () => {
    render(
      <CanonicalProjectPicker
        id="project-ref"
        projects={projects}
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Search Project")).toHaveAttribute(
      "type",
      "search",
    );
    expect(screen.getByLabelText("Project")).toHaveAttribute(
      "name",
      "projectRef",
    );
    expect(screen.getByRole("option", { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /问芽 AI/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search Project"), {
      target: { value: "amou" },
    });

    expect(screen.queryByRole("option", { name: /Dashboard/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /问芽 AI/ })).toBeInTheDocument();
  });

  it("supports an explicit all-projects option and reports selection changes", () => {
    const onChange = vi.fn();
    render(
      <CanonicalProjectPicker
        id="project-filter"
        projects={projects}
        value="all"
        onChange={onChange}
        name={undefined}
        allowAll
      />,
    );

    expect(screen.getByLabelText("Project")).toHaveValue("all");
    expect(screen.getByRole("option", { name: "All Projects" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: "plato/dashboard" },
    });
    expect(onChange).toHaveBeenCalledWith("plato/dashboard");
  });

  it("preserves a selected option while searching and bounds an unavailable registry", () => {
    const view = render(
      <CanonicalProjectPicker
        id="project-ref"
        projects={projects}
        value="plato/dashboard"
        onChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Search Project"), {
      target: { value: "问芽" },
    });
    expect(screen.getByLabelText("Project")).toHaveValue("plato/dashboard");
    expect(screen.getByRole("option", { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /问芽 AI/ })).toBeInTheDocument();

    view.rerender(
      <CanonicalProjectPicker
        id="project-ref"
        projects={[]}
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Project registry is unavailable/i,
    );
    expect(screen.getByLabelText("Project")).toBeDisabled();
  });
});
