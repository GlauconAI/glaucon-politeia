import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const cli = join(process.cwd(), "scripts", "html-note-kit.mjs");

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("html note kit", () => {
  it("creates a compact Markdown starter without overwriting it", () => {
    const dir = mkdtempSync(join(tmpdir(), "html-note-init-"));

    try {
      const first = run(["init", dir, "--title", "Agent Memory System"]);
      const source = join(dir, "note.md");

      expect(first.status).toBe(0);
      expect(existsSync(source)).toBe(true);
      expect(readFileSync(source, "utf8")).toContain(
        "title: Agent Memory System",
      );
      expect(readFileSync(source, "utf8")).toContain("```mermaid");

      const second = run(["init", dir, "--title", "Replacement"]);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain("already exists");
      expect(readFileSync(source, "utf8")).toContain(
        "title: Agent Memory System",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds GFM and an offline flow diagram into standalone HTML", () => {
    const dir = mkdtempSync(join(tmpdir(), "html-note-build-"));
    const input = join(dir, "system.md");
    const output = join(dir, "system.html");

    writeFileSync(
      input,
      `---
title: Agent Memory System
description: One source, many reading surfaces.
eyebrow: 402v Knowledge
---

# Agent Memory System

> [!NOTE]
> HTML is the primary reading artifact.

| Layer | Role |
| --- | --- |
| Markdown | Optional input |
| HTML | Reading and publishing |

- [x] Standalone
- [ ] Published

\`\`\`mermaid
flowchart LR
A[Markdown] --> B{Build}
B -->|pass| C[HTML]
B -->|revise| A
\`\`\`
`,
    );

    try {
      const result = run(["build", input, "--output", output]);

      expect(result.status).toBe(0);
      const html = readFileSync(output, "utf8");
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain("<title>Agent Memory System</title>");
      expect(html).toContain("--note-bg: #f7f7f4");
      expect(html).toContain("<table>");
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('class="callout callout-note"');
      expect(html).not.toContain("[!NOTE]");
      expect(html).toContain('data-diagram="flowchart"');
      expect(html).toContain("<svg");
      expect(html).toContain('d="M 224 80 L 314 80"');
      expect(html).toContain('d="M 494 80 L 584 80"');
      expect(html).toContain('d="M 314 80 L 224 80"');
      expect(html).toContain("Markdown");
      expect(html).toContain("HTML");
      expect(html).not.toMatch(/<script[^>]+src=/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("embeds local images and rejects missing local images", () => {
    const dir = mkdtempSync(join(tmpdir(), "html-note-image-"));
    const image = join(dir, "pixel.png");
    const goodInput = join(dir, "good.md");
    const goodOutput = join(dir, "good.html");
    const badInput = join(dir, "bad.md");

    writeFileSync(
      image,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    writeFileSync(goodInput, "# Image\n\n![Pixel](./pixel.png)\n");
    writeFileSync(badInput, "# Missing\n\n![Gone](./gone.png)\n");

    try {
      const good = run(["build", goodInput, "--output", goodOutput]);
      expect(good.status).toBe(0);
      expect(readFileSync(goodOutput, "utf8")).toContain(
        "data:image/png;base64,",
      );

      const bad = run([
        "build",
        badInput,
        "--output",
        join(dir, "bad.html"),
      ]);
      expect(bad.status).toBe(1);
      expect(bad.stderr).toContain("Local image not found");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing HTML output without force", () => {
    const dir = mkdtempSync(join(tmpdir(), "html-note-overwrite-"));
    const input = join(dir, "note.md");
    const output = join(dir, "note.html");
    writeFileSync(input, "# New");
    writeFileSync(output, "<p>Keep me</p>");

    try {
      const blocked = run(["build", input, "--output", output]);
      expect(blocked.status).toBe(1);
      expect(blocked.stderr).toContain("already exists");
      expect(readFileSync(output, "utf8")).toBe("<p>Keep me</p>");

      const replaced = run(["build", input, "--output", output, "--force"]);
      expect(replaced.status).toBe(0);
      expect(readFileSync(output, "utf8")).toContain("<h1>New</h1>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
