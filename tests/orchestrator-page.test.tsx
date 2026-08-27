import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: mocks.getCurrentAdmin,
}));

import OrchestratorPage, { dynamic } from "@/app/orchestrator/page";

describe("OrchestratorPage", () => {
  beforeEach(() => {
    mocks.getCurrentAdmin.mockReset();
    mocks.getCurrentAdmin.mockResolvedValue({
      user_id: "admin-1",
      username: "plato",
      display_name: "Plato",
      is_admin: true,
    });
    mocks.redirect.mockClear();
  });

  it("forces request-time authorization and redirects anonymous visitors", async () => {
    expect(dynamic).toBe("force-dynamic");
    mocks.getCurrentAdmin.mockResolvedValue(null);

    await expect(OrchestratorPage()).rejects.toThrow(
      "redirect:/auth?redirectTo=/orchestrator",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth?redirectTo=/orchestrator",
    );
  });

  it("renders the shared operator hero around the isolated artifact", async () => {
    render(await OrchestratorPage());

    expect(
      screen.getByRole("heading", { name: /^orchestrator$/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/orchestrator access/i)).toHaveTextContent(
      /mode: admin/i,
    );
    expect(screen.getByTitle("Orchestrator control surface")).toHaveAttribute(
      "src",
      "/orchestrator/artifact",
    );
    expect(
      screen.getByRole("link", { name: /open orchestrator directly/i }),
    ).toHaveAttribute("href", "/orchestrator/artifact");
  });
});
