import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { ArtifactBuildError } from "./errors.mjs";

const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

function fail(code, message, details = undefined, options = undefined) {
  throw new ArtifactBuildError(code, message, details, options);
}

function validatePathInput(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    URL_SCHEME.test(value) ||
    value.startsWith("//")
  ) {
    fail("UNSAFE_ENTRY_PATH", `${label} must be a local filesystem path`);
  }
}

function isContained(rootPath, candidatePath) {
  const difference = relative(rootPath, candidatePath);
  return (
    difference === "" ||
    (!isAbsolute(difference) &&
      difference !== ".." &&
      !difference.startsWith(`..${sep}`))
  );
}

function posixLabel(rootPath, candidatePath) {
  const difference = relative(rootPath, candidatePath);
  return difference === "" ? "." : difference.split(sep).join("/");
}

function openTrustedFile(rootDirectory, source) {
  validatePathInput(rootDirectory, "rootDirectory");
  validatePathInput(source, "source");

  let rootPath;
  let rootStats;
  let requestedPath;
  let targetPath;
  try {
    rootPath = realpathSync(rootDirectory);
    rootStats = statSync(rootPath, { bigint: true });
  } catch (cause) {
    fail("UNSAFE_ENTRY_PATH", "Unable to resolve rootDirectory", undefined, {
      cause,
    });
  }
  if (!rootStats.isDirectory()) {
    fail("UNSAFE_ENTRY_PATH", "rootDirectory must resolve to a directory");
  }

  try {
    requestedPath = resolve(rootPath, source);
    targetPath = realpathSync(requestedPath);
  } catch (cause) {
    fail("UNSAFE_ENTRY_PATH", "Unable to resolve local entry", undefined, {
      cause,
    });
  }
  if (!isContained(rootPath, targetPath)) {
    fail("UNSAFE_ENTRY_PATH", "Local entry escapes rootDirectory");
  }

  let descriptor;
  try {
    descriptor = openSync(targetPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (cause) {
    fail("UNSAFE_ENTRY_PATH", "Unable to open local entry safely", undefined, {
      cause,
    });
  }

  try {
    const openedStats = fstatSync(descriptor, { bigint: true });
    const currentTarget = realpathSync(requestedPath);
    const targetStats = statSync(currentTarget, { bigint: true });
    if (
      !openedStats.isFile() ||
      !targetStats.isFile() ||
      !isContained(rootPath, currentTarget) ||
      openedStats.dev !== targetStats.dev ||
      openedStats.ino !== targetStats.ino
    ) {
      fail("UNSAFE_ENTRY_PATH", "Opened local entry failed identity validation");
    }
    return {
      descriptor,
      label: posixLabel(rootPath, currentTarget),
      path: currentTarget,
      identity: Object.freeze({
        dev: String(openedStats.dev),
        ino: String(openedStats.ino),
      }),
    };
  } catch (cause) {
    closeSync(descriptor);
    if (cause instanceof ArtifactBuildError) throw cause;
    fail("UNSAFE_ENTRY_PATH", "Unable to verify opened local entry", undefined, {
      cause,
    });
  }
}

function readBoundedUtf8(descriptor, maximumBytes, code, entryName) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    fail(code, `${entryName} has an invalid maximum file size`);
  }
  const bytes = Buffer.allocUnsafe(maximumBytes + 1);
  let length = 0;
  try {
    while (length < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (count === 0) break;
      length += count;
    }
  } catch (cause) {
    fail(code, `Unable to read ${entryName}`, undefined, { cause });
  }
  if (length > maximumBytes) {
    fail(code, `${entryName} exceeds the maximum file size`, { maximumBytes });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, length),
    );
  } catch (cause) {
    fail(code, `${entryName} must contain valid UTF-8`, undefined, { cause });
  }
}

export function resolveTrustedFile(rootDirectory, source) {
  const entry = openTrustedFile(rootDirectory, source);
  try {
    return {
      identity: entry.identity,
      label: entry.label,
      path: entry.path,
    };
  } finally {
    closeSync(entry.descriptor);
  }
}

export function readTrustedUtf8(
  rootDirectory,
  source,
  { maximumBytes, code, entryName },
) {
  const entry = openTrustedFile(rootDirectory, source);
  try {
    return {
      content: readBoundedUtf8(
        entry.descriptor,
        maximumBytes,
        code,
        entryName,
      ),
      identity: entry.identity,
      label: entry.label,
      path: entry.path,
    };
  } finally {
    closeSync(entry.descriptor);
  }
}
