import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { dirname } from "node:path";

import {
  createObservatoryRefreshState,
  type ObservatoryRefreshState,
} from "#observatory-refresh-state";

export interface ObservatoryRefreshLock {
  acquired: boolean;
  release: (() => Promise<void>) | null;
}

export interface ObservatoryRefreshLockOptions {
  nowMs?: number;
  staleAfterMs?: number;
}

const DEFAULT_LOCK_STALE_AFTER_MS = 30 * 60 * 1000;

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function createLock(lockPath: string, nowMs: number) {
  const nonce = randomUUID();
  const handle = await open(lockPath, "wx", 0o600);
  try {
    await handle.writeFile(`${new Date(nowMs).toISOString()} ${nonce}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(lockPath, 0o600);
  return async () => {
    try {
      const current = await readFile(lockPath, "utf8");
      if (current.includes(nonce)) await unlink(lockPath);
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
  };
}

export async function acquireObservatoryRefreshLock(
  lockPath: string,
  options: ObservatoryRefreshLockOptions = {},
): Promise<ObservatoryRefreshLock> {
  const nowMs = options.nowMs ?? Date.now();
  const staleAfterMs =
    options.staleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS;
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(staleAfterMs) || staleAfterMs < 1) {
    throw new TypeError("Invalid Observatory lock timing options.");
  }
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });

  try {
    return { acquired: true, release: await createLock(lockPath, nowMs) };
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
  }

  const metadata = await lstat(lockPath);
  const processUid = typeof process.getuid === "function" ? process.getuid() : null;
  const ownedByProcessUser = processUid === null || metadata.uid === processUid;
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !ownedByProcessUser ||
    nowMs - metadata.mtimeMs < staleAfterMs
  ) {
    return { acquired: false, release: null };
  }

  await unlink(lockPath);
  try {
    return { acquired: true, release: await createLock(lockPath, nowMs) };
  } catch (error) {
    if (isNodeError(error, "EEXIST")) {
      return { acquired: false, release: null };
    }
    throw error;
  }
}

function parseRefreshState(input: unknown): ObservatoryRefreshState {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("The Observatory refresh state is invalid.");
  }
  const record = input as Record<string, unknown>;
  const expectedKeys = [
    "version",
    "monitoring_started_at",
    "consecutive_failures",
    "last_success_at",
    "last_failure_at",
    "failure_notified_at",
    "stale_notified_at",
  ];
  if (
    Object.keys(record).length !== expectedKeys.length ||
    expectedKeys.some((key) => !(key in record)) ||
    record.version !== 1 ||
    !Number.isSafeInteger(record.consecutive_failures) ||
    Number(record.consecutive_failures) < 0
  ) {
    throw new TypeError("The Observatory refresh state is invalid.");
  }
  const timestampKeys = expectedKeys.slice(1).filter(
    (key) => key !== "consecutive_failures",
  );
  for (const key of timestampKeys) {
    const value = record[key];
    if (
      value !== null &&
      (typeof value !== "string" ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(Date.parse(value)).toISOString() !== value)
    ) {
      throw new TypeError("The Observatory refresh state is invalid.");
    }
  }
  if (typeof record.monitoring_started_at !== "string") {
    throw new TypeError("The Observatory refresh state is invalid.");
  }
  return record as unknown as ObservatoryRefreshState;
}

export async function readObservatoryRefreshState(
  statePath: string,
  now: () => Date,
): Promise<ObservatoryRefreshState> {
  try {
    return parseRefreshState(JSON.parse(await readFile(statePath, "utf8")));
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return createObservatoryRefreshState(now().toISOString());
    }
    if (error instanceof SyntaxError) {
      throw new TypeError("The Observatory refresh state is invalid.");
    }
    throw error;
  }
}

export async function writeObservatoryRefreshState(
  statePath: string,
  state: ObservatoryRefreshState,
): Promise<void> {
  parseRefreshState(state);
  await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(state)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, statePath);
  await chmod(statePath, 0o600);
}
