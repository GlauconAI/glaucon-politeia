import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import {
  OBSERVATORY_CLI_STDOUT_MAX_BYTES,
  type CommandInvocation,
  type CommandResult,
} from "#observatory-collector";

const COMMAND_CLOSE_GRACE_MS = 250;
const COMMAND_TERM_GRACE_MS = 250;
const COMMAND_KILL_VERIFY_MS = 500;

type TerminalReason =
  | "exited"
  | "timed_out"
  | "output_limit"
  | "spawn_error";

export class ObservatoryCommandTerminationError extends Error {
  readonly code = "PROCESS_TREE_TERMINATION_FAILED";

  constructor() {
    super("Unable to verify termination of the Observatory command process tree.");
    this.name = "ObservatoryCommandTerminationError";
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}

function signalPosixProcessGroup(
  processGroupId: number,
  signal: NodeJS.Signals,
): void {
  try {
    process.kill(-processGroupId, signal);
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) return;
    throw new ObservatoryCommandTerminationError();
  }
}

function posixProcessGroupExists(processGroupId: number): boolean {
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ESRCH")) return false;
    if (hasErrorCode(error, "EPERM")) {
      // EPERM is inconclusive: Darwin returns it while an unsignalable zombie
      // still holds the group ID, and it can also mean a permission failure.
      // Keep polling; only ESRCH proves that the group no longer exists.
      return true;
    }
    throw new ObservatoryCommandTerminationError();
  }
}

async function waitForPosixProcessGroupExit(
  processGroupId: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!posixProcessGroupExists(processGroupId)) return true;
    await delay(20);
  }
  return !posixProcessGroupExists(processGroupId);
}

async function terminatePosixProcessTree(processGroupId: number) {
  signalPosixProcessGroup(processGroupId, "SIGTERM");
  if (
    await waitForPosixProcessGroupExit(
      processGroupId,
      COMMAND_TERM_GRACE_MS,
    )
  ) {
    return;
  }
  signalPosixProcessGroup(processGroupId, "SIGKILL");
  if (
    !(await waitForPosixProcessGroupExit(
      processGroupId,
      COMMAND_KILL_VERIFY_MS,
    ))
  ) {
    throw new ObservatoryCommandTerminationError();
  }
}

function terminateWindowsProcessTree(processId: number): Promise<void> {
  return new Promise((resolveTermination, rejectTermination) => {
    const taskkill = spawn(
      "taskkill",
      ["/pid", String(processId), "/t", "/f"],
      {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    let settled = false;
    const finish = (error?: ObservatoryCommandTerminationError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) rejectTermination(error);
      else resolveTermination();
    };
    const timeout = setTimeout(() => {
      taskkill.kill("SIGKILL");
      finish(new ObservatoryCommandTerminationError());
    }, COMMAND_KILL_VERIFY_MS);
    taskkill.once("error", () => {
      finish(new ObservatoryCommandTerminationError());
    });
    taskkill.once("close", (code) => {
      finish(
        code === 0 ? undefined : new ObservatoryCommandTerminationError(),
      );
    });
  });
}

function terminateProcessTree(processId: number): Promise<void> {
  return process.platform === "win32"
    ? terminateWindowsProcessTree(processId)
    : terminatePosixProcessTree(processId);
}

export function runCommand(
  invocation: CommandInvocation,
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(invocation.command, [...invocation.args], {
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let exitCode = -1;
    let settled = false;
    let terminalReason: TerminalReason | undefined;
    let closeGrace: ReturnType<typeof setTimeout> | undefined;

    const destroyPipeReaders = () => {
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const selectTerminalReason = (reason: TerminalReason): boolean => {
      if (terminalReason !== undefined) return false;
      terminalReason = reason;
      clearTimeout(timeout);
      if (closeGrace !== undefined) clearTimeout(closeGrace);
      return true;
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (closeGrace !== undefined) clearTimeout(closeGrace);
      resolveResult({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        timedOut: terminalReason === "timed_out",
        outputLimitExceeded: terminalReason === "output_limit",
      });
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (closeGrace !== undefined) clearTimeout(closeGrace);
      destroyPipeReaders();
      reject(error);
    };
    const settleAfterCloseGrace = () => {
      if (terminalReason !== undefined || closeGrace !== undefined) return;
      closeGrace = setTimeout(() => {
        destroyPipeReaders();
        selectTerminalReason("exited");
        settle();
      }, COMMAND_CLOSE_GRACE_MS);
    };
    const terminate = (reason: "timed_out" | "output_limit") => {
      if (!selectTerminalReason(reason)) return;
      destroyPipeReaders();
      const processId = child.pid;
      if (processId === undefined) {
        rejectOnce(new ObservatoryCommandTerminationError());
        return;
      }
      void terminateProcessTree(processId).then(settle, rejectOnce);
    };
    const timeout = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        exitCode = child.exitCode ?? -1;
        clearTimeout(timeout);
        settleAfterCloseGrace();
        return;
      }
      terminate("timed_out");
    }, invocation.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (terminalReason !== undefined) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > OBSERVATORY_CLI_STDOUT_MAX_BYTES) {
        terminate("output_limit");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.resume();
    child.once("error", (error) => {
      if (!selectTerminalReason("spawn_error") || settled) return;
      rejectOnce(error);
    });
    child.once("exit", (code) => {
      exitCode = code ?? -1;
      clearTimeout(timeout);
      settleAfterCloseGrace();
    });
    child.once("close", (code) => {
      exitCode = code ?? exitCode;
      if (terminalReason !== undefined) return;
      selectTerminalReason("exited");
      settle();
    });
  });
}
