#!/usr/bin/env node

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function buildVerificationSteps() {
  return [
    { id: "tests", command: "npm", args: ["test", "--", "--maxWorkers=1"], timeoutMs: 20 * 60_000 },
    { id: "lint", command: "npm", args: ["run", "lint"], timeoutMs: 5 * 60_000 },
    { id: "typecheck", command: "npm", args: ["run", "typecheck"], timeoutMs: 5 * 60_000 },
    { id: "diff-check", command: "git", args: ["diff", "--check"], timeoutMs: 60_000 },
  ];
}

export function cleanGeneratedNextTypes(root, remover = rmSync) {
  remover(resolve(root, ".next", "types"), { recursive: true, force: true });
}

export async function runCommand(step, { cwd = repositoryRoot } = {}) {
  const startedAt = Date.now();

  return new Promise((resolveResult) => {
    const child = spawn(step.command, step.args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, step.timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      resolveResult({
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        error: error.message,
        timedOut,
      });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        exitCode: code ?? 1,
        durationMs: Date.now() - startedAt,
        signal,
        timedOut,
      });
    });
  });
}

export async function runVerificationSteps(steps, runner = runCommand) {
  const results = [];

  for (const step of steps) {
    process.stdout.write(`\n[release:verify] ${step.id}\n`);
    const result = await runner(step);
    results.push({ id: step.id, ...result });
    if (result.exitCode !== 0) {
      return { ok: false, failedStep: step.id, results };
    }
  }

  return { ok: true, failedStep: null, results };
}

async function main() {
  cleanGeneratedNextTypes(repositoryRoot);
  const result = await runVerificationSteps(buildVerificationSteps());
  process.stdout.write(`\nRELEASE_VERIFY_RESULT=${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
