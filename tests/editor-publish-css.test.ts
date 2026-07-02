import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function blockFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(
    globalsCss.matchAll(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "g")),
  )
    .map((match) => match.groups?.body ?? "")
    .join("\n");
}

describe("editor publish CSS", () => {
  it("keeps tag choices inside the publish settings panel", () => {
    const picker = blockFor(".publish-tag-picker");
    const label = blockFor(".publish-tag-picker label");
    const text = blockFor(".publish-tag-picker span");

    expect(picker).toContain("display: grid");
    expect(picker).toContain("grid-template-columns");
    expect(label).toContain("min-width: 0");
    expect(label).not.toContain("width: fit-content");
    expect(text).toContain("overflow: hidden");
    expect(text).toContain("text-overflow: ellipsis");
  });
});
