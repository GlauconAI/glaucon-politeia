import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, extname, resolve } from "node:path";

import { extractDataBlocks } from "./data-blocks.mjs";
import { renderInteractiveDocument } from "./document.mjs";
import { ArtifactBuildError } from "./errors.mjs";
import { parseMarkdownDocument } from "./frontmatter.mjs";
import { renderInteractiveModel } from "./interactive.mjs";
import { atomicWriteUtf8 } from "./io.mjs";
import { loadArtifactManifest } from "./manifest.mjs";
import { renderMarkdown } from "./render.mjs";
import { renderHtmlDocument } from "./template.mjs";
import { verifyArtifactFile, verifyArtifactHtml } from "./verify.mjs";

const INTERACTIVE_BUILD_KEYS = new Set([
  "manifestPath",
  "outputPath",
  "force",
  "verifyDeterminism",
]);
const NOTE_BUILD_KEYS = new Set([
  "inputPath",
  "outputPath",
  "force",
]);
const VERIFY_KEYS = new Set([
  "html",
  "path",
  "requiredDataBlocks",
  "startupTimeoutMs",
]);

function fail(code, message, details = undefined, options = undefined) {
  throw new ArtifactBuildError(code, message, details, options);
}

function inspectOptions(options, allowedKeys, code) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    fail(code, "Options must be a plain object");
  }
  let descriptors;
  let keys;
  let prototype;
  try {
    descriptors = Object.getOwnPropertyDescriptors(options);
    keys = Reflect.ownKeys(options);
    prototype = Object.getPrototypeOf(options);
  } catch (cause) {
    fail(code, "Options cannot be inspected safely", undefined, { cause });
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail(code, "Options must be a plain object");
  }

  const values = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      typeof key !== "string" ||
      !allowedKeys.has(key) ||
      descriptor === undefined ||
      !descriptor.enumerable ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      fail(code, "Options contain an invalid property", {
        property: typeof key === "symbol" ? key.toString() : String(key),
      });
    }
    values[key] = descriptor.value;
  }
  return values;
}

function pathValue(value, label, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(code, `${label} must be a non-empty local filesystem path`);
  }
  return resolve(value);
}

function booleanValue(value, fallback, label, code) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(code, `${label} must be a boolean`);
  return value;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function defaultHtmlPath(sourcePath) {
  return sourcePath.replace(/\.[^.]+$/u, ".html");
}

function assertWritableDestination(outputPath, force) {
  if (force) return;
  let exists;
  try {
    lstatSync(outputPath);
    exists = true;
  } catch (cause) {
    if (cause?.code === "ENOENT") {
      exists = false;
    } else {
      fail(
        "ATOMIC_WRITE_FAILED",
        "Unable to inspect output destination",
        { output: outputPath },
        { cause },
      );
    }
  }
  if (exists) {
    fail("OUTPUT_EXISTS", "Output already exists; pass force to replace it", {
      output: outputPath,
    });
  }
}

function prepareOutputDirectory(outputPath) {
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
  } catch (cause) {
    fail(
      "ATOMIC_WRITE_FAILED",
      "Unable to prepare the output directory",
      { output: outputPath },
      { cause },
    );
  }
}

function invalidVerificationOptions(message) {
  throw new ArtifactBuildError(
    "ARTIFACT_VERIFICATION_FAILED",
    "Artifact verification received invalid options",
    {
      issues: [
        {
          code: "INVALID_VERIFICATION_OPTIONS",
          message,
        },
      ],
    },
  );
}

/**
 * Determinism verification is enabled by default. Passing
 * `verifyDeterminism: false` explicitly performs one verified render.
 */
export async function buildInteractiveArtifact(options) {
  const inspected = inspectOptions(
    options,
    INTERACTIVE_BUILD_KEYS,
    "INVALID_BUILD_OPTIONS",
  );
  const manifestPath = pathValue(
    inspected.manifestPath,
    "manifestPath",
    "INVALID_BUILD_OPTIONS",
  );
  const outputPath =
    inspected.outputPath === undefined
      ? defaultHtmlPath(manifestPath)
      : pathValue(inspected.outputPath, "outputPath", "INVALID_BUILD_OPTIONS");
  const force = booleanValue(
    inspected.force,
    false,
    "force",
    "INVALID_BUILD_OPTIONS",
  );
  const verifyDeterminism = booleanValue(
    inspected.verifyDeterminism,
    true,
    "verifyDeterminism",
    "INVALID_BUILD_OPTIONS",
  );

  assertWritableDestination(outputPath, force);
  const manifest = await loadArtifactManifest(manifestPath);
  const firstModel = await renderInteractiveModel(manifest);
  const html = renderInteractiveDocument(firstModel);
  const verification = verifyArtifactHtml(html, {
    requiredDataBlocks: firstModel.requiredDataBlocks,
  });

  if (verifyDeterminism) {
    const secondModel = await renderInteractiveModel(manifest);
    const secondHtml = renderInteractiveDocument(secondModel);
    if (secondHtml !== html) {
      fail(
        "NON_DETERMINISTIC_BUILD",
        "Second render did not produce byte-identical HTML",
      );
    }
  }

  prepareOutputDirectory(outputPath);
  atomicWriteUtf8(outputPath, html, { overwrite: force });
  return {
    ok: true,
    mode: "interactive",
    output: outputPath,
    title: firstModel.metadata.title,
    bytes: Buffer.byteLength(html, "utf8"),
    sourceHash: verification.sourceHash,
    outputHash: sha256(html),
    dataBlockIds: verification.dataBlockIds,
  };
}

export async function buildNote(options) {
  const inspected = inspectOptions(options, NOTE_BUILD_KEYS, "INVALID_BUILD_OPTIONS");
  const inputPath = pathValue(
    inspected.inputPath,
    "inputPath",
    "INVALID_BUILD_OPTIONS",
  );
  if (!existsSync(inputPath)) {
    fail("INVALID_BUILD_OPTIONS", "Markdown input was not found", {
      input: inputPath,
    });
  }
  if (extname(inputPath).toLowerCase() !== ".md") {
    fail("INVALID_BUILD_OPTIONS", "Markdown input must be a .md file");
  }
  const outputPath =
    inspected.outputPath === undefined
      ? defaultHtmlPath(inputPath)
      : pathValue(inspected.outputPath, "outputPath", "INVALID_BUILD_OPTIONS");
  const force = booleanValue(
    inspected.force,
    false,
    "force",
    "INVALID_BUILD_OPTIONS",
  );
  assertWritableDestination(outputPath, force);

  // Keep the existing note adapter byte-for-byte compatible with the CLI.
  const source = readFileSync(inputPath, "utf8");
  const { body, metadata } = parseMarkdownDocument(source);
  const { articleHtml, headings } = renderMarkdown(body, {
    sourceDirectory: dirname(inputPath),
  });
  const html = renderHtmlDocument({ metadata, articleHtml, headings });
  const verification = verifyArtifactHtml(html);

  prepareOutputDirectory(outputPath);
  atomicWriteUtf8(outputPath, html, { overwrite: force });
  return {
    ok: true,
    mode: "note",
    output: outputPath,
    title: metadata.title,
    bytes: Buffer.byteLength(html, "utf8"),
    outputHash: sha256(html),
    dataBlockIds: verification.dataBlockIds,
  };
}

export function verifyArtifact(options) {
  let inspected;
  try {
    inspected = inspectOptions(
      options,
      VERIFY_KEYS,
      "ARTIFACT_VERIFICATION_FAILED",
    );
  } catch (cause) {
    if (
      cause instanceof ArtifactBuildError &&
      cause.code === "ARTIFACT_VERIFICATION_FAILED"
    ) {
      invalidVerificationOptions("Verification options must be a plain supported object");
    }
    throw cause;
  }
  const hasHtml = Object.prototype.hasOwnProperty.call(inspected, "html");
  const hasPath = Object.prototype.hasOwnProperty.call(inspected, "path");
  if (hasHtml === hasPath) {
    invalidVerificationOptions(
      "Verification requires exactly one of html or path",
    );
  }
  const verificationOptions = {
    requiredDataBlocks: inspected.requiredDataBlocks,
    startupTimeoutMs: inspected.startupTimeoutMs,
  };
  if (hasHtml) return verifyArtifactHtml(inspected.html, verificationOptions);
  return verifyArtifactFile(inspected.path, verificationOptions);
}

export { extractDataBlocks };
