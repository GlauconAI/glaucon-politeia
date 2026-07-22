import { describe, expect, it, vi } from "vitest";

const permanentRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`permanentRedirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ permanentRedirect }));

import ObservatoryRedirectPage from "@/app/observatory/page";

describe("legacy Observatory route", () => {
  it("permanently redirects to the canonical Dashboard route", () => {
    expect(() => ObservatoryRedirectPage()).toThrow(
      "permanentRedirect:/dashboard",
    );
    expect(permanentRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
