import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("Work Tracker responsive layout", () => {
  it("uses the full page width for a four-group desktop board", () => {
    expect(css).toContain(".work-tracker-layout {\n  grid-template-columns: minmax(0, 1fr);");
    expect(css).toContain("grid-template-columns: repeat(4, minmax(220px, 1fr));");
  });

  it("aligns Project search and filter controls to the same fixed height", () => {
    expect(css).toMatch(
      /\.work-tracker-project-picker input,[\s\S]*?\.work-tracker-project-picker select \{[\s\S]*?height: 42px;/u,
    );
  });

  it("renders Quick Capture as a fixed overlay drawer", () => {
    expect(css).toContain(".work-tracker-drawer-backdrop {\n  position: fixed;");
    expect(css).toContain(".work-tracker-capture-drawer {\n  position: fixed;");
  });

  it("keeps four groups scrollable and snap-aligned on narrow screens", () => {
    expect(css).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.work-tracker-columns \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(260px, 82vw\)\);[\s\S]*?scroll-snap-type: x proximity;/u,
    );
  });

  it("uses a readable detail hierarchy that collapses cleanly on mobile", () => {
    expect(css).toMatch(
      /\.work-item-edit-form \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 360px\);/u,
    );
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.work-item-edit-form \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.work-item-detail-lower \{[\s\S]*?flex-direction: column;/u,
    );
  });
});
