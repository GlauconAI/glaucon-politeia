import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { ArtifactBuildError } from "./errors.mjs";

const DEFAULT_MAXIMUM_BYTES = 64 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const MAX_TEMP_ATTEMPTS = 32;
let temporarySequence = 0;

function fail(code, message, details = undefined, options = undefined) {
  throw new ArtifactBuildError(code, message, details, options);
}

function localPath(value, label, code) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    fail(code, `${label} must be a non-empty local filesystem path`);
  }
  return resolve(value);
}

function maximumBytes(options) {
  if (options === undefined) return DEFAULT_MAXIMUM_BYTES;
  let descriptors;
  let keys;
  let prototype;
  try {
    descriptors = Object.getOwnPropertyDescriptors(options);
    keys = Reflect.ownKeys(options);
    prototype = Object.getPrototypeOf(options);
  } catch (cause) {
    fail("ARTIFACT_READ_FAILED", "Read options cannot be inspected safely", undefined, {
      cause,
    });
  }
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    (prototype !== Object.prototype && prototype !== null) ||
    keys.some((key) => key !== "maximumBytes") ||
    (descriptors.maximumBytes !== undefined &&
      ("get" in descriptors.maximumBytes || "set" in descriptors.maximumBytes))
  ) {
    fail("ARTIFACT_READ_FAILED", "Read options must be a plain bounded options object");
  }
  const maximum = descriptors.maximumBytes?.value ?? DEFAULT_MAXIMUM_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 256 * 1024 * 1024) {
    fail("ARTIFACT_READ_FAILED", "maximumBytes must be a bounded non-negative integer");
  }
  return maximum;
}

export function readUtf8File(pathInput, options = undefined) {
  const path = localPath(pathInput, "File path", "ARTIFACT_READ_FAILED");
  const maximum = maximumBytes(options);
  let descriptor;

  try {
    descriptor = openSync(path, constants.O_RDONLY);
    const stats = fstatSync(descriptor, { bigint: true });
    if (!stats.isFile()) {
      fail("ARTIFACT_READ_FAILED", "File path must resolve to a regular file", {
        path,
      });
    }
    if (stats.size > BigInt(maximum)) {
      fail("ARTIFACT_READ_FAILED", "File exceeds the maximum byte size", {
        maximumBytes: maximum,
        path,
      });
    }

    const chunks = [];
    let length = 0;
    while (true) {
      const remaining = maximum + 1 - length;
      if (remaining <= 0) break;
      const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remaining));
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      length += count;
    }
    if (length > maximum) {
      fail("ARTIFACT_READ_FAILED", "File exceeds the maximum byte size", {
        maximumBytes: maximum,
        path,
      });
    }

    const bytes = Buffer.concat(chunks, length);
    let content;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause) {
      fail("ARTIFACT_READ_FAILED", "File must contain valid UTF-8", { path }, {
        cause,
      });
    }
    return { bytes, byteLength: length, content, path };
  } catch (cause) {
    if (cause instanceof ArtifactBuildError) throw cause;
    fail("ARTIFACT_READ_FAILED", "Unable to read UTF-8 file", { path }, { cause });
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // A close failure must not replace a stable read failure.
      }
    }
  }
}

function openTemporary(destination) {
  const directory = dirname(destination);
  const name = basename(destination);
  for (let attempt = 0; attempt < MAX_TEMP_ATTEMPTS; attempt += 1) {
    temporarySequence += 1;
    const temporaryPath = resolve(
      directory,
      `.${name}.tmp-${process.pid}-${temporarySequence}`,
    );
    try {
      const descriptor = openSync(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o600,
      );
      return { descriptor, temporaryPath };
    } catch (cause) {
      if (cause?.code !== "EEXIST") throw cause;
    }
  }
  throw new Error("Unable to reserve an exclusive temporary file");
}

export function atomicWriteUtf8(pathInput, content) {
  const destination = localPath(
    pathInput,
    "Destination path",
    "ATOMIC_WRITE_FAILED",
  );
  if (typeof content !== "string") {
    fail("ATOMIC_WRITE_FAILED", "Atomic UTF-8 content must be a string", {
      path: destination,
    });
  }

  let descriptor;
  let temporaryPath;
  try {
    ({ descriptor, temporaryPath } = openTemporary(destination));
    writeFileSync(descriptor, content, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, destination);
    temporaryPath = undefined;
  } catch (cause) {
    if (cause instanceof ArtifactBuildError) throw cause;
    fail(
      "ATOMIC_WRITE_FAILED",
      "Unable to atomically replace the UTF-8 destination",
      { path: destination },
      { cause },
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the primary write failure.
      }
    }
    if (temporaryPath !== undefined) {
      try {
        unlinkSync(temporaryPath);
      } catch (cause) {
        if (cause?.code !== "ENOENT") {
          // Cleanup is intentionally limited to the exact temporary path.
        }
      }
    }
  }
}
