import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentAdmin: {
    user_id: "22222222-2222-4222-8222-222222222222",
    username: "glaucon",
    display_name: "Glaucon",
    is_admin: true as const,
  } as {
    user_id: string;
    username: string;
    display_name: string;
    is_admin: true;
  } | null,
  getWorkItem: vi.fn(),
  listWorkItemEvidence: vi.fn(),
  listWorkItemEvents: vi.fn(),
  listWorkItemClaims: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  loadOverviewState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
}));
vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: async () => mocks.currentAdmin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: vi.fn(), rpc: vi.fn() }),
}));
vi.mock("@/lib/observatory/repository", () => ({
  createObservatoryRepository: () => ({
    getWorkItem: mocks.getWorkItem,
    listWorkItemEvidence: mocks.listWorkItemEvidence,
    listWorkItemEvents: mocks.listWorkItemEvents,
    listWorkItemClaims: mocks.listWorkItemClaims,
  }),
}));
vi.mock("@/lib/observatory/dashboard-state", () => ({
  loadObservatoryOverviewState: mocks.loadOverviewState,
}));

import WorkItemPage from "@/app/work-tracker/items/[id]/page";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "feature",
  title: "Manual Work Tracker",
  description: "",
  state: "triage",
  priority: null,
  owner_id: null,
  assigned_agent_id: "plato",
  acceptance_criteria: "",
  project_ref: "Dashboard",
  milestone_ref: null,
  project_key: null,
  plan_revision: null,
  stage_id: null,
  work_package_id: null,
  idempotency_key: "capture-1",
  version: 1,
  created_by: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-07-23T20:00:00.000Z",
  updated_at: "2026-07-23T20:00:00.000Z",
  risk_level: "unclassified",
  agent_claim_enabled: false,
  authorized_paths: [],
  allowed_action_classes: [],
  claim_approved_by: null,
  claim_approved_at: null,
};

describe("WorkItemPage", () => {
  beforeEach(() => {
    mocks.currentAdmin = {
      user_id: "22222222-2222-4222-8222-222222222222",
      username: "glaucon",
      display_name: "Glaucon",
      is_admin: true,
    };
    mocks.getWorkItem.mockReset();
    mocks.getWorkItem.mockResolvedValue(item);
    mocks.listWorkItemEvidence.mockReset();
    mocks.listWorkItemEvidence.mockResolvedValue([]);
    mocks.listWorkItemEvents.mockReset();
    mocks.listWorkItemEvents.mockResolvedValue([]);
    mocks.listWorkItemClaims.mockReset();
    mocks.listWorkItemClaims.mockResolvedValue([]);
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
  });

  it("redirects unauthorized visitors before reading the item", async () => {
    mocks.currentAdmin = null;

    await expect(
      WorkItemPage({ params: Promise.resolve({ id: item.id }) }),
    ).rejects.toThrow(
      `redirect:/auth?redirectTo=/work-tracker/items/${item.id}`,
    );
    expect(mocks.getWorkItem).not.toHaveBeenCalled();
  });

  it("renders an authorized item with detail data", async () => {
    render(
      await WorkItemPage({ params: Promise.resolve({ id: item.id }) }),
    );

    expect(
      screen.getByRole("heading", { name: "Manual Work Tracker" }),
    ).toBeInTheDocument();
    expect(mocks.listWorkItemEvidence).toHaveBeenCalledWith(item.id);
    expect(mocks.listWorkItemEvents).toHaveBeenCalledWith(item.id);
    expect(mocks.listWorkItemClaims).toHaveBeenCalledWith(item.id);
    expect(screen.getByLabelText(/^project$/i)).toHaveValue("plato/dashboard");
  });

  it("uses the not-found boundary for a missing item", async () => {
    mocks.getWorkItem.mockResolvedValue(null);

    await expect(
      WorkItemPage({ params: Promise.resolve({ id: item.id }) }),
    ).rejects.toThrow("not-found");
  });

  it("renders a bounded unavailable state on dependency failure", async () => {
    mocks.getWorkItem.mockRejectedValue(new Error("private database detail"));

    render(
      await WorkItemPage({ params: Promise.resolve({ id: item.id }) }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /work item is temporarily unavailable/i,
    );
    expect(screen.queryByText(/private database detail/i)).not.toBeInTheDocument();
  });
});
