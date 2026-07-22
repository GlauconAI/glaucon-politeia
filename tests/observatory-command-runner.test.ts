// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { OBSERVATORY_CLI_STDOUT_MAX_BYTES } from "@/lib/observatory/collector";
import { runCommand } from "@/scripts/observatory/run-command";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 750) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await delay(20);
  }
  return !isProcessAlive(pid);
}

async function cleanUpProcess(pid: number | undefined): Promise<void> {
  if (pid === undefined || !isProcessAlive(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }
  await waitForProcessExit(pid);
}

async function createDescendantTracker() {
  const directory = await mkdtemp(join(tmpdir(), "observatory-runner-"));
  const pidPath = join(directory, "descendant.pid");
  return {
    pidPath,
    cleanUp: async (knownPid?: number) => {
      let pid = knownPid;
      if (pid === undefined) {
        try {
          pid = Number(await readFile(pidPath, "utf8"));
        } catch {
          // The child did not reach descendant creation.
        }
      }
      await cleanUpProcess(pid);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

describe("Observatory command runner", () => {
  it("settles a successful exit even when a descendant retains its pipes", async () => {
    const descendantProgram = "setTimeout(() => {}, 10000)";
    const tracker = await createDescendantTracker();
    const program = `
      const { spawn } = require("node:child_process");
      const descendant = spawn(
        process.execPath,
        ["-e", ${JSON.stringify(descendantProgram)}],
        { detached: true, stdio: ["ignore", "inherit", "inherit"] },
      );
      descendant.unref();
      require("node:fs").writeFileSync(
        ${JSON.stringify(tracker.pidPath)},
        String(descendant.pid),
      );
      process.stdout.write(String(descendant.pid) + "\\nok");
    `;
    const startedAt = Date.now();
    let descendantPid: number | undefined;

    try {
      const result = await runCommand({
        command: process.execPath,
        args: ["-e", program],
        timeoutMs: 1_000,
      });
      const [pidText, output] = result.stdout.split("\n");
      descendantPid = Number(pidText);

      expect(result).toMatchObject({
        exitCode: 0,
        timedOut: false,
        outputLimitExceeded: false,
      });
      expect(output).toBe("ok");
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    } finally {
      await tracker.cleanUp(descendantPid);
    }
  });

  it("terminates descendants before settling a timeout", async () => {
    const descendantProgram = "setTimeout(() => {}, 10000)";
    const tracker = await createDescendantTracker();
    const program = `
      const { spawn } = require("node:child_process");
      const descendant = spawn(
        process.execPath,
        ["-e", ${JSON.stringify(descendantProgram)}],
        { stdio: "ignore" },
      );
      descendant.unref();
      require("node:fs").writeFileSync(
        ${JSON.stringify(tracker.pidPath)},
        String(descendant.pid),
      );
      process.stdout.write(String(descendant.pid));
      setTimeout(() => {}, 10000);
    `;
    let descendantPid: number | undefined;

    try {
      const result = await runCommand({
        command: process.execPath,
        args: ["-e", program],
        timeoutMs: 500,
      });
      descendantPid = Number(result.stdout);

      expect(result.timedOut).toBe(true);
      expect(Number.isSafeInteger(descendantPid)).toBe(true);
      await expect(waitForProcessExit(descendantPid)).resolves.toBe(true);
    } finally {
      await tracker.cleanUp(descendantPid);
    }
  });

  it("preserves the output-limit reason and terminates descendants", async () => {
    const descendantProgram = "setTimeout(() => {}, 10000)";
    const tracker = await createDescendantTracker();
    const program = `
      const { spawn } = require("node:child_process");
      const descendant = spawn(
        process.execPath,
        ["-e", ${JSON.stringify(descendantProgram)}],
        { stdio: "ignore" },
      );
      descendant.unref();
      require("node:fs").writeFileSync(
        ${JSON.stringify(tracker.pidPath)},
        String(descendant.pid),
      );
      process.stdout.write(String(descendant.pid) + "\\n");
      process.stdout.write(Buffer.alloc(
        ${OBSERVATORY_CLI_STDOUT_MAX_BYTES + 1},
        "x",
      ));
      setTimeout(() => {}, 10000);
    `;
    const startedAt = Date.now();
    let descendantPid: number | undefined;

    try {
      const result = await runCommand({
        command: process.execPath,
        args: ["-e", program],
        timeoutMs: 1_000,
      });
      descendantPid = Number(result.stdout.split("\n", 1)[0]);

      expect(result.outputLimitExceeded).toBe(true);
      expect(result.timedOut).toBe(false);
      expect(Number.isSafeInteger(descendantPid)).toBe(true);
      await expect(waitForProcessExit(descendantPid)).resolves.toBe(true);
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    } finally {
      await tracker.cleanUp(descendantPid);
    }
  });
});
