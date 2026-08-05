import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Observatory LaunchAgent reporting", () => {
  it("sends the generated readable report after a successful retained refresh", async () => {
    const script = await readFile(
      resolve("scripts/observatory/launchd-refresh.zsh"),
      "utf8",
    );

    expect(script).toContain("latest-refresh-report.txt");
    expect(script).toContain("OBSERVATORY_REFRESH_OK");
    expect(script).toContain("OBSERVATORY_RETENTION_OK");
    expect(script).toContain('notify "$report"');
  });

  it("preserves failure diagnostics and emits an explicit failure code", async () => {
    const script = await readFile(
      resolve("scripts/observatory/cron-refresh.zsh"),
      "utf8",
    );

    expect(script).toContain("refresh-errors");
    expect(script).toContain('print -r -- "OBSERVATORY_REFRESH_FAILURE"');
    expect(script).not.toContain(': > "$diagnostic_path"');
  });

  it("keeps host paths and the Telegram target out of versioned scripts", async () => {
    const scripts = await Promise.all(
      ["cron-refresh.zsh", "launchd-refresh.zsh"].map((name) =>
        readFile(resolve("scripts/observatory", name), "utf8"),
      ),
    );
    const source = scripts.join("\n");

    expect(source).not.toContain("/Users/");
    expect(source).not.toMatch(/--target\s+\d/u);
    expect(source).toContain("OBSERVATORY_REPO_ROOT");
    expect(source).toContain("OBSERVATORY_TELEGRAM_TARGET");
  });
});
