import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("operator header responsive contract", () => {
  it("moves operator actions onto a wrapping full-width row on phones", () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?\.header-actions\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*flex-wrap:\s*wrap[^}]*width:\s*100%/u,
    );
  });
});
