import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dashboardPath: "/dashboard",
  getCurrentAdmin: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "x-dashboard-path": mocks.dashboardPath }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.dashboardPath.split("?")[0],
}));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: mocks.getCurrentAdmin,
}));

import DashboardLayout from "@/app/dashboard/layout";
import DashboardLoading from "@/app/dashboard/loading";

describe("Dashboard shared layout", () => {
  beforeEach(() => {
    mocks.dashboardPath = "/dashboard";
    mocks.getCurrentAdmin.mockReset();
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
    expect(mocks.getCurrentAdmin).not.toHaveBeenCalled();
  });

  it("provides immediate accessible route transition feedback", () => {
    render(<DashboardLoading />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/loading dashboard data/i)).toBeInTheDocument();
  });
});
