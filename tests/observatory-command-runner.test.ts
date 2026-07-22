// @vitest-environment node

import { describe, expect, it } from "vitest";

import { OBSERVATORY_CLI_STDOUT_MAX_BYTES } from "@/lib/observatory/collector";
import { runCommand } from "@/scripts/observatory/run-command";

describe("Observatory command runner", () => {
  it("settles a successful exit even when a descendant retains its pipes", async () => {
    const descendantProgram = "setTimeout(() => {}, 3000)";
    const program = `
      const { spawn } = require("node:child_process");
      const descendant = spawn(
        process.execPath,
        ["-e", ${JSON.stringify(descendantProgram)}],
        { detached: true, stdio: ["ignore", "inherit", "inherit"] },
      );
      descendant.unref();
      process.stdout.write("ok");
    `;
    const startedAt = Date.now();

    const result = await runCommand({
      command: process.execPath,
      args: ["-e", program],
      timeoutMs: 1_000,
    });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "ok",
      timedOut: false,
      outputLimitExceeded: false,
    });
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("preserves the output-limit reason and settles retained pipes", async () => {
    const descendantProgram = "setTimeout(() => {}, 3000)";
    const program = `
      const { spawn } = require("node:child_process");
      const descendant = spawn(
        process.execPath,
        ["-e", ${JSON.stringify(descendantProgram)}],
        { detached: true, stdio: ["ignore", "inherit", "inherit"] },
      );
      descendant.unref();
      process.stdout.write(Buffer.alloc(
        ${OBSERVATORY_CLI_STDOUT_MAX_BYTES + 1},
        "x",
      ));
    `;
    const startedAt = Date.now();

    const result = await runCommand({
      command: process.execPath,
      args: ["-e", program],
      timeoutMs: 1_000,
    });

    expect(result.outputLimitExceeded).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
