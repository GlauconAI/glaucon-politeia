import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildInteractiveArtifact,
  extractDataBlocks,
} from "../lib/html-note-kit/index.mjs";

const fixture = join(process.cwd(), "fixtures", "html-note-kit-interactive");
const output = join(fixture, "artifact.generated.html");

afterEach(() => rmSync(output, { force: true }));

describe("generic interactive artifact fixture", () => {
  it("builds deterministically and performs a real offline filter", async () => {
    const options = {
      manifestPath: join(fixture, "artifact.mjs"),
      outputPath: output,
      force: true,
      verifyDeterminism: true,
    };

    const first = await buildInteractiveArtifact(options);
    const firstBytes = readFileSync(output);
    const second = await buildInteractiveArtifact(options);
    const secondBytes = readFileSync(output);

    expect(secondBytes).toEqual(firstBytes);
    expect(second.sourceHash).toBe(first.sourceHash);
    expect(second.outputHash).toBe(first.outputHash);
    expect(first.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.outputHash).toBe(
      `sha256:${createHash("sha256").update(firstBytes).digest("hex")}`,
    );
    expect(first.dataBlockIds).toEqual(["project-registry"]);

    const html = firstBytes.toString("utf8");
    const blocks = extractDataBlocks(html);
    expect([...blocks.keys()]).toEqual(["project-registry"]);
    expect(blocks.get("project-registry")).toEqual({
      projects: [
        {
          name: "Agent Atlas",
          category: "Coordination",
          description:
            "Maps local agents and the boundaries between their responsibilities.",
        },
        {
          name: "Memory Loom",
          category: "Knowledge",
          description:
            "Weaves durable notes into a searchable local knowledge fabric.",
        },
        {
          name: "Local Observer",
          category: "Diagnostics",
          description:
            "Summarizes system signals without requiring a network connection.",
        },
      ],
    });
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/i);
    expect(html).not.toMatch(/<(?:iframe|img)[^>]+(?:src|srcset)=/i);
    expect(html).toContain('class="artifact-svg-frame"');

    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "https://artifact.local/",
    });
    try {
      const input = dom.window.document.querySelector<HTMLInputElement>(
        "#project-search",
      );
      if (!input) throw new Error("missing project search input");

      input.value = "memory";
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));

      const visible = [
        ...dom.window.document.querySelectorAll<HTMLElement>(
          "[data-project-card]",
        ),
      ]
        .filter((node) => !node.hidden)
        .map((node) => node.dataset.projectName);
      expect(visible).toEqual(["Memory Loom"]);
      expect(dom.window.document.querySelector("#visible-count")?.textContent).toBe(
        "1",
      );
    } finally {
      dom.window.close();
    }
  }, 15_000);
});
