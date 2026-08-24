import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ObservatoryCollectionEnvelopeSchema } from "#observatory-collection-schema";
import {
  acquireObservatoryRefreshLock,
  readObservatoryRefreshState,
  writeObservatoryRefreshDiagnostic,
  writeObservatoryRefreshReport,
  writeObservatoryRefreshState,
} from "#observatory-refresh-files";
import {
  createObservatoryRefreshReport,
  formatObservatoryRefreshFailureMessage,
  formatObservatoryRefreshSuccessMessage,
  redactObservatoryDiagnostic,
} from "#observatory-refresh-report";
import {
  OBSERVATORY_REFRESH_STEP_TIMEOUT_MS,
  evaluateObservatoryRefreshStaleness,
  sanitizeObservatoryRefreshStepFailure,
  transitionObservatoryRefreshState,
  type ObservatoryRefreshNotification,
} from "#observatory-refresh-state";

interface StepResult {
  success: boolean;
  failureCode: string | null;
  diagnostic: string;
}

function runStep(
  scriptPath: string,
  args: readonly string[],
): Promise<StepResult> {
  return new Promise((resolveResult) => {
    const child = spawn(
      process.execPath,
      ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", scriptPath, ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let settled = false;
    let timedOut = false;
    let stderr = "";
    let killTimeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: StepResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      resolveResult(result);
    };
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < 8_192) stderr = `${stderr}${chunk}`.slice(0, 8_192);
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      const processId = child.pid;
      if (processId !== undefined && process.platform !== "win32") {
        try {
          process.kill(-processId, "SIGTERM");
        } catch {
          finish({
            success: false,
            failureCode: "STEP_TIMEOUT",
            diagnostic: "The step exceeded its time limit.",
          });
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
    }, OBSERVATORY_REFRESH_STEP_TIMEOUT_MS);
    child.once("error", (error) =>
      finish({
        success: false,
        failureCode: "STEP_SPAWN_FAILED",
        diagnostic: error.stack ?? error.message,
      }),
    );
    child.once("close", (code) =>
      finish(
        timedOut
          ? {
              success: false,
              failureCode: "STEP_TIMEOUT",
              diagnostic: "The step exceeded its time limit.",
            }
          : code === 0
            ? { success: true, failureCode: null, diagnostic: "" }
            : {
                success: false,
                failureCode: sanitizeObservatoryRefreshStepFailure(stderr),
                diagnostic:
                  stderr || `The step exited with status ${code ?? "unknown"}.`,
              },
      ),
    );
  });
}

function safeNotificationCode(notification: ObservatoryRefreshNotification) {
  return `OBSERVATORY_REFRESH_${notification.toUpperCase()}`;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readSnapshotIfPresent(path: string): Promise<unknown | null> {
  try {
    return ObservatoryCollectionEnvelopeSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if (isMissingFile(error)) return null;
    return null;
  }
}

async function main(): Promise<void> {
  const [
    registryPath,
    workspaceRoot,
    vaultRoot,
    configPath,
    projectExecutionPath,
    projectControlPath,
  ] = process.argv.slice(2);
  if (!registryPath || !workspaceRoot || !vaultRoot || !projectExecutionPath) {
    process.stderr.write(
      "OBSERVATORY_REFRESH_CONFIG_INVALID: Usage requires registry, workspace, Vault, and Project execution export paths.\n",
    );
    process.exitCode = 2;
    return;
  }

  const observatoryDirectory = resolve(".observatory");
  const snapshotPath = resolve(observatoryDirectory, "observatory-snapshot.json");
  const statePath = resolve(observatoryDirectory, "refresh-state.json");
  const reportPath = resolve(observatoryDirectory, "latest-refresh-report.txt");
  const diagnosticDirectory = resolve(observatoryDirectory, "refresh-errors");
  const lock = await acquireObservatoryRefreshLock(
    resolve(observatoryDirectory, "refresh.lock"),
  );
  if (!lock.acquired) {
    process.stdout.write("OBSERVATORY_REFRESH_SKIPPED_LOCKED\n");
    return;
  }

  try {
    const startedAtMs = Date.now();
    const previousSnapshot = await readSnapshotIfPresent(snapshotPath);
    let state = await readObservatoryRefreshState(statePath, () => new Date());
    const collectArgs = [
      resolve(registryPath),
      snapshotPath,
      "--workspace-root",
      resolve(workspaceRoot),
      "--vault-root",
      resolve(vaultRoot),
      "--project-execution-path",
      resolve(projectExecutionPath),
      ...(projectControlPath
        ? ["--project-control-path", resolve(projectControlPath)]
        : []),
      ...(configPath ? ["--config-path", resolve(configPath)] : []),
    ];
    const collected = await runStep(
      resolve("scripts/observatory/collect.ts"),
      collectArgs,
    );
    const publication = collected.success
      ? await runStep(resolve("scripts/observatory/publish.ts"), [snapshotPath])
      : null;
    const published = collected.success && publication?.success === true;
    const completedAt = new Date().toISOString();
    const transition = transitionObservatoryRefreshState(state, {
      type: published ? "success" : "failure",
      at: completedAt,
    });
    state = transition.state;
    const stale = evaluateObservatoryRefreshStaleness(state, completedAt);
    state = stale.state;
    await writeObservatoryRefreshState(statePath, state);

    for (const notification of [transition.notification, stale.notification]) {
      if (notification) {
        process.stdout.write(`${safeNotificationCode(notification)}\n`);
      }
    }
    if (!published) {
      const stage: "collect" | "publish" = collected.success
        ? "publish"
        : "collect";
      const failureCode = collected.success
        ? publication?.failureCode
        : collected.failureCode;
      const failedStep = collected.success ? publication : collected;
      const safeFailureCode = failureCode ?? "STEP_FAILED";
      const diagnosticFile = await writeObservatoryRefreshDiagnostic(
        diagnosticDirectory,
        {
          failedAt: completedAt,
          stage,
          failureCode: safeFailureCode,
          diagnostic: redactObservatoryDiagnostic(
            failedStep?.diagnostic ?? "No child-process diagnostic was available.",
          ),
        },
      );
      await writeObservatoryRefreshReport(
        reportPath,
        `${formatObservatoryRefreshFailureMessage({
          failedAt: completedAt,
          stage,
          failureCode: safeFailureCode,
          diagnosticFile,
        })}\n`,
      );
      process.stderr.write(
        `OBSERVATORY_REFRESH_FAILED: ${stage}=${safeFailureCode}.\n`,
      );
      process.exitCode = 1;
      return;
    }
    const currentSnapshot = ObservatoryCollectionEnvelopeSchema.parse(
      JSON.parse(await readFile(snapshotPath, "utf8")),
    );
    const report = createObservatoryRefreshReport(
      previousSnapshot,
      currentSnapshot,
      completedAt,
      Date.now() - startedAtMs,
    );
    await writeObservatoryRefreshReport(
      reportPath,
      `${formatObservatoryRefreshSuccessMessage(report, {
        recovered: transition.notification === "recovery",
        retentionOk: true,
      })}\n`,
    );
    process.stdout.write("OBSERVATORY_REFRESH_OK\n");
  } finally {
    await lock.release?.();
  }
}

main().catch(async (error: unknown) => {
  const failedAt = new Date().toISOString();
  const observatoryDirectory = resolve(".observatory");
  const failureCode = sanitizeObservatoryRefreshStepFailure(
    error instanceof Error ? error.message : String(error),
  );
  try {
    const diagnosticFile = await writeObservatoryRefreshDiagnostic(
      resolve(observatoryDirectory, "refresh-errors"),
      {
        failedAt,
        stage: "orchestration",
        failureCode,
        diagnostic: redactObservatoryDiagnostic(
          error instanceof Error ? (error.stack ?? error.message) : String(error),
        ),
      },
    );
    await writeObservatoryRefreshReport(
      resolve(observatoryDirectory, "latest-refresh-report.txt"),
      `${formatObservatoryRefreshFailureMessage({
        failedAt,
        stage: "orchestration",
        failureCode,
        diagnosticFile,
      })}\n`,
    );
  } catch {
    // The stable stderr code remains available even if local diagnostics fail.
  }
  process.stderr.write(
    "OBSERVATORY_REFRESH_FAILED: Refresh orchestration failed.\n",
  );
  process.exitCode = 1;
});
