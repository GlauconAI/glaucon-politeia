import { describe, expect, it } from "vitest";

import { themeInitScript } from "@/lib/theme/init";

describe("theme initialization script", () => {
  it("reads the persisted theme key before paint", () => {
    expect(themeInitScript).toContain("localStorage.getItem('glaucon-theme')");
  });

  it("supports light, dark, and system preferences", () => {
    expect(themeInitScript).toContain("matchMedia('(prefers-color-scheme: dark)'");
    expect(themeInitScript).toContain("theme === 'dark'");
    expect(themeInitScript).toContain("theme === 'light'");
  });

  it("sets a data-theme attribute on the document element", () => {
    expect(themeInitScript).toContain("root.dataset.theme = resolved");
  });
});
