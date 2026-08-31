import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("Orchestrator responsive shell", () => {
  it("contains the standalone artifact inside the shared page width", () => {
    expect(css).toMatch(
      /\.orchestrator-artifact-shell\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/u,
    );
    expect(css).toMatch(
      /\.orchestrator-artifact-frame\s*\{[^}]*display:\s*block[^}]*width:\s*100%[^}]*min-height:\s*720px[^}]*border:\s*0/u,
    );
  });

  it("uses the compact operator hierarchy and a phone-sized frame", () => {
    expect(css).toMatch(
      /\.orchestrator-page\s+\.observatory-hero\s+h1\s*\{[^}]*font-size:\s*clamp\(28px,\s*3\.6vw,\s*36px\)/u,
    );
    expect(css).toMatch(
      /\.orchestrator-page\s+\.observatory-hero\s+h1\s*\{[^}]*max-width:\s*30ch[^}]*overflow-wrap:\s*anywhere/u,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.orchestrator-artifact-frame\s*\{[^}]*min-height:\s*calc\(100dvh\s*-\s*220px\)/u,
    );
  });
});
