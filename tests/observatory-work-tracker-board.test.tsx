import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkTrackerBoard } from "@/components/observatory/WorkTrackerBoard";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import type { ObservatoryWorkItemClaimRow } from "@/lib/observatory/repository";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";
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
  {
    projectKey: "plato/unused",
    title: "Unused Project",
    owner: "plato",
    status: "active",
  },
];

const item: ObservatoryWorkItemRow = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "feature",
  title: "Build the manual board",
  description: "Admin-only workflow.",
  state: "triage",
  priority: "high",
  owner_id: "22222222-2222-4222-8222-222222222222",
  assigned_agent_id: "plato",
  acceptance_criteria: "The item reaches Done.",
  project_ref: "Dashboard",
  milestone_ref: "OBS-M3",
  project_key: null,
  project_version_id: "33333333-3333-4333-8333-333333333333",
  version_binding_kind: "required",
  plan_revision: null,
  stage_id: null,
  work_package_id: null,
  idempotency_key: "capture-1",
  version: 3,
  created_by: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-07-23T20:00:00.000Z",
  updated_at: "2026-07-23T20:05:00.000Z",
  risk_level: "unclassified",
  agent_claim_enabled: false,
  authorized_paths: [],
  allowed_action_classes: [],
  claim_approved_by: null,
  claim_approved_at: null,
};

const versions: ObservatoryProjectVersionRow[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    project_key: "plato/dashboard",
    version_label: "v1.0",
    title: "First release",
    description: "",
    status: "active",
    target_date: null,
    released_at: null,
    is_backlog: false,
    row_version: 1,
    created_by: item.created_by,
    created_at: item.created_at,
    updated_by: item.created_by,
    updated_at: item.updated_at,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    project_key: "plato/dashboard",
    version_label: "Backlog",
    title: "待规划",
    description: "",
    status: "planned",
    target_date: null,
    released_at: null,
    is_backlog: true,
    row_version: 1,
    created_by: item.created_by,
    created_at: item.created_at,
    updated_by: item.created_by,
    updated_at: item.updated_at,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    project_key: "plato/dashboard",
    version_label: "v0.9",
    title: "Archived release",
    description: "",
    status: "archived",
    target_date: null,
    released_at: null,
    is_backlog: false,
    row_version: 2,
    created_by: item.created_by,
    created_at: item.created_at,
    updated_by: item.created_by,
    updated_at: item.updated_at,
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    project_key: "amou/wenya-ai",
    version_label: "v2",
    title: "问芽第二版",
    description: "",
    status: "planned",
    target_date: null,
    released_at: null,
    is_backlog: false,
    row_version: 1,
    created_by: item.created_by,
    created_at: item.created_at,
    updated_by: item.created_by,
    updated_at: item.updated_at,
  },
];

describe("WorkTrackerBoard", () => {
  beforeAll(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/work-tracker");
  });

  it("shows and filters Project Versions while preserving detail return context", () => {
    const backlogItem = {
      ...item,
      id: "77777777-7777-4777-8777-777777777777",
      title: "Backlog card",
      project_version_id: versions[1].id,
    };
    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item, backlogItem] }}
        projects={projects}
        versions={versions}
        initialProjectKey="plato/dashboard"
        urlProjectKey="plato/dashboard"
      />,
    );
    expect(within(screen.getByTestId(`work-item-${item.id}`)).getByText("V1")).toBeInTheDocument();
    expect(within(screen.getByTestId(`work-item-${item.id}`)).getByText("Required scope")).toBeInTheDocument();
    expect(within(screen.getByTestId(`work-item-${backlogItem.id}`)).getByText("待")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Project Version" }), {
      target: { value: versions[0].id },
    });
    expect(screen.getByText(item.title)).toBeInTheDocument();
    expect(screen.queryByText(backlogItem.title)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "待规划 · 计划中" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "v0.9 · 已归档" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: item.title })).toHaveAttribute(
      "href",
      `/work-tracker/items/${item.id}?project=plato%2Fdashboard&version=${versions[0].id}`,
    );
  });

  it("keeps Project and Version controls together and scopes versions to the selected Project", () => {
    const otherProjectItem = {
      ...item,
      id: "99999999-9999-4999-8999-999999999999",
      title: "训练问芽模型",
      project_ref: "amou/wenya-ai",
      project_version_id: versions[3].id,
    };
    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item, otherProjectItem] }}
        projects={projects}
        versions={versions}
        initialProjectKey="plato/dashboard"
        urlProjectKey="plato/dashboard"
      />,
    );

    const filterGroup = screen.getByTestId("work-tracker-filter-group");
    expect(filterGroup).toHaveStyle({ display: "flex", flexWrap: "wrap" });
    expect(filterGroup.querySelector(".work-tracker-version-filter")).toHaveStyle({
      flex: "0 1 220px",
    });
    const controls = within(filterGroup).getAllByRole("combobox");
    expect(controls).toHaveLength(2);
    expect(controls[0]).toHaveAccessibleName("Filter by Project");
    expect(controls[1]).toHaveAccessibleName("Project Version");
    expect(within(controls[1]).getByRole("option", { name: "v1.0 · 进行中" })).toBeInTheDocument();
    expect(within(controls[1]).queryByRole("option", { name: "v2 · 计划中" })).not.toBeInTheDocument();

    fireEvent.change(controls[0], { target: { value: "amou/wenya-ai" } });

    expect(controls[1]).toHaveValue("all");
    expect(within(controls[1]).getByRole("option", { name: "v2 · 计划中" })).toBeInTheDocument();
    expect(within(controls[1]).queryByRole("option", { name: "v1.0 · 进行中" })).not.toBeInTheDocument();
    expect(within(screen.getByTestId(`work-item-${otherProjectItem.id}`)).getByText("V2")).toBeInTheDocument();
  });

  it("restores a valid stored Project on a clean URL", async () => {
    const otherProjectItem = {
      ...item,
      id: "55555555-5555-4555-8555-555555555555",
      title: "训练问芽模型",
      project_ref: "amou/wenya-ai",
    };
    window.localStorage.setItem("work-tracker:last-project", "amou/wenya-ai");

    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item, otherProjectItem] }}
        projects={projects}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Filter by Project")).toHaveValue("amou/wenya-ai"));
    expect(screen.queryByText(item.title)).not.toBeInTheDocument();
    expect(screen.getByText(otherProjectItem.title)).toBeInTheDocument();
    expect(window.location.search).toBe("?project=amou%2Fwenya-ai");
  });

  it("preserves the stored Project through server render and hydration", async () => {
    const otherProjectItem = {
      ...item,
      id: "55555555-5555-4555-8555-555555555555",
      title: "训练问芽模型",
      project_ref: "amou/wenya-ai",
    };
    window.localStorage.setItem("work-tracker:last-project", "amou/wenya-ai");
    const element = (
      <WorkTrackerBoard
        state={{ status: "ready", items: [item, otherProjectItem] }}
        projects={projects}
        initialProjectKey="all"
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, element);
    });

    await waitFor(() => expect(screen.getByLabelText("Filter by Project")).toHaveValue("amou/wenya-ai"));
    expect(window.localStorage.getItem("work-tracker:last-project")).toBe("amou/wenya-ai");
    expect(window.location.search).toBe("?project=amou%2Fwenya-ai");
    await act(async () => root?.unmount());
    container.remove();
  });

  it("lets a valid URL Project override storage and persists the URL choice", async () => {
    window.localStorage.setItem("work-tracker:last-project", "amou/wenya-ai");
    window.history.replaceState(null, "", "/work-tracker?project=plato%2Fdashboard");

    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item] }}
        projects={projects}
        initialProjectKey="plato/dashboard"
        urlProjectKey="plato/dashboard"
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Filter by Project")).toHaveValue("plato/dashboard"));
    expect(window.localStorage.getItem("work-tracker:last-project")).toBe("plato/dashboard");
  });

  it("clears a stale stored Project that has no Work Items", async () => {
    window.localStorage.setItem("work-tracker:last-project", "plato/unused");

    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item] }}
        projects={projects}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Filter by Project")).toHaveValue("all"));
    expect(window.localStorage.getItem("work-tracker:last-project")).toBeNull();
    expect(window.location.pathname + window.location.search).toBe("/work-tracker");
  });
  it("renders four active work groups and keeps Done in a separate view", () => {
    render(
      <WorkTrackerBoard state={{ status: "ready", items: [item] }} />,
    );

    for (const label of [
      "待处理",
      "待执行",
      "进行中",
      "待验收",
    ]) {
      expect(
        screen.getByRole("region", { name: new RegExp(`^${label}`, "i") }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: /^Done/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /进行中工作 1/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /已完成 0/i })).toBeInTheDocument();
    expect(screen.getByText("Build the manual board")).toBeInTheDocument();
    expect(screen.getAllByText("No work items.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Daily write surface")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Work Tracker" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/九种审计状态收束为四个工作分组/),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole("group", { name: "Work Tracker controls" }),
      ).getByText("1 of 1 items"),
    ).toBeVisible();
  });

  it("filters through the URL and only offers Projects that already have Items", () => {
    const otherProjectItem = {
      ...item,
      id: "55555555-5555-4555-8555-555555555555",
      title: "训练问芽模型",
      project_ref: "amou/wenya-ai",
    };
    window.history.replaceState(null, "", "/work-tracker");

    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item, otherProjectItem] }}
        projects={projects}
        initialProjectKey="all"
      />,
    );

    const filter = screen.getByLabelText("Filter by Project");
    expect(filter).toHaveValue("all");
    expect(screen.getByRole("option", { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /问芽 AI/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Unused Project/ })).not.toBeInTheDocument();
    expect(screen.getByText("Project: Dashboard")).toBeVisible();
    expect(screen.getByText("Project: 问芽 AI")).toBeVisible();
    expect(screen.getByText("2 of 2 items")).toBeVisible();
    expect(screen.queryByText(/Projects available/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by Project"), {
      target: { value: "amou/wenya-ai" },
    });
    expect(screen.queryByText("Build the manual board")).not.toBeInTheDocument();
    expect(screen.getByText("训练问芽模型")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 items")).toBeVisible();
    expect(window.location.pathname + window.location.search).toBe(
      "/work-tracker?project=amou%2Fwenya-ai",
    );
    expect(window.localStorage.getItem("work-tracker:last-project")).toBe("amou/wenya-ai");

    fireEvent.change(screen.getByLabelText("Filter by Project"), {
      target: { value: "all" },
    });
    expect(window.location.pathname + window.location.search).toBe(
      "/work-tracker",
    );
    expect(window.localStorage.getItem("work-tracker:last-project")).toBeNull();
  });

  it("labels unresolved legacy Project references without inventing registry membership", () => {
    render(
      <WorkTrackerBoard
        state={{
          status: "ready",
          items: [{ ...item, project_ref: "legacy-project" }],
        }}
        projects={projects}
      />,
    );

    expect(screen.getByText("Legacy Project: legacy-project")).toBeVisible();
  });

  it("links each compact card to its detail and exposes allowed moves in a three-dot menu", () => {
    render(
      <WorkTrackerBoard state={{ status: "ready", items: [item] }} />,
    );

    expect(
      screen.getByRole("link", { name: "Build the manual board" }),
    ).toHaveAttribute(
      "href",
      `/work-tracker/items/${item.id}`,
    );
    expect(screen.getByText("功能")).toHaveClass("work-tracker-type-feature");
    expect(screen.getByText("Triage")).toHaveClass("work-tracker-state-badge");
    expect(screen.queryByText(/Milestone:/)).not.toBeInTheDocument();
    expect(screen.getByText("Assigned · plato")).toBeVisible();

    fireEvent.click(
      screen.getByLabelText(/打开 build the manual board 操作菜单/i),
    );
    expect(screen.getByRole("button", { name: "移动到 Inbox" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "移动到 Ready" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移动到 Done" })).not.toBeInTheDocument();
  });

  it("closes an action menu on outside interaction, Escape, and opening another card", () => {
    const second = {
      ...item,
      id: "55555555-5555-4555-8555-555555555555",
      title: "Second card",
      assigned_agent_id: "amou",
    };
    render(
      <WorkTrackerBoard state={{ status: "ready", items: [item, second] }} />,
    );

    const firstTrigger = screen.getByLabelText(
      /打开 build the manual board 操作菜单/i,
    );
    const secondTrigger = screen.getByLabelText(/打开 second card 操作菜单/i);
    const firstMenu = firstTrigger.closest("details")!;
    const secondMenu = secondTrigger.closest("details")!;

    fireEvent.click(firstTrigger);
    expect(firstMenu).toHaveAttribute("open");
    expect(firstTrigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.pointerDown(document.body);
    expect(firstMenu).not.toHaveAttribute("open");

    fireEvent.click(firstTrigger);
    fireEvent.keyDown(firstMenu, { key: "Escape" });
    expect(firstMenu).not.toHaveAttribute("open");
    expect(firstTrigger).toHaveFocus();

    fireEvent.click(firstTrigger);
    fireEvent.click(secondTrigger);
    expect(firstMenu).not.toHaveAttribute("open");
    expect(secondMenu).toHaveAttribute("open");
  });

  it("labels manual, eligible, and actively claimed work without drag-only semantics", () => {
    const eligible = {
      ...item,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Eligible feature",
      state: "ready" as const,
      risk_level: "low" as const,
      agent_claim_enabled: true,
      authorized_paths: ["components/observatory"],
      allowed_action_classes: ["code_edit" as const],
    };
    const claimed = {
      ...eligible,
      id: "33333333-3333-4333-8333-333333333333",
      title: "Claimed feature",
      state: "in_progress" as const,
    };
    const claim: ObservatoryWorkItemClaimRow = {
      id: "44444444-4444-4444-8444-444444444444",
      work_item_id: claimed.id,
      agent_id: "plato-pilot",
      status: "active",
      claim_version: 1,
      started_at: "2026-07-23T20:00:00.000Z",
      last_heartbeat_at: "2026-07-23T20:01:00.000Z",
      lease_expires_at: "2099-07-23T20:15:00.000Z",
      ended_at: null,
      completion_summary: null,
      result_evidence_url: null,
      created_at: "2026-07-23T20:00:00.000Z",
      updated_at: "2026-07-23T20:01:00.000Z",
    };

    render(
      <WorkTrackerBoard
        state={{
          status: "ready",
          items: [item, eligible, claimed],
          activeClaims: [claim],
        }}
      />,
    );

    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("Agent eligible")).toBeInTheDocument();
    expect(screen.getByText("Claimed by plato-pilot")).toBeInTheDocument();
    expect(
      screen.getByLabelText(/打开 claimed feature 操作菜单/i),
    ).toBeInTheDocument();
  });

  it("submits the keyboard-operable move form with expected version", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ status: "success", version: 4 });
    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item] }}
        action={action}
      />,
    );

    fireEvent.click(
      screen.getByLabelText(/打开 build the manual board 操作菜单/i),
    );
    fireEvent.click(screen.getByRole("button", { name: "移动到 Ready" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("workItemId")).toBe(item.id);
    expect(submitted.get("expectedVersion")).toBe("3");
    expect(submitted.get("targetState")).toBe("ready");
  });

  it("reports stable failures from an explicit menu action", async () => {
    const action = vi.fn().mockResolvedValue({
      status: "error",
      formError: "This item changed. Refresh before trying again.",
    });
    render(
      <WorkTrackerBoard
        state={{ status: "ready", items: [item] }}
        action={action}
      />,
    );

    fireEvent.click(
      screen.getByLabelText(/打开 build the manual board 操作菜单/i),
    );
    fireEvent.click(screen.getByRole("button", { name: "移动到 Ready" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/changed.*refresh/i),
    );
  });

  it("switches to a compact completed history view", () => {
    const done = {
      ...item,
      id: "99999999-9999-4999-8999-999999999999",
      title: "Shipped release",
      state: "done" as const,
    };
    render(
      <WorkTrackerBoard state={{ status: "ready", items: [item, done] }} />,
    );

    expect(screen.queryByText("Shipped release")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /已完成 1/i }));
    expect(screen.getByText("Shipped release")).toBeInTheDocument();
    expect(screen.queryByText("Build the manual board")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /已完成事项 · 1/i })).toBeInTheDocument();
  });

  it("renders bounded unavailable and empty-board states", () => {
    const view = render(
      <WorkTrackerBoard
        state={{ status: "error", message: "Work Tracker is unavailable." }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Work Tracker is unavailable.",
    );
    view.rerender(
      <WorkTrackerBoard state={{ status: "ready", items: [] }} />,
    );
    expect(screen.getByText(/capture the first work item/i)).toBeInTheDocument();
  });
});
