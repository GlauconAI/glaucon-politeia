import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("Dashboard responsive layout contract", () => {
  it("lets the route shell and primary layout children shrink to the viewport", () => {
    expect(css).toMatch(
      /\.dashboard-route-shell\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/u,
    );
    expect(css).toMatch(
      /\.observatory-layout\s*>\s*\*\s*\{[^}]*min-width:\s*0/u,
    );
  });

  it("keeps Overview before Quick Capture in the narrow single-column layout", () => {
    const narrowLayout = css.match(
      /@media\s*\(max-width:\s*960px\)\s*\{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(narrowLayout).toBeDefined();
    expect(narrowLayout).not.toMatch(
      /\.observatory-capture\s*\{[^}]*order:\s*-1/u,
    );
  });

  it("uses one summary column at phone width", () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*520px\)[\s\S]*?\.observatory-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
    );
  });
});
