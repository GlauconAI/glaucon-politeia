import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  listWorkItems: vi.fn(),
  listActiveWorkItemClaims: vi.fn(),
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

  it("renders the independent write surface with Chinese authoring guidance", async () => {
    render(await WorkTrackerPage());

    expect(
      screen.getByRole("heading", { name: /^work tracker$/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /quick capture/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /work tracker/i })).toBeInTheDocument();
    expect(
      screen.getByText(/标题、描述和验收标准默认使用中文/),
    ).toBeInTheDocument();
  });

  it("validates the Project query against the canonical registry", async () => {
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
    const firstKey = (
      screen.getByRole("form", { name: /quick capture/i }).querySelector(
        'input[name="idempotencyKey"]',
      ) as HTMLInputElement
    ).value;
    firstRender.unmount();

    render(await WorkTrackerPage());
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
  });
});
