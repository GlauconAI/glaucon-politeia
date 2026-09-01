import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";
import type { ObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import { projectExecutionFixture } from "./observatory-project-execution-schema.test";

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
  overviewState: null as ObservatoryOverviewState | null,
  getCurrentAdmin: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: mocks.getCurrentAdmin,
}));

vi.mock("@/lib/observatory/dashboard-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/observatory/dashboard-state")>();
  return {
    ...actual,
    loadObservatoryOverviewState: async () => mocks.overviewState,
  };
});

import ProjectsPage, {
  dynamic as projectsDynamic,
} from "@/app/dashboard/projects/page";
import SkillsPage, {
  dynamic as skillsDynamic,
} from "@/app/dashboard/skills/page";
import CronsPage, {
  dynamic as cronsDynamic,
} from "@/app/dashboard/crons/page";

const snapshot = {
  registry: {
    project_groups: [
      {
        owner: "Plato",
        focus: "Product delivery",
        projects: [
          {
            project_key: "plato/dashboard",
            name: "dashboard",
            title: "Dashboard",
            status: "active",
            description: "Operational view.",
            scene_ids: ["S13"],
          },
        ],
      },
    ],
  },
  assets: [
    {
      id: "skill:plato:weather",
      kind: "skill",
      name: "weather",
      owner: "plato",
      authority: "observed",
      source: "openclaw/skills-list",
      collected_at: "2026-07-24T18:00:00.000Z",
      freshness: "fresh",
      health: "healthy",
      summary: "Ready",
      labels: [{ key: "eligibility", value: "ready" }],
    },
    {
      id: "cron:daily-refresh",
      kind: "cron",
      name: "Daily refresh",
      owner: "plato",
      authority: "observed",
      source: "openclaw/cron-list",
      collected_at: "2026-08-31T18:00:00.000Z",
      freshness: "fresh",
      health: "healthy",
      summary: "Cron · 0 18 * * *",
      labels: [
        { key: "schedule_type", value: "cron" },
        { key: "enabled", value: "enabled" },
        { key: "schedule_expression", value: "0 18 * * *" },
        { key: "next_run_at", value: "2026-09-01T01:00:00.000Z" },
      ],
    },
  ],
  source_health: [
    {
      domain: "operations",
      status: "fresh",
      health: "healthy",
      collected_at: "2026-08-31T18:00:00.000Z",
      last_success_at: "2026-08-31T18:00:00.000Z",
      asset_count: 1,
    },
  ],
  source_repositories: {
    repositories: [],
  },
} as unknown as ObservatoryCollectionEnvelope;

describe("Dashboard directory pages", () => {
  beforeEach(() => {
    mocks.currentAdmin = {
      user_id: "admin-1",
      username: "plato",
      display_name: "Plato",
      is_admin: true,
    };
    mocks.overviewState = { status: "ready", snapshot };
    mocks.getCurrentAdmin.mockReset();
    mocks.getCurrentAdmin.mockResolvedValue(mocks.currentAdmin);
    mocks.redirect.mockClear();
    window.history.replaceState(null, "", "/");
  });

  it("forces request-time authorization and data freshness", () => {
    expect(projectsDynamic).toBe("force-dynamic");
    expect(skillsDynamic).toBe("force-dynamic");
    expect(cronsDynamic).toBe("force-dynamic");
  });

  it.each([
    [
      "Projects",
      () => ProjectsPage({ searchParams: Promise.resolve({}) }),
      "/auth?redirectTo=/dashboard/projects",
    ],
    [
      "Skills",
      () => SkillsPage({ searchParams: Promise.resolve({}) }),
      "/auth?redirectTo=/dashboard/skills",
    ],
    [
      "Cron Jobs",
      () => CronsPage({ searchParams: Promise.resolve({}) }),
      "/auth?redirectTo=/dashboard/crons",
    ],
  ])("redirects anonymous visitors before loading %s", async (_, renderPage, target) => {
    mocks.getCurrentAdmin.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow(`redirect:${target}`);
    expect(mocks.redirect).toHaveBeenCalledWith(target);
  });

  it("renders Projects with URL-derived filters", async () => {
    render(
      await ProjectsPage({
        searchParams: Promise.resolve({ q: "Dashboard", owner: "Plato" }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /projects directory/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search projects/i }))
      .toHaveValue("Dashboard");
    expect(screen.getByRole("combobox", { name: /project owner/i }))
      .toHaveValue("Plato");
    expect(screen.getByRole("heading", { name: "Dashboard" }))
      .toBeInTheDocument();
    expect(screen.getByText(/project execution data unavailable/i))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to dashboard/i }))
      .toHaveAttribute("href", "/dashboard");
  });

  it("renders validated v5 Project execution data above the canonical directory", async () => {
    mocks.overviewState = {
      status: "ready",
      snapshot: {
        ...snapshot,
        schema_version: "5.0.0",
        collector_version: "5.0.0",
        project_executions: projectExecutionFixture(),
        source_health: [
          {
            domain: "project_executions",
            status: "fresh",
            health: "healthy",
            collected_at: "2026-08-23T20:00:00Z",
            last_success_at: "2026-08-23T20:00:00Z",
            asset_count: 1,
          },
        ],
      } as unknown as ObservatoryCollectionEnvelope,
    };

    render(await ProjectsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: /project execution/i }))
      .toBeInTheDocument();
    expect(screen.getByText("Build Dashboard")).toBeInTheDocument();
    expect(screen.getAllByText("Returns to PM")).toHaveLength(2);
  });

  it("renders de-duplicated Skills with URL-derived filters", async () => {
    render(
      await SkillsPage({
        searchParams: Promise.resolve({
          q: "weather",
          category: "shared-custom",
        }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: /skills directory/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search skills/i }))
      .toHaveValue("weather");
    expect(screen.getByRole("combobox", { name: /category/i }))
      .toHaveValue("shared-custom");
    expect(screen.getByRole("heading", { name: "weather" }))
      .toBeInTheDocument();
  });

  it("renders Cron Jobs with URL-derived filters and source status", async () => {
    render(
      await CronsPage({
        searchParams: Promise.resolve({
          q: "Daily",
          owner: "plato",
          type: "cron",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: /Cron Jobs Directory/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search Cron Jobs/i }))
      .toHaveValue("Daily");
    expect(screen.getByRole("combobox", { name: /Cron owner/i }))
      .toHaveValue("plato");
    expect(screen.getByRole("combobox", { name: /schedule type/i }))
      .toHaveValue("cron");
    expect(screen.getByRole("heading", { name: "Daily refresh" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to dashboard/i }))
      .toHaveAttribute("href", "/dashboard");
  });

  it("renders safe snapshot failure states instead of directory data", async () => {
    mocks.overviewState = {
      status: "error",
      message: "The latest snapshot could not be loaded. Try again later.",
    };

    render(await ProjectsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /snapshot could not be loaded/i,
    );
    expect(screen.queryByRole("heading", { name: "Dashboard" }))
      .not.toBeInTheDocument();
  });
});
