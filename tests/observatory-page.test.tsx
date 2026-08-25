import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentAdmin: {
    user_id: "admin-1",
    username: "plato",
    display_name: "Plato",
    is_admin: true as const,
  } as {
    user_id: string;
    username: string;
    display_name: string;
    is_admin: true;
  } | null,
  getLatestSuccessfulSnapshot: vi.fn(),
  getCurrentAdmin: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: mocks.getCurrentAdmin,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => Promise<unknown>) => callback,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

vi.mock("@/lib/observatory/repository", () => ({
  createObservatoryRepository: () => ({
    getLatestSuccessfulSnapshot: mocks.getLatestSuccessfulSnapshot,
  }),
}));

import DashboardPage, { dynamic } from "@/app/dashboard/page";

const registry = {
  schema_version: "1.0.0",
  registry_schema_version: "2.0.0",
  registry_version: "fixture-v2",
  source: {
    logical_reference:
      "shared/projects/openclaw-orchestration-control/orchestration-system-design.html#orchestration-registry",
    authority: "canonical",
    owner: "Socrates",
    collected_at: "2026-07-21T22:45:00.000Z",
    freshness: "fresh",
    digest: "a".repeat(64),
  },
  summary: {
    project_count: 0,
    primary_scene_count: 0,
    secondary_scene_count: 0,
    execution_flow_count: 0,
  },
  project_groups: [],
  scenes: [],
  execution_flows: [],
} as const;

const payload = {
  schema_version: "1.0.0",
  status: "success",
  generated_at: "2026-07-21T23:00:00.000Z",
  source_digest: "a".repeat(64),
  collector_version: "1.0.0",
  registry,
  agents: [],
  runtime: {
    runtime_version: "2026.7.1",
    gateway_running: false,
    gateway_reachable: false,
    configured_agent_count: 0,
    task_totals: { total: 0, active: 0, queued: 0, completed: 0, failed: 0 },
  },
  summary: {
    freshness: "fresh",
    project_count: 0,
    primary_scene_count: 0,
    secondary_scene_count: 0,
    execution_flow_count: 0,
    agent_count: 0,
    binding_count: 0,
    configured_agent_count: 0,
    gateway_running: false,
    gateway_reachable: false,
    task_totals: { total: 0, active: 0, queued: 0, completed: 0, failed: 0 },
  },
};

function snapshotRow(value: unknown = payload) {
  return {
    id: "snapshot-1",
    schema_version: "1.0.0",
    generated_at: "2026-07-21T23:00:00.000Z",
    source_digest: "a".repeat(64),
    payload: value,
    summary: payload.summary,
    collector_version: "1.0.0",
    status: "success" as const,
    created_at: "2026-07-21T23:00:01.000Z",
  };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    mocks.currentAdmin = {
      user_id: "admin-1",
      username: "plato",
      display_name: "Plato",
      is_admin: true,
    };
    mocks.getCurrentAdmin.mockReset();
    mocks.getCurrentAdmin.mockResolvedValue(mocks.currentAdmin);
    mocks.redirect.mockClear();
    mocks.getLatestSuccessfulSnapshot.mockReset();
    mocks.getLatestSuccessfulSnapshot.mockResolvedValue(snapshotRow());
  });

  it("forces request-time authorization and snapshot freshness", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("redirects anonymous visitors before reading the cached Snapshot", async () => {
    mocks.getCurrentAdmin.mockResolvedValue(null);

    await expect(DashboardPage()).rejects.toThrow(
      "redirect:/auth?redirectTo=/dashboard",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth?redirectTo=/dashboard",
    );
    expect(mocks.getLatestSuccessfulSnapshot).not.toHaveBeenCalled();
  });

  it("renders the read-only admin overview without Work Tracker", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { name: /^dashboard$/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/dashboard access/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /system summary/i })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /quick capture/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^work tracker$/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: /dashboard sections/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Objects" })).toHaveAttribute(
      "href",
      "#dashboard-objects",
    );
    expect(screen.queryByRole("link", { name: "Capture" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Work" })).not.toBeInTheDocument();
  });

  it("renders an explicit unavailable state when no snapshot exists", async () => {
    mocks.getLatestSuccessfulSnapshot.mockResolvedValue(null);

    render(await DashboardPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      /no snapshot has been published yet/i,
    );
  });

  it("does not render unvalidated snapshot jsonb", async () => {
    mocks.getLatestSuccessfulSnapshot.mockResolvedValue(
      snapshotRow({ ...payload, runtime_session: "private-session" }),
    );

    render(await DashboardPage());

    expect(screen.getByRole("alert")).toHaveTextContent(/failed validation/i);
    expect(screen.queryByText("private-session")).not.toBeInTheDocument();
  });

  it("renders an explicit failed state when the snapshot read fails", async () => {
    mocks.getLatestSuccessfulSnapshot.mockRejectedValue(
      new Error("private database detail"),
    );

    render(await DashboardPage());

    expect(screen.getByRole("alert")).toHaveTextContent(
      /latest snapshot could not be loaded/i,
    );
    expect(screen.queryByText(/private database detail/i)).not.toBeInTheDocument();
  });

});
