import { spawn } from "node:child_process";
import { resolve } from "node:path";

import {
  acquireObservatoryRefreshLock,
  readObservatoryRefreshState,
  writeObservatoryRefreshState,
} from "#observatory-refresh-files";
import {
  evaluateObservatoryRefreshStaleness,
  transitionObservatoryRefreshState,
  type ObservatoryRefreshNotification,
} from "#observatory-refresh-state";

const STEP_TIMEOUT_MS = 2 * 60 * 1000;

function runStep(scriptPath: string, args: readonly string[]): Promise<boolean> {
  return new Promise((resolveResult) => {
    const child = spawn(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", scriptPath, ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        detached: process.platform !== "win32",
        shell: false,
        stdio: "ignore",
      },
    );
    let settled = false;
    let timedOut = false;
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      resolveResult(success);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      const processId = child.pid;
      if (processId !== undefined && process.platform !== "win32") {
        try {
          process.kill(-processId, "SIGTERM");
        } catch {
          finish(false);
          return;
        }
      } else {
        child.kill("SIGTERM");
      }
      killTimeout = setTimeout(() => {
        if (processId !== undefined && process.platform !== "win32") {
          try {
            process.kill(-processId, "SIGKILL");
          } catch {
            // The process tree already exited.
          }
        } else {
          child.kill("SIGKILL");
        }
      }, 2_000);
    }, STEP_TIMEOUT_MS);
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(!timedOut && code === 0));
  });
}

function safeNotificationCode(notification: ObservatoryRefreshNotification) {
  return `OBSERVATORY_REFRESH_${notification.toUpperCase()}`;
}

async function main(): Promise<void> {
  const [registryPath, workspaceRoot, vaultRoot, configPath] = process.argv.slice(2);
  if (!registryPath || !workspaceRoot || !vaultRoot) {
    process.stderr.write(
      "OBSERVATORY_REFRESH_CONFIG_INVALID: Usage requires registry, workspace, and Vault roots.\n",
    );
    process.exitCode = 2;
    return;
  }

  const observatoryDirectory = resolve(".observatory");
  const snapshotPath = resolve(observatoryDirectory, "observatory-snapshot.json");
  const statePath = resolve(observatoryDirectory, "refresh-state.json");
  const lock = await acquireObservatoryRefreshLock(
    resolve(observatoryDirectory, "refresh.lock"),
  );
  if (!lock.acquired) {
    process.stdout.write("OBSERVATORY_REFRESH_SKIPPED_LOCKED\n");
    return;
  }

  try {
    const now = new Date().toISOString();
    let state = await readObservatoryRefreshState(statePath, () => new Date());
    const collectArgs = [
      resolve(registryPath),
      snapshotPath,
      "--workspace-root",
      resolve(workspaceRoot),
      "--vault-root",
      resolve(vaultRoot),
      ...(configPath ? ["--config-path", resolve(configPath)] : []),
    ];
    const collected = await runStep(
      resolve("scripts/observatory/collect.ts"),
      collectArgs,
    );
    const published =
      collected &&
      (await runStep(resolve("scripts/observatory/publish.ts"), [snapshotPath]));
    const transition = transitionObservatoryRefreshState(state, {
      type: published ? "success" : "failure",
      at: now,
    });
    state = transition.state;
    const stale = evaluateObservatoryRefreshStaleness(state, now);
    state = stale.state;
    await writeObservatoryRefreshState(statePath, state);

    for (const notification of [transition.notification, stale.notification]) {
      if (notification) {
        process.stdout.write(`${safeNotificationCode(notification)}\n`);
      }
    }
    if (!published) {
      process.stderr.write("OBSERVATORY_REFRESH_FAILED: Refresh did not publish.\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write("OBSERVATORY_REFRESH_OK\n");
  } finally {
    await lock.release?.();
  }
}

main().catch(() => {
  process.stderr.write("OBSERVATORY_REFRESH_FAILED: Refresh orchestration failed.\n");
  process.exitCode = 1;
});
