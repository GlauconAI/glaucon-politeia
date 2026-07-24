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
  dashboardPath: "/dashboard",
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-dashboard-path": mocks.dashboardPath }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => mocks.dashboardPath.split("?")[0],
}));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: async () => mocks.currentAdmin,
}));

import DashboardLayout from "@/app/dashboard/layout";
import DashboardLoading from "@/app/dashboard/loading";

describe("Dashboard shared layout", () => {
  beforeEach(() => {
    mocks.currentAdmin = {
      user_id: "admin-1",
      username: "plato",
      display_name: "Plato",
      is_admin: true,
    };
    mocks.dashboardPath = "/dashboard";
    mocks.redirect.mockClear();
  });

  it("redirects anonymous visitors with the exact Dashboard return path", async () => {
    mocks.currentAdmin = null;
    mocks.dashboardPath = "/dashboard/skills?q=weather";

    await expect(
      DashboardLayout({ children: <p>private content</p> }),
    ).rejects.toThrow(
      "redirect:/auth?redirectTo=%2Fdashboard%2Fskills%3Fq%3Dweather",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth?redirectTo=%2Fdashboard%2Fskills%3Fq%3Dweather",
    );
  });

  it("renders a persistent route index for administrators", async () => {
    render(await DashboardLayout({ children: <p>private content</p> }));

    const navigation = screen.getByRole("navigation", {
      name: /dashboard routes/i,
    });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "href",
      "/dashboard/projects",
    );
    expect(screen.getByRole("link", { name: "Skills" })).toHaveAttribute(
      "href",
      "/dashboard/skills",
    );
    expect(screen.getByText("private content")).toBeInTheDocument();
  });

  it("provides immediate accessible route transition feedback", () => {
    render(<DashboardLoading />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/loading dashboard data/i)).toBeInTheDocument();
  });
});
