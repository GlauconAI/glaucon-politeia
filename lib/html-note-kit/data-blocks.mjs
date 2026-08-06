import { createHash } from "node:crypto";

import { ArtifactBuildError } from "./errors.mjs";

export const DATA_BLOCK_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;

const INVALID_DATA_BLOCK = "INVALID_DATA_BLOCK";

function invalid(message, details = undefined) {
  throw new ArtifactBuildError(INVALID_DATA_BLOCK, message, details);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function canonicalize(value, path, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalid("Data block numbers must be finite", { path });
    }
    if (Object.is(value, -0)) {
      invalid("Data block numbers must preserve their JSON value", {
        path,
        reason: "negative zero",
      });
    }
    return value;
  }

  if (typeof value !== "object") {
    invalid("Data block contains a non-JSON value", {
      path,
      type: valueType(value),
    });
  }

  if (ancestors.has(value)) {
    invalid("Data block contains a cycle", { path });
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const allowedKeys = new Set(["length"]);
      const result = [];

      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        allowedKeys.add(key);
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          invalid("Data block arrays must not be sparse", { path, index });
        }
        result.push(canonicalize(value[index], `${path}[${index}]`, ancestors));
      }

      const extraKey = Reflect.ownKeys(value).find((key) => !allowedKeys.has(key));
      if (extraKey !== undefined) {
        invalid("Data block arrays must not have extra properties", {
          path,
          property: typeof extraKey === "symbol" ? extraKey.toString() : extraKey,
        });
      }

      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid("Data block objects must use a plain-object prototype", { path });
    }

    const keys = Reflect.ownKeys(value);
    const symbolKey = keys.find((key) => typeof key === "symbol");
    if (symbolKey !== undefined) {
      invalid("Data block objects must not have symbol keys", {
        path,
        property: symbolKey.toString(),
      });
    }

    const result = {};
    for (const key of keys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable) {
        invalid("Data block objects must not have hidden properties", {
          path,
          property: key,
        });
      }

      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: canonicalize(value[key], `${path}.${key}`, ancestors),
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value) {
  return canonicalize(value, "$", new Set());
}

const JSON_ESCAPE = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function stableJson(value) {
  return JSON.stringify(canonicalizeJson(value), null, 2).replace(
    /[<>&\u2028\u2029]/g,
    (character) => JSON_ESCAPE[character],
  );
}

function validateId(id) {
  if (typeof id !== "string" || !DATA_BLOCK_ID.test(id)) {
    invalid("Data block id must match DATA_BLOCK_ID", { id });
  }
}

function sortedEntries(blocks) {
  if (!(blocks instanceof Map)) {
    invalid("Data blocks must be provided as a Map");
  }

  const entries = [...blocks.entries()];
  for (const [id] of entries) validateId(id);
  return entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

function escapeHtmlAttribute(value) {
  return value.replace(/[&"'<>]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      case "<":
        return "&lt;";
      default:
        return "&gt;";
    }
  });
}

export function serializeDataBlocks(blocks) {
  return sortedEntries(blocks)
    .map(
      ([id, value]) =>
        `<script type="application/json" id="${escapeHtmlAttribute(id)}">\n${stableJson(value)}\n</script>`,
    )
    .join("\n");
}

function parseAttributes(source) {
  const attributes = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;

  while ((match = pattern.exec(source)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes.set(name, value);
  }

  return attributes;
}

export function extractDataBlocks(html) {
  if (typeof html !== "string") {
    invalid("HTML containing data blocks must be a string");
  }

  const blocks = new Map();
  const scriptPattern = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi;
  let match;

  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = parseAttributes(match[1]);
    const type = attributes.get("type");
    const id = attributes.get("id");

    if (type?.toLowerCase() !== "application/json" || id === undefined) continue;

    validateId(id);
    if (blocks.has(id)) {
      invalid("Duplicate data block id", { id });
    }

    let parsed;
    try {
      parsed = JSON.parse(match[2]);
    } catch {
      invalid("Data block contains malformed JSON", { id });
    }
    blocks.set(id, canonicalizeJson(parsed));
  }

  return blocks;
}

export function computeSourceHash(blocks) {
  const hash = createHash("sha256");
  for (const [id, value] of sortedEntries(blocks)) {
    hash.update(id);
    hash.update("\0");
    hash.update(stableJson(value));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
