import { render, screen } from "@testing-library/react";
import { it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ range: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
import { ProjectWorkPortfolio } from "@/components/observatory/ProjectWorkPortfolio";
function client() {
  const query = { select: () => query, order: () => query, range: mocks.range };
  mocks.client.mockResolvedValue({ from: () => query });
}
it("uses authenticated work facts, including legacy bindings", async () => {
  client();
  mocks.range.mockResolvedValue({ data: [{ project_key: null, project_ref: "shared/maestro", state: "review" }], error: null });
  render(await ProjectWorkPortfolio());
  expect(mocks.client).toHaveBeenCalled();
  expect(screen.getByText(/shared\/maestro/)).toBeInTheDocument();
  expect(screen.getByText(/review: 1/)).toBeInTheDocument();
});
it("shows unknown rather than a zero when the authorized query fails", async () => {
  client();
  mocks.range.mockResolvedValue({ data: null, error: { code: "42501" } });
  render(await ProjectWorkPortfolio());
  expect(screen.getByRole("alert")).toHaveTextContent("Counts are unknown");
});
