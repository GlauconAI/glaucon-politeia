import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`permanent:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  permanentRedirect: mocks.permanentRedirect,
}));

import LegacyWorkItemPage from "@/app/dashboard/work-items/[id]/page";

describe("legacy Work Item route", () => {
  it("permanently redirects to the canonical Work Tracker detail", async () => {
    const id = "11111111-1111-4111-8111-111111111111";

    await expect(
      LegacyWorkItemPage({ params: Promise.resolve({ id }) }),
    ).rejects.toThrow(`permanent:/work-tracker/items/${id}`);
    expect(mocks.permanentRedirect).toHaveBeenCalledWith(
      `/work-tracker/items/${id}`,
    );
  });
});
