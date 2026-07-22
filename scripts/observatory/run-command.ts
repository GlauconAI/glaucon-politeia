import { spawn } from "node:child_process";

import {
  OBSERVATORY_CLI_STDOUT_MAX_BYTES,
  type CommandInvocation,
  type CommandResult,
} from "#observatory-collector";

const COMMAND_KILL_GRACE_MS = 250;

type TerminalReason =
  | "exited"
  | "timed_out"
  | "output_limit"
  | "spawn_error";

export function runCommand(
  invocation: CommandInvocation,
): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(invocation.command, [...invocation.args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let exitCode = -1;
    let settled = false;
    let terminalReason: TerminalReason | undefined;
    let killGrace: ReturnType<typeof setTimeout> | undefined;

    const destroyPipeReaders = () => {
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const selectTerminalReason = (reason: TerminalReason): boolean => {
      if (terminalReason !== undefined) return false;
      terminalReason = reason;
      clearTimeout(timeout);
      return true;
    };
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killGrace !== undefined) clearTimeout(killGrace);
      resolveResult({
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        timedOut: terminalReason === "timed_out",
        outputLimitExceeded: terminalReason === "output_limit",
      });
    };
    const settleAfterKillGrace = () => {
      if (killGrace !== undefined) return;
      killGrace = setTimeout(() => {
        destroyPipeReaders();
        selectTerminalReason("exited");
        settle();
      }, COMMAND_KILL_GRACE_MS);
    };
    const terminate = (reason: "timed_out" | "output_limit") => {
      if (!selectTerminalReason(reason)) return;
      child.kill("SIGKILL");
      destroyPipeReaders();
      settleAfterKillGrace();
    };
    const timeout = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        exitCode = child.exitCode ?? -1;
        clearTimeout(timeout);
        settleAfterKillGrace();
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
      settled = true;
      clearTimeout(timeout);
      if (killGrace !== undefined) clearTimeout(killGrace);
      destroyPipeReaders();
      reject(error);
    });
    child.once("exit", (code) => {
      exitCode = code ?? -1;
      clearTimeout(timeout);
      settleAfterKillGrace();
    });
    child.once("close", (code) => {
      exitCode = code ?? exitCode;
      selectTerminalReason("exited");
      settle();
    });
  });
}
