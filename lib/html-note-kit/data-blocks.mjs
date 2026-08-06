import { createHash } from "node:crypto";

import { ArtifactBuildError } from "./errors.mjs";

export const DATA_BLOCK_ID = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;

const INVALID_DATA_BLOCK = "INVALID_DATA_BLOCK";
const MAX_JSON_DEPTH = 256;

function invalid(message, details = undefined) {
  throw new ArtifactBuildError(INVALID_DATA_BLOCK, message, details);
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function canonicalize(value, path, ancestors, depth) {
  if (depth > MAX_JSON_DEPTH) {
    invalid("Data block exceeds the maximum JSON depth", {
      maxDepth: MAX_JSON_DEPTH,
      path,
      reason: "maximum depth exceeded",
    });
  }

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
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        invalid("Data block arrays must use Array.prototype", { path });
      }

      const allowedKeys = new Set(["length"]);
      const result = [];

      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        allowedKeys.add(key);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined) {
          invalid("Data block arrays must not be sparse", { path, index });
        }
        if ("get" in descriptor || "set" in descriptor) {
          invalid("Data block arrays must not contain accessors", { path, index });
        }
        result.push(
          canonicalize(descriptor.value, `${path}[${index}]`, ancestors, depth + 1),
        );
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
      if ("get" in descriptor || "set" in descriptor) {
        invalid("Data block objects must not contain accessors", {
          path,
          property: key,
        });
      }

      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: canonicalize(descriptor.value, `${path}.${key}`, ancestors, depth + 1),
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value) {
  return canonicalize(value, "$", new Set(), 0);
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
    invalid("Data block id must match DATA_BLOCK_ID", { id: normalizedInvalidId(id) });
  }
}

function normalizedInvalidId(id) {
  if (typeof id === "string") return id;
  if (
    typeof id === "bigint" ||
    typeof id === "boolean" ||
    typeof id === "number" ||
    typeof id === "symbol"
  ) {
    return String(id);
  }
  if (typeof id === "undefined") return "undefined";
  if (typeof id === "function") return "[function]";
  return `[${valueType(id)}]`;
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

const NAMED_ATTRIBUTE_REFERENCES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["colon", ":"],
  ["gt", ">"],
  ["hyphen", "-"],
  ["lowbar", "_"],
  ["lt", "<"],
  ["period", "."],
  ["quot", '"'],
  ["sol", "/"],
]);

function isHtmlWhitespace(character) {
  return character === "\t" || character === "\n" || character === "\f" ||
    character === "\r" || character === " ";
}

function decodeAttributeReferences(value) {
  return value.replace(
    /&#(?:[xX]([0-9A-Fa-f]+)|([0-9]+));?|&([A-Za-z][A-Za-z0-9]+);/g,
    (reference, hex, decimal, named) => {
      if (named !== undefined) return NAMED_ATTRIBUTE_REFERENCES.get(named) ?? reference;

      const codePoint = Number.parseInt(hex ?? decimal, hex === undefined ? 10 : 16);
      if (
        codePoint === 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return "\ufffd";
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function parseAttributes(source) {
  const attributes = new Map();
  let cursor = 0;

  while (cursor < source.length) {
    while (isHtmlWhitespace(source[cursor])) cursor += 1;
    if (cursor >= source.length) break;
    if (source[cursor] === "/") {
      cursor += 1;
      continue;
    }

    const nameStart = cursor;
    cursor += 1;
    while (
      cursor < source.length &&
      !isHtmlWhitespace(source[cursor]) &&
      source[cursor] !== "/" &&
      source[cursor] !== "="
    ) {
      cursor += 1;
    }
    const name = asciiLowercase(source.slice(nameStart, cursor));
    while (isHtmlWhitespace(source[cursor])) cursor += 1;

    let value = "";
    if (source[cursor] === "=") {
      cursor += 1;
      while (isHtmlWhitespace(source[cursor])) cursor += 1;
      const quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor] : undefined;
      if (quote !== undefined) {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < source.length && source[cursor] !== quote) cursor += 1;
        value = source.slice(valueStart, cursor);
        if (source[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < source.length && !isHtmlWhitespace(source[cursor])) cursor += 1;
        value = source.slice(valueStart, cursor);
      }
    }

    if (!attributes.has(name)) {
      attributes.set(name, decodeAttributeReferences(value));
    }
  }

  return attributes;
}

const RAW_TEXT_ELEMENTS = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "style",
  "textarea",
  "title",
  "xmp",
]);

function findTagEnd(html, start) {
  let quote;

  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }

  return -1;
}

function isTagNameDelimiter(character) {
  return character === undefined || /[\t\n\f\r />]/.test(character);
}

function asciiLowercase(value) {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function matchesAsciiCaseInsensitive(source, start, expected) {
  if (start + expected.length > source.length) return false;

  for (let offset = 0; offset < expected.length; offset += 1) {
    const sourceCode = source.charCodeAt(start + offset);
    const foldedCode = sourceCode >= 65 && sourceCode <= 90 ? sourceCode + 32 : sourceCode;
    if (foldedCode !== expected.charCodeAt(offset)) return false;
  }

  return true;
}

function readStartTag(html, start) {
  const nameStart = start + 1;
  if (!/[A-Za-z]/.test(html[nameStart] ?? "")) return undefined;

  let nameEnd = nameStart + 1;
  while (!isTagNameDelimiter(html[nameEnd])) nameEnd += 1;

  const end = findTagEnd(html, nameEnd);
  if (end === -1) return null;

  return {
    attributes: html.slice(nameEnd, end),
    end,
    name: asciiLowercase(html.slice(nameStart, nameEnd)),
  };
}

function readClosingTag(html, start) {
  const nameStart = start + 2;
  if (!/[A-Za-z]/.test(html[nameStart] ?? "")) return undefined;

  let nameEnd = nameStart + 1;
  while (!isTagNameDelimiter(html[nameEnd])) nameEnd += 1;

  const end = findTagEnd(html, nameEnd);
  if (end === -1) return null;
  return {
    end,
    name: asciiLowercase(html.slice(nameStart, nameEnd)),
  };
}

function findClosingElement(html, start, name) {
  const prefix = `</${name}`;
  let cursor = start;

  while ((cursor = html.indexOf("<", cursor)) !== -1) {
    if (!matchesAsciiCaseInsensitive(html, cursor, prefix)) {
      cursor += 1;
      continue;
    }

    const nameEnd = cursor + prefix.length;
    if (!isTagNameDelimiter(html[nameEnd])) {
      cursor = nameEnd;
      continue;
    }

    const end = findTagEnd(html, nameEnd);
    if (end === -1) return undefined;
    return { end, start: cursor };
  }

  return undefined;
}

function findNestedTemplateClosing(html, start) {
  let cursor = start;
  let depth = 1;

  while ((cursor = html.indexOf("<", cursor)) !== -1) {
    if (html.startsWith("<!--", cursor)) {
      const commentEnd = html.indexOf("-->", cursor + 4);
      if (commentEnd === -1) return undefined;
      cursor = commentEnd + 3;
      continue;
    }

    if (html[cursor + 1] === "/") {
      const closingTag = readClosingTag(html, cursor);
      if (closingTag === null) return undefined;
      if (closingTag === undefined) {
        cursor += 1;
        continue;
      }
      if (closingTag.name === "template") {
        depth -= 1;
        if (depth === 0) return { end: closingTag.end, start: cursor };
      }
      cursor = closingTag.end + 1;
      continue;
    }

    if (html[cursor + 1] === "!" || html[cursor + 1] === "?") {
      const end = findTagEnd(html, cursor + 2);
      if (end === -1) return undefined;
      cursor = end + 1;
      continue;
    }

    const tag = readStartTag(html, cursor);
    if (tag === null) return undefined;
    if (tag === undefined) {
      cursor += 1;
      continue;
    }

    if (tag.name === "template") {
      depth += 1;
      cursor = tag.end + 1;
      continue;
    }

    if (tag.name === "script" || RAW_TEXT_ELEMENTS.has(tag.name)) {
      const closing = findClosingElement(html, tag.end + 1, tag.name);
      if (closing === undefined) return undefined;
      cursor = closing.end + 1;
      continue;
    }

    cursor = tag.end + 1;
  }

  return undefined;
}

function findScriptElements(html) {
  const elements = [];
  let cursor = 0;

  while ((cursor = html.indexOf("<", cursor)) !== -1) {
    if (html.startsWith("<!--", cursor)) {
      const commentEnd = html.indexOf("-->", cursor + 4);
      cursor = commentEnd === -1 ? html.length : commentEnd + 3;
      continue;
    }

    if (html[cursor + 1] === "/" || html[cursor + 1] === "!" || html[cursor + 1] === "?") {
      const end = findTagEnd(html, cursor + 2);
      cursor = end === -1 ? html.length : end + 1;
      continue;
    }

    const tag = readStartTag(html, cursor);
    if (tag === null) break;
    if (tag === undefined) {
      cursor += 1;
      continue;
    }

    if (tag.name === "plaintext") break;

    if (tag.name === "script") {
      const closing = findClosingElement(html, tag.end + 1, "script");
      if (closing === undefined) break;
      elements.push({
        attributes: tag.attributes,
        content: html.slice(tag.end + 1, closing.start),
      });
      cursor = closing.end + 1;
      continue;
    }

    if (tag.name === "template") {
      const closing = findNestedTemplateClosing(html, tag.end + 1);
      cursor = closing === undefined ? html.length : closing.end + 1;
      continue;
    }

    if (RAW_TEXT_ELEMENTS.has(tag.name)) {
      const closing = findClosingElement(html, tag.end + 1, tag.name);
      cursor = closing === undefined ? html.length : closing.end + 1;
      continue;
    }

    cursor = tag.end + 1;
  }

  return elements;
}

export function extractDataBlocks(html) {
  if (typeof html !== "string") {
    invalid("HTML containing data blocks must be a string");
  }

  const blocks = new Map();
  for (const element of findScriptElements(html)) {
    const attributes = parseAttributes(element.attributes);
    const type = attributes.get("type");
    const id = attributes.get("id");

    if (type === undefined || asciiLowercase(type) !== "application/json" || id === undefined) {
      continue;
    }

    validateId(id);
    if (blocks.has(id)) {
      invalid("Duplicate data block id", { id });
    }

    let parsed;
    try {
      parsed = JSON.parse(element.content);
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
