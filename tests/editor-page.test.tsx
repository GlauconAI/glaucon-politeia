import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EditorPage from "@/app/editor/page";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        order: async () => ({
          data: [
            { id: "tag-1", slug: "family", name: "Family" },
            { id: "tag-2", slug: "projects", name: "Projects" },
          ],
        }),
      }),
    }),
  }),
}));

describe("EditorPage", () => {
  it("renders a structured publishing command form", async () => {
    render(await EditorPage());

    expect(
      screen.getByRole("heading", { name: /publish command/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/write a markdown note or place an html artifact/i),
    ).toBeInTheDocument();

    const contentRegion = screen.getByRole("group", { name: /post content/i });
    expect(within(contentRegion).getByLabelText(/title/i)).toBeInTheDocument();
    expect(
      within(contentRegion).getByLabelText(/body/i),
    ).toHaveAttribute("rows", "20");

    const settingsRegion = screen.getByRole("group", {
      name: /publish settings/i,
    });
    expect(
      within(settingsRegion).getByRole("radio", { name: /public/i }),
    ).toBeChecked();
    expect(
      within(settingsRegion).getByRole("radio", { name: /markdown/i }),
    ).toBeChecked();
    expect(
      within(settingsRegion).getByRole("checkbox", { name: /family/i }),
    ).toBeInTheDocument();
    expect(
      within(settingsRegion).getByRole("button", { name: /save draft/i }),
    ).toBeInTheDocument();
    expect(
      within(settingsRegion).getByRole("button", { name: /publish/i }),
    ).toBeInTheDocument();
  });
});
