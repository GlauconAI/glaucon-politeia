import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("publish html cli", () => {
  it("prints the insert payload in dry-run mode", () => {
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
          "--visibility",
          "private",
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
      });
      expect(payload.content_html).toContain("<h1>Artifact</h1>");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
