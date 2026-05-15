import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "@/lib/auth/redirect";

describe("safe auth redirects", () => {
  it("keeps safe internal paths", () => {
    expect(getSafeRedirectPath("/editor")).toBe("/editor");
    expect(getSafeRedirectPath("/search?q=vibe")).toBe("/search?q=vibe");
  });

  it("falls back for external urls", () => {
    expect(getSafeRedirectPath("https://evil.example/path")).toBe("/");
    expect(getSafeRedirectPath("//evil.example/path")).toBe("/");
  });

  it("falls back for auth routes to avoid loops", () => {
    expect(getSafeRedirectPath("/auth")).toBe("/");
    expect(getSafeRedirectPath("/auth?redirectTo=/editor")).toBe("/");
  });

  it("falls back for missing or malformed values", () => {
    expect(getSafeRedirectPath(null)).toBe("/");
    expect(getSafeRedirectPath("")).toBe("/");
    expect(getSafeRedirectPath("not-a-path")).toBe("/");
  });
});
