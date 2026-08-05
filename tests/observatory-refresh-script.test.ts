import { mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireObservatoryRefreshLock,
  readObservatoryRefreshState,
  writeObservatoryRefreshDiagnostic,
  writeObservatoryRefreshReport,
  writeObservatoryRefreshState,
} from "@/lib/observatory/refresh-files";
import { createObservatoryRefreshState } from "@/lib/observatory/refresh-state";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "observatory-refresh-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Observatory refresh files", () => {
  it("acquires an exclusive mode-0600 lock and rejects overlap", async () => {
    const directory = await temporaryDirectory();
    const lockPath = join(directory, "refresh.lock");
    const first = await acquireObservatoryRefreshLock(lockPath, {
      nowMs: Date.parse("2026-07-22T20:00:00.000Z"),
    });

    expect(first.acquired).toBe(true);
    expect((await stat(lockPath)).mode & 0o777).toBe(0o600);
    await expect(
      acquireObservatoryRefreshLock(lockPath, {
        nowMs: Date.parse("2026-07-22T20:01:00.000Z"),
      }),
    ).resolves.toEqual({ acquired: false, release: null });

    await first.release?.();
  });

  it("recovers a stale regular lock but refuses a fresh lock", async () => {
    const directory = await temporaryDirectory();
    const lockPath = join(directory, "refresh.lock");
    await writeFile(lockPath, "safe-lock\n", { mode: 0o600 });
    const old = new Date("2026-07-22T19:00:00.000Z");
    await utimes(lockPath, old, old);

    const recovered = await acquireObservatoryRefreshLock(lockPath, {
      nowMs: Date.parse("2026-07-22T20:00:00.000Z"),
      staleAfterMs: 30 * 60 * 1000,
    });
    expect(recovered.acquired).toBe(true);
    await recovered.release?.();
  });

  it("writes state atomically with mode 0600 and rejects unknown fields", async () => {
    const directory = await temporaryDirectory();
    const statePath = join(directory, "refresh-state.json");
    const state = createObservatoryRefreshState("2026-07-22T20:00:00.000Z");

    await writeObservatoryRefreshState(statePath, state);
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
    expect(await readObservatoryRefreshState(statePath, () => new Date())).toEqual(
      state,
    );
    expect(await readFile(statePath, "utf8")).not.toContain("token");

    await writeFile(
      statePath,
      JSON.stringify({ ...state, raw_stderr: "secret" }),
      { mode: 0o600 },
    );
    await expect(
      readObservatoryRefreshState(statePath, () => new Date()),
    ).rejects.toThrow(/invalid/u);
  });

  it("creates an initial state when the state file is absent", async () => {
    const directory = await temporaryDirectory();
    await expect(
      readObservatoryRefreshState(join(directory, "missing.json"), () =>
        new Date("2026-07-22T20:00:00.000Z"),
      ),
    ).resolves.toEqual(
      createObservatoryRefreshState("2026-07-22T20:00:00.000Z"),
    );
  });

  it("keeps separate private diagnostic logs and prunes only the oldest entries", async () => {
    const directory = await temporaryDirectory();
    const first = await writeObservatoryRefreshDiagnostic(
      directory,
      {
        failedAt: "2026-08-05T21:30:00.000Z",
        stage: "collect",
        failureCode: "COMMAND_TIMEOUT_AGENTS",
        diagnostic: "first failure",
      },
      2,
    );
    await writeObservatoryRefreshDiagnostic(
      directory,
      {
        failedAt: "2026-08-05T21:31:00.000Z",
        stage: "publish",
        failureCode: "PUBLISH_FAILED",
        diagnostic: "second failure",
      },
      2,
    );
    const third = await writeObservatoryRefreshDiagnostic(
      directory,
      {
        failedAt: "2026-08-05T21:32:00.000Z",
        stage: "orchestration",
        failureCode: "STEP_FAILED",
        diagnostic: "third failure",
      },
      2,
    );

    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(directory)).sort();
    expect(files).toHaveLength(2);
    expect(files).not.toContain(first);
    expect(files).toContain(third);
    expect((await stat(join(directory, third))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(directory, third), "utf8")).toContain(
      '"failure_code":"STEP_FAILED"',
    );
  });

  it("writes the latest readable report atomically with private permissions", async () => {
    const directory = await temporaryDirectory();
    const reportPath = join(directory, "latest-refresh-report.txt");

    await writeObservatoryRefreshReport(reportPath, "Dashboard 每日更新完成\n");

    expect(await readFile(reportPath, "utf8")).toBe("Dashboard 每日更新完成\n");
    expect((await stat(reportPath)).mode & 0o777).toBe(0o600);
  });
});
