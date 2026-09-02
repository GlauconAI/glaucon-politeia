import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  listWorkItems: vi.fn(),
  listActiveWorkItemClaims: vi.fn(),
  listProjectVersions: vi.fn(),
  loadOverviewState: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: mocks.getCurrentAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

vi.mock("@/lib/observatory/repository", () => ({
  createObservatoryRepository: () => ({
    listWorkItems: mocks.listWorkItems,
    listActiveWorkItemClaims: mocks.listActiveWorkItemClaims,
    listProjectVersions: mocks.listProjectVersions,
  }),
}));

vi.mock("@/lib/observatory/dashboard-state", () => ({
  loadObservatoryOverviewState: mocks.loadOverviewState,
}));

import WorkTrackerPage, { dynamic } from "@/app/work-tracker/page";

describe("WorkTrackerPage", () => {
  beforeEach(() => {
    mocks.getCurrentAdmin.mockReset();
    mocks.getCurrentAdmin.mockResolvedValue({
      user_id: "admin-1",
      username: "plato",
      display_name: "Plato",
      is_admin: true,
    });
    mocks.listWorkItems.mockReset();
    mocks.listWorkItems.mockResolvedValue([]);
    mocks.listActiveWorkItemClaims.mockReset();
    mocks.listActiveWorkItemClaims.mockResolvedValue([]);
    mocks.listProjectVersions.mockReset();
    mocks.listProjectVersions.mockResolvedValue([{
      id: "33333333-3333-4333-8333-333333333333",
      project_key: "plato/dashboard",
      version_label: "Backlog",
      title: "待规划",
      description: "",
      status: "planned",
      target_date: null,
      released_at: null,
      is_backlog: true,
      row_version: 1,
      created_by: "admin-1",
      created_at: "2026-09-02T00:00:00Z",
      updated_by: "admin-1",
      updated_at: "2026-09-02T00:00:00Z",
    }]);
    mocks.loadOverviewState.mockReset();
    mocks.loadOverviewState.mockResolvedValue({
      status: "ready",
      snapshot: {
        registry: {
          project_groups: [
            {
              owner: "plato",
              focus: "Product delivery",
              projects: [
                {
                  project_key: "plato/dashboard",
                  name: "dashboard",
                  title: "Dashboard",
                  status: "active",
                  description: "Operational system view.",
                  scene_ids: ["S13"],
                },
              ],
            },
          ],
        },
      },
    });
    mocks.redirect.mockClear();
  });

  it("forces request-time authorization and redirects before reading work", async () => {
    expect(dynamic).toBe("force-dynamic");
    mocks.getCurrentAdmin.mockResolvedValue(null);

    await expect(WorkTrackerPage()).rejects.toThrow(
      "redirect:/auth?redirectTo=/work-tracker",
    );
    expect(mocks.listWorkItems).not.toHaveBeenCalled();
    expect(mocks.listActiveWorkItemClaims).not.toHaveBeenCalled();
  });

  it("opens Quick Capture from a top-level button without reserving board width", async () => {
    render(await WorkTrackerPage());

    expect(
      screen.getByRole("heading", { name: /^work tracker$/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /quick capture/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /新建 item/i }));
    expect(screen.getByRole("dialog", { name: /quick capture/i })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /quick capture/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /work tracker/i })).toBeInTheDocument();
    expect(
      screen.getByText(/标题、描述和验收标准默认使用中文/),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /quick capture/i })).not.toBeInTheDocument();
  });

  it("validates the Project query against the canonical registry", async () => {
    mocks.listWorkItems.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        type: "feature",
        title: "Improve Work Tracker",
        description: "",
        state: "triage",
        priority: "high",
        owner_id: "22222222-2222-4222-8222-222222222222",
        assigned_agent_id: "plato",
        acceptance_criteria: "The board is usable.",
        project_ref: "plato/dashboard",
        milestone_ref: null,
        project_key: null,
        project_version_id: null,
        plan_revision: null,
        stage_id: null,
        work_package_id: null,
        idempotency_key: "capture-page-test",
        version: 2,
        created_by: "22222222-2222-4222-8222-222222222222",
        created_at: "2026-08-26T20:00:00.000Z",
        updated_at: "2026-08-26T20:00:00.000Z",
        risk_level: "unclassified",
        agent_claim_enabled: false,
        authorized_paths: [],
        allowed_action_classes: [],
        claim_approved_by: null,
        claim_approved_at: null,
      },
    ]);
    render(
      await WorkTrackerPage({
        searchParams: Promise.resolve({ project: "plato/dashboard" }),
      }),
    );
    expect(screen.getByLabelText("Filter by Project")).toHaveValue("plato/dashboard");

    document.body.innerHTML = "";
    render(
      await WorkTrackerPage({
        searchParams: Promise.resolve({ project: "unknown/project" }),
      }),
    );
    expect(screen.getByLabelText("Filter by Project")).toHaveValue("all");
  });

  it("generates a distinct cryptographically random capture key per request", async () => {
    const firstRender = render(await WorkTrackerPage());
    fireEvent.click(screen.getByRole("button", { name: /新建 item/i }));
    const firstKey = (
      screen.getByRole("form", { name: /quick capture/i }).querySelector(
        'input[name="idempotencyKey"]',
      ) as HTMLInputElement
    ).value;
    firstRender.unmount();

    render(await WorkTrackerPage());
    fireEvent.click(screen.getByRole("button", { name: /新建 item/i }));
    const secondKey = (
      screen.getByRole("form", { name: /quick capture/i }).querySelector(
        'input[name="idempotencyKey"]',
      ) as HTMLInputElement
    ).value;

    expect(firstKey).toMatch(
      /^observatory-capture-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(secondKey).not.toBe(firstKey);
  });

  it("fails closed without exposing repository errors", async () => {
    mocks.listWorkItems.mockRejectedValue(new Error("private database detail"));

    render(await WorkTrackerPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      /work tracker is temporarily unavailable/i,
    );
    expect(screen.queryByText(/private database detail/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^work tracker$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新建 item/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/管理版本/i)).not.toBeInTheDocument();
  });

  it("fails closed when the canonical Project registry is unavailable", async () => {
    mocks.loadOverviewState.mockResolvedValue({
      status: "error",
      message: "private registry detail",
    });

    render(await WorkTrackerPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      /work tracker is temporarily unavailable/i,
    );
    expect(screen.queryByText(/private registry detail/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^work tracker$/i })).not.toBeInTheDocument();
  });
});
