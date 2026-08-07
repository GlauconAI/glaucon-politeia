import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("publish html cli", () => {
  it("prints the insert payload in dry-run mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-html-"));
    const input = join(dir, "artifact.html");
    const html = "<html><body><h1>Artifact</h1></body></html>\n";
    writeFileSync(input, html);

    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/publish-html.mjs",
          "--input",
          input,
          "--title",
          "Artifact",
          "--slug",
          "artifact",
          "--author-id",
          "00000000-0000-0000-0000-000000000001",
          "--visibility",
          "private",
          "--tag",
          "family",
          "--tag",
          "sites",
          "--dry-run",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload).toMatchObject({
        author_id: "00000000-0000-0000-0000-000000000001",
        slug: "artifact",
        title: "Artifact",
        content_format: "html",
        visibility: "private",
        status: "draft",
        tag_slugs: ["family", "sites"],
      });
      expect(payload.content_html).toBe(html);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults new HTML artifacts to private visibility", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-html-"));
    const input = join(dir, "artifact.html");
    writeFileSync(input, "<html><body><h1>Artifact</h1></body></html>");

    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/publish-html.mjs",
          "--input",
          input,
          "--title",
          "Artifact",
          "--slug",
          "artifact",
          "--author-id",
          "00000000-0000-0000-0000-000000000001",
          "--dry-run",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.visibility).toBe("private");
      expect(payload.tag_slugs).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flushes dry-run payloads larger than the stdout pipe buffer", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-html-"));
    const input = join(dir, "large-artifact.html");
    const html = `<html><body><p>${"large payload ".repeat(16_000)}</p></body></html>`;
    writeFileSync(input, html);

    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/publish-html.mjs",
          "--input",
          input,
          "--title",
          "Large Artifact",
          "--slug",
          "large-artifact",
          "--author-id",
          "00000000-0000-0000-0000-000000000001",
          "--dry-run",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.content_html).toBe(html);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
