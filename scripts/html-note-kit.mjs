#!/usr/bin/env node

import { fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";
import {
  buildNote as buildNoteArtifact,
} from "../lib/html-note-kit/index.mjs";

const WORKER_PATH = fileURLToPath(
  new URL("./html-note-kit-worker.mjs", import.meta.url),
);
const WORKER_TIMEOUT_MS = 30_000;
const WORKER_OUTPUT_LIMIT_BYTES = 1024 * 1024;

const values = process.argv.slice(2);
const command = values[0];

if (
  command === "build-artifact" ||
  command === "update-data" ||
  command === "verify"
) {
  try {
    await runArtifactCommand(command, values.slice(1));
  } catch (error) {
    printArtifactError(error);
    process.exitCode = 1;
  }
} else {
  try {
    if (command === "init") {
      initNote(values.slice(1));
    } else if (command === "build") {
      await buildLegacyNote(values.slice(1));
    } else if (command === "--help" || command === "-h" || !command) {
      process.stdout.write(helpText());
    } else {
      throw new Error(`Unknown command: ${command}\n\n${helpText()}`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function runArtifactCommand(name, args) {
  if (name === "build-artifact") {
    const parsed = parseBuildArtifactArgs(args);
    const result = await runArtifactWorker("build-artifact", {
      manifestPath: parsed.input,
      ...(parsed.output === undefined ? {} : { outputPath: parsed.output }),
      ...(parsed.preserveDataFrom === undefined
        ? {}
        : { preserveDataFrom: parsed.preserveDataFrom }),
      force: parsed.force,
    });
    printResult({
      ok: result.ok,
      command: "build-artifact",
      mode: result.mode,
      output: result.output,
      title: result.title,
      bytes: result.bytes,
      sourceHash: result.sourceHash,
      outputHash: result.outputHash,
      dataBlockIds: result.dataBlockIds,
    });
    return;
  }

  if (name === "update-data") {
    const parsed = parseUpdateDataArgs(args);
    const inPlace =
      parsed.output === undefined ||
      resolve(parsed.output) === resolve(parsed.artifact);
    const result = await runArtifactWorker("update-data", {
      artifactPath: parsed.artifact,
      manifestPath: parsed.manifest,
      id: parsed.id,
      inputPath: parsed.input,
      ...(parsed.output === undefined ? {} : { outputPath: parsed.output }),
      ...(parsed.force === undefined && inPlace
        ? {}
        : { force: parsed.force ?? false }),
    });
    printResult({
      ok: result.ok,
      command: "update-data",
      mode: result.mode,
      output: result.output,
      title: result.title,
      bytes: result.bytes,
      sourceHash: result.sourceHash,
      outputHash: result.outputHash,
      dataBlockIds: result.dataBlockIds,
    });
    return;
  }

  const parsed = parseVerifyArgs(args);
  const result = await runArtifactWorker("verify", {
    path: parsed.input,
    requiredDataBlocks: parsed.requiredBlocks,
  });
  printResult({
    ok: result.ok,
    command: "verify",
    mode: result.mode,
    sourceHash: result.sourceHash,
    dataBlockIds: result.dataBlockIds,
    issues: result.issues,
  });
}

function runArtifactWorker(workerCommand, options) {
  const token = randomBytes(32).toString("hex");
  const child = fork(WORKER_PATH, [], {
    cwd: process.cwd(),
    execArgv: [],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  return new Promise((resolvePromise, rejectPromise) => {
    let discardedBytes = 0;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners();
      child.stdout?.removeAllListeners();
      child.stderr?.removeAllListeners();
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
      callback(value);
    };
    const rejectWorker = (code, message, details = undefined) => {
      finish(
        rejectPromise,
        new ArtifactBuildError(code, message, details),
      );
    };
    const discard = (chunk) => {
      discardedBytes += Buffer.byteLength(chunk);
      if (discardedBytes > WORKER_OUTPUT_LIMIT_BYTES) {
        rejectWorker(
          "CLI_WORKER_OUTPUT_LIMIT",
          "Artifact worker exceeded its bounded diagnostic output",
        );
      }
    };

    child.stdout?.on("data", discard);
    child.stderr?.on("data", discard);
    child.once("error", () => {
      rejectWorker("CLI_WORKER_FAILED", "Artifact worker could not be started");
    });
    child.once("exit", () => {
      rejectWorker("CLI_WORKER_FAILED", "Artifact worker exited without a result");
    });
    child.on("message", (message) => {
      if (!isWorkerEnvelope(message, token)) return;
      if (message.kind === "result") {
        finish(resolvePromise, message.payload);
        return;
      }
      const error = message.payload;
      finish(
        rejectPromise,
        new ArtifactBuildError(error.code, error.message, error.details),
      );
    });

    const timer = setTimeout(() => {
      rejectWorker("CLI_WORKER_TIMEOUT", "Artifact worker exceeded its time limit");
    }, WORKER_TIMEOUT_MS);
    timer.unref();

    child.send({ token, command: workerCommand, options }, (error) => {
      if (error !== null) {
        rejectWorker("CLI_WORKER_FAILED", "Artifact worker request could not be delivered");
      }
    });
  });
}

function isWorkerEnvelope(value, token) {
  if (
    value === null ||
    typeof value !== "object" ||
    value.token !== token ||
    (value.kind !== "result" && value.kind !== "error") ||
    value.payload === null ||
    typeof value.payload !== "object"
  ) {
    return false;
  }
  if (value.kind === "error") {
    return (
      typeof value.payload.code === "string" &&
      value.payload.code.length > 0 &&
      typeof value.payload.message === "string"
    );
  }
  return value.payload.ok === true;
}

function cliFailure(message) {
  throw new ArtifactBuildError("INVALID_CLI_ARGUMENTS", message);
}

function requireFlagValue(args, cursor, flagName) {
  const value = args[cursor + 1];
  if (value === undefined || value.startsWith("--")) {
    cliFailure(`${flagName} requires a value`);
  }
  return value;
}

function parseBuildArtifactArgs(args) {
  let input;
  let output;
  let preserveDataFrom;
  let force = false;

  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (value === "--output") {
      if (output !== undefined) cliFailure("--output may only be provided once");
      output = requireFlagValue(args, cursor, "--output");
      cursor += 1;
    } else if (value === "--preserve-data-from") {
      if (preserveDataFrom !== undefined) {
        cliFailure("--preserve-data-from may only be provided once");
      }
      preserveDataFrom = requireFlagValue(args, cursor, "--preserve-data-from");
      cursor += 1;
    } else if (value === "--force") {
      if (force) cliFailure("--force may only be provided once");
      force = true;
    } else if (value.startsWith("-")) {
      cliFailure(`Unsupported option for build-artifact: ${value}`);
    } else if (input === undefined) {
      input = value;
    } else {
      cliFailure("build-artifact accepts exactly one manifest path");
    }
  }

  if (input === undefined) {
    cliFailure("build-artifact requires exactly one manifest path");
  }
  return { force, input, output, preserveDataFrom };
}

function parseUpdateDataArgs(args) {
  let artifact;
  let manifest;
  let id;
  let input;
  let output;
  let force;

  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (
      value === "--manifest" ||
      value === "--id" ||
      value === "--input" ||
      value === "--output"
    ) {
      const property = value.slice(2);
      const current = { manifest, id, input, output }[property];
      if (current !== undefined) cliFailure(`${value} may only be provided once`);
      const flagValue = requireFlagValue(args, cursor, value);
      if (value === "--manifest") manifest = flagValue;
      else if (value === "--id") id = flagValue;
      else if (value === "--input") input = flagValue;
      else output = flagValue;
      cursor += 1;
    } else if (value === "--force") {
      if (force !== undefined) cliFailure("--force may only be provided once");
      force = true;
    } else if (value.startsWith("-")) {
      cliFailure(`Unsupported option for update-data: ${value}`);
    } else if (artifact === undefined) {
      artifact = value;
    } else {
      cliFailure("update-data accepts exactly one artifact path");
    }
  }

  if (artifact === undefined) {
    cliFailure("update-data requires exactly one artifact path");
  }
  for (const [flagName, value] of [
    ["--manifest", manifest],
    ["--id", id],
    ["--input", input],
  ]) {
    if (value === undefined) cliFailure(`${flagName} is required`);
  }
  return { artifact, force, id, input, manifest, output };
}

function parseVerifyArgs(args) {
  let input;
  const requiredBlocks = [];

  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (value === "--required-block") {
      requiredBlocks.push(requireFlagValue(args, cursor, "--required-block"));
      cursor += 1;
    } else if (value.startsWith("-")) {
      cliFailure(`Unsupported option for verify: ${value}`);
    } else if (input === undefined) {
      input = value;
    } else {
      cliFailure("verify accepts exactly one artifact path");
    }
  }

  if (input === undefined) {
    cliFailure("verify requires exactly one artifact path");
  }
  return { input, requiredBlocks };
}

function printArtifactError(error) {
  const normalized =
    error instanceof ArtifactBuildError
      ? error
      : new ArtifactBuildError(
          "UNEXPECTED_CLI_ERROR",
          "HTML artifact command failed unexpectedly",
        );
  process.stderr.write(`${JSON.stringify(normalized.toJSON(), null, 2)}\n`);
}

function initNote(args) {
  const targetDirectory = positional(args, 0);
  const title = flag(args, "--title");
  const force = args.includes("--force");

  if (!targetDirectory) {
    throw new Error("Usage: html-note-kit init <directory> --title <title>");
  }
  if (!title?.trim()) {
    throw new Error("--title is required");
  }

  const directory = resolve(targetDirectory);
  const sourcePath = join(directory, "note.md");
  if (existsSync(sourcePath) && !force) {
    throw new Error(`Source already exists: ${sourcePath}`);
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcePath, starterMarkdown(title.trim()), "utf8");
  printResult({ command: "init", source: sourcePath });
}

async function buildLegacyNote(args) {
  const inputValue = positional(args, 0);
  const outputValue = flag(args, "--output");
  const force = args.includes("--force");

  if (!inputValue) {
    throw new Error(
      "Usage: html-note-kit build <input.md> [--output <output.html>] [--force]",
    );
  }

  const inputPath = resolve(inputValue);
  if (!existsSync(inputPath)) {
    throw new Error(`Markdown input not found: ${inputPath}`);
  }
  if (extname(inputPath).toLowerCase() !== ".md") {
    throw new Error("Input must be a .md file");
  }

  const outputPath = resolve(
    outputValue || inputPath.replace(/\.md$/i, ".html"),
  );
  if (existsSync(outputPath) && !force) {
    throw new Error(`Output already exists: ${outputPath}`);
  }

  try {
    const result = await buildNoteArtifact({
      inputPath,
      outputPath,
      force,
    });
    printResult({
      command: "build",
      source: inputPath,
      output: result.output,
      title: result.title,
      bytes: result.bytes,
    });
  } catch (error) {
    if (error instanceof ArtifactBuildError) {
      if (error.code === "OUTPUT_EXISTS") {
        throw new Error(`Output already exists: ${outputPath}`);
      }
      const serialized = error.toJSON();
      throw new Error(serialized.error.message);
    }
    throw error;
  }
}

function starterMarkdown(title) {
  return `---
title: ${title}
description: Add one sentence that explains why this note matters.
eyebrow: 402v Knowledge
---

# ${title}

Write the core idea here.

## Key idea

> [!NOTE]
> Use a short callout for the decisive point.

## Flow

\`\`\`mermaid
flowchart LR
A[Source] --> B{Review}
B -->|pass| C[Standalone HTML]
B -->|revise| D[Revise]
D --> A
\`\`\`

## Details

| Part | Purpose |
| --- | --- |
| Markdown | Optional writing input |
| HTML | Primary reading and publishing artifact |
`;
}

function positional(args, index) {
  const values = [];
  for (let cursor = 0; cursor < args.length; cursor += 1) {
    if (args[cursor].startsWith("--")) {
      if (args[cursor] === "--title" || args[cursor] === "--output") {
        cursor += 1;
      }
      continue;
    }
    values.push(args[cursor]);
  }
  return values[index];
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function printResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function helpText() {
  return `402v HTML Note Kit

Usage:
  node scripts/html-note-kit.mjs init <directory> --title <title> [--force]
  node scripts/html-note-kit.mjs build <input.md> [--output <output.html>] [--force]
  node scripts/html-note-kit.mjs build-artifact <manifest.mjs> [--output <output.html>] [--preserve-data-from <artifact.html>] [--force]
  node scripts/html-note-kit.mjs update-data <artifact.html> --manifest <manifest.mjs> --id <block-id> --input <data.json> [--output <output.html>] [--force]
  node scripts/html-note-kit.mjs verify <artifact.html> [--required-block <block-id>]...
`;
}
