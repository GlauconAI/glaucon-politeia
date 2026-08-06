import {
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import vm from "node:vm";

import { JSDOM } from "jsdom";

import { DATA_BLOCK_ID } from "./data-blocks.mjs";
import { ArtifactBuildError } from "./errors.mjs";

const MAX_STYLESHEET_BYTES = 2 * 1024 * 1024;
const MAX_JAVASCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_SVG_BYTES = 5 * 1024 * 1024;

const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const FORBIDDEN_CSS_RESOURCE_FUNCTIONS = new Set([
  "-webkit-image-set",
  "image",
  "image-set",
  "local",
  "src",
]);
const FORBIDDEN_SVG_ELEMENTS = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "audio",
  "discard",
  "embed",
  "feimage",
  "foreignobject",
  "iframe",
  "image",
  "object",
  "script",
  "set",
  "video",
]);
const EXTERNAL_RESOURCE_ATTRIBUTES = new Set([
  "data",
  "ping",
  "poster",
  "src",
  "srcset",
  "xml:base",
]);
const SVG_INERT_METADATA_ATTRIBUTES = new Set(["class", "id", "role"]);
const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";

function fail(code, message, details = undefined) {
  throw new ArtifactBuildError(code, message, details);
}

function isUrl(value) {
  return URL_SCHEME.test(value) || value.startsWith("//");
}

function validatePathInput(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    isUrl(value)
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

function resolveTrustedFile(rootDirectory, source) {
  validatePathInput(rootDirectory, "rootDirectory");
  validatePathInput(source, "source");

  let rootPath;
  let candidatePath;
  try {
    rootPath = realpathSync(rootDirectory);
    candidatePath = realpathSync(resolve(rootPath, source));
  } catch {
    fail("UNSAFE_ENTRY_PATH", "Unable to resolve local entry");
  }

  if (!isContained(rootPath, candidatePath)) {
    fail("UNSAFE_ENTRY_PATH", "Local entry escapes rootDirectory");
  }

  let stats;
  try {
    stats = statSync(candidatePath);
  } catch {
    fail("UNSAFE_ENTRY_PATH", "Unable to inspect local entry");
  }
  if (!stats.isFile()) {
    fail("UNSAFE_ENTRY_PATH", "Local entry must be a regular file");
  }

  return {
    path: candidatePath,
    label: posixLabel(rootPath, candidatePath),
    size: stats.size,
  };
}

export function resolveTrustedEntry(rootDirectory, source) {
  const { label } = resolveTrustedFile(rootDirectory, source);
  return { label };
}

function readStrictUtf8(entry, maximumBytes, code, entryName) {
  if (entry.size > maximumBytes) {
    fail(code, `${entryName} exceeds the maximum file size`, {
      maximumBytes,
    });
  }

  let bytes;
  try {
    bytes = readFileSync(entry.path);
  } catch {
    fail(code, `Unable to read ${entryName}`);
  }
  if (bytes.length > maximumBytes) {
    fail(code, `${entryName} exceeds the maximum file size`, {
      maximumBytes,
    });
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code, `${entryName} must contain valid UTF-8`);
  }
}

function hasDynamicImportToken(content) {
  const importWord = /\bimport\b/g;
  let match;
  while ((match = importWord.exec(content)) !== null) {
    let index = match.index + match[0].length;
    while (index < content.length) {
      while (/\s/u.test(content[index] ?? "")) index += 1;

      if (content.startsWith("/*", index)) {
        const end = content.indexOf("*/", index + 2);
        if (end === -1) break;
        index = end + 2;
        continue;
      }
      if (content.startsWith("//", index)) {
        const end = content.indexOf("\n", index + 2);
        if (end === -1) break;
        index = end + 1;
        continue;
      }
      break;
    }
    if (content[index] === "(") return true;
  }
  return false;
}

export function loadScriptEntry(rootDirectory, source) {
  const entry = resolveTrustedFile(rootDirectory, source);
  const content = readStrictUtf8(
    entry,
    MAX_JAVASCRIPT_BYTES,
    "INVALID_JAVASCRIPT",
    "JavaScript entry",
  );

  if (
    hasDynamicImportToken(content) ||
    /sourceMappingURL/i.test(content) ||
    /<\/script/i.test(content)
  ) {
    fail("INVALID_JAVASCRIPT", "JavaScript entry contains forbidden syntax", {
      label: entry.label,
    });
  }

  try {
    new vm.Script(content, { filename: entry.label });
  } catch {
    fail("INVALID_JAVASCRIPT", "JavaScript entry is not a valid classic script", {
      label: entry.label,
    });
  }

  return { label: entry.label, content };
}

function isCssWhitespace(character) {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

function isCssHexDigit(character) {
  return character !== undefined && /[0-9A-Fa-f]/.test(character);
}

function isCssIdentifierCharacter(character) {
  return (
    character !== undefined &&
    (/[A-Za-z0-9_-]/.test(character) || character.codePointAt(0) >= 0x80)
  );
}

function skipCssWhitespace(content, index) {
  while (isCssWhitespace(content[index])) index += 1;
  return index;
}

function decodeCssEscape(content, index, allowControl = false) {
  let cursor = index + 1;
  const first = content[cursor];
  if (
    first === undefined ||
    first === "\0" ||
    first === "\n" ||
    first === "\r" ||
    first === "\f"
  ) {
    return { valid: false, end: cursor };
  }

  if (!isCssHexDigit(first)) {
    return { valid: true, value: first, end: cursor + 1 };
  }

  const start = cursor;
  while (cursor - start < 6 && isCssHexDigit(content[cursor])) cursor += 1;
  const codePoint = Number.parseInt(content.slice(start, cursor), 16);
  if (
    codePoint === 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
    (!allowControl && (codePoint <= 0x1f || codePoint === 0x7f))
  ) {
    return { valid: false, end: cursor };
  }

  if (content[cursor] === "\r" && content[cursor + 1] === "\n") {
    cursor += 2;
  } else if (isCssWhitespace(content[cursor])) {
    cursor += 1;
  }

  return { valid: true, value: String.fromCodePoint(codePoint), end: cursor };
}

function skipCssString(content, index) {
  const quote = content[index];
  let cursor = index + 1;
  while (cursor < content.length) {
    const character = content[cursor];
    if (character === quote) return { valid: true, end: cursor + 1 };
    if (character === "\n" || character === "\r" || character === "\f") {
      return { valid: false, end: cursor };
    }
    if (character !== "\\") {
      cursor += 1;
      continue;
    }

    const escaped = content[cursor + 1];
    if (escaped === "\r" && content[cursor + 2] === "\n") {
      cursor += 3;
    } else if (escaped === "\n" || escaped === "\r" || escaped === "\f") {
      cursor += 2;
    } else {
      const escape = decodeCssEscape(content, cursor, true);
      if (!escape.valid) return { valid: false, end: escape.end };
      cursor = escape.end;
    }
  }
  return { valid: false, end: cursor };
}

function readCssIdentifier(content, index) {
  let cursor = index;
  let value = "";
  while (cursor < content.length) {
    if (isCssIdentifierCharacter(content[cursor])) {
      value += content[cursor];
      cursor += 1;
      continue;
    }
    if (content[cursor] !== "\\") break;

    const escape = decodeCssEscape(content, cursor);
    if (!escape.valid) return { valid: false, end: escape.end };
    value += escape.value;
    cursor = escape.end;
  }
  return { valid: true, value, end: cursor };
}

function readCssString(content, index) {
  const quote = content[index];
  let cursor = index + 1;
  let value = "";
  while (cursor < content.length) {
    const character = content[cursor];
    if (character === quote) {
      return { valid: true, value, end: cursor + 1 };
    }
    if (
      character === "\n" ||
      character === "\r" ||
      character === "\f" ||
      character === "\0"
    ) {
      return { valid: false, end: cursor };
    }
    if (character === "\\") {
      const escape = decodeCssEscape(content, cursor);
      if (!escape.valid) return { valid: false, end: escape.end };
      value += escape.value;
      cursor = escape.end;
    } else {
      value += character;
      cursor += 1;
    }
  }
  return { valid: false, end: cursor };
}

function readCssUrl(content, openingParenthesis) {
  let cursor = skipCssWhitespace(content, openingParenthesis + 1);
  let value = "";

  if (content[cursor] === '"' || content[cursor] === "'") {
    const string = readCssString(content, cursor);
    if (!string.valid) return { valid: false, end: string.end };
    value = string.value;
    cursor = skipCssWhitespace(content, string.end);
  } else {
    let trailingWhitespace = false;
    while (cursor < content.length && content[cursor] !== ")") {
      const character = content[cursor];
      if (isCssWhitespace(character)) {
        trailingWhitespace = true;
        cursor += 1;
        continue;
      }
      if (
        trailingWhitespace ||
        character === '"' ||
        character === "'" ||
        character === "(" ||
        character === "\0"
      ) {
        return { valid: false, end: cursor };
      }
      if (character === "\\") {
        const escape = decodeCssEscape(content, cursor);
        if (!escape.valid) return { valid: false, end: escape.end };
        value += escape.value;
        cursor = escape.end;
      } else {
        value += character;
        cursor += 1;
      }
    }
  }

  if (content[cursor] !== ")") return { valid: false, end: cursor };
  return { valid: true, value: value.trim(), end: cursor + 1 };
}

function scanCss(content) {
  const urls = [];
  let index = 0;

  while (index < content.length) {
    if (content.startsWith("/*", index)) {
      const end = content.indexOf("*/", index + 2);
      if (end === -1) return { invalid: true, hasImport: false, urls };
      index = end + 2;
      continue;
    }

    const character = content[index];
    if (character === '"' || character === "'") {
      const string = skipCssString(content, index);
      if (!string.valid) return { invalid: true, hasImport: false, urls };
      index = string.end;
      continue;
    }

    if (character === "@") {
      const identifier = readCssIdentifier(content, index + 1);
      if (!identifier.valid) return { invalid: true, hasImport: false, urls };
      if (identifier.value.toLowerCase() === "import") {
        return { invalid: false, hasImport: true, urls };
      }
      index = Math.max(index + 1, identifier.end);
      continue;
    }

    if (isCssIdentifierCharacter(character) || character === "\\") {
      const identifier = readCssIdentifier(content, index);
      if (!identifier.valid) return { invalid: true, hasImport: false, urls };
      let cursor = skipCssWhitespace(content, identifier.end);
      const functionName = identifier.value.toLowerCase();
      if (
        content[cursor] === "(" &&
        FORBIDDEN_CSS_RESOURCE_FUNCTIONS.has(functionName)
      ) {
        return { invalid: true, hasImport: false, urls };
      }
      if (functionName === "url" && content[cursor] === "(") {
        const url = readCssUrl(content, cursor);
        if (!url.valid) return { invalid: true, hasImport: false, urls };
        urls.push(url.value);
        index = url.end;
        continue;
      }
      index = Math.max(index + 1, identifier.end);
      continue;
    }

    if (character === "\0") {
      return { invalid: true, hasImport: false, urls };
    }
    index += 1;
  }

  return { invalid: false, hasImport: false, urls };
}

function hasUnsafeCss(content, allowedSchemes) {
  const { invalid, hasImport, urls } = scanCss(content);
  if (invalid || hasImport) return true;
  return urls.some((value) => {
    if (value === null || value.length === 0) return true;
    const normalized = value.toLowerCase();
    return !allowedSchemes.some((prefix) => normalized.startsWith(prefix));
  });
}

export function loadStylesheetEntry(rootDirectory, source) {
  const entry = resolveTrustedFile(rootDirectory, source);
  const content = readStrictUtf8(
    entry,
    MAX_STYLESHEET_BYTES,
    "INVALID_STYLESHEET",
    "Stylesheet entry",
  );

  if (
    /<\/style/i.test(content) ||
    hasUnsafeCss(content, ["data:", "#"])
  ) {
    fail("INVALID_STYLESHEET", "Stylesheet entry contains an unsafe dependency", {
      label: entry.label,
    });
  }

  return { label: entry.label, content };
}

function validateSvgDefinition(definition) {
  if (definition === null || typeof definition !== "object") {
    fail("UNSAFE_SVG", "SVG definition must be an object");
  }
  if (typeof definition.id !== "string" || !DATA_BLOCK_ID.test(definition.id)) {
    fail("UNSAFE_SVG", "SVG id must match DATA_BLOCK_ID");
  }
  if (
    definition.title !== undefined &&
    (typeof definition.title !== "string" || definition.title.trim().length === 0)
  ) {
    fail("UNSAFE_SVG", "SVG title must be a non-empty string");
  }
  if (
    definition.description !== undefined &&
    typeof definition.description !== "string"
  ) {
    fail("UNSAFE_SVG", "SVG description must be a string");
  }
}

function directChildrenByName(root, name) {
  return [...root.children].filter(
    (child) => child.localName.toLowerCase() === name,
  );
}

function firstNonEmpty(elements) {
  return elements.find((element) => (element.textContent ?? "").trim().length > 0);
}

function hasIdCollision(root, id, allowedElement) {
  return [root, ...root.querySelectorAll("[id]")].some(
    (element) => element !== allowedElement && element.getAttribute("id") === id,
  );
}

function isInertSvgMetadataAttribute(attribute, name, localName) {
  return (
    SVG_INERT_METADATA_ATTRIBUTES.has(name) ||
    SVG_INERT_METADATA_ATTRIBUTES.has(localName) ||
    name.startsWith("aria-") ||
    name.startsWith("data-") ||
    attribute.namespaceURI === XMLNS_NAMESPACE ||
    name === "xmlns" ||
    name.startsWith("xmlns:")
  );
}

function validateSvgTree(root) {
  for (const element of [root, ...root.querySelectorAll("*")]) {
    const elementName = element.localName.toLowerCase();
    if (FORBIDDEN_SVG_ELEMENTS.has(elementName)) {
      fail("UNSAFE_SVG", "SVG contains a forbidden element", {
        element: elementName,
      });
    }

    for (const attribute of element.attributes) {
      const name = attribute.name.toLowerCase();
      const localName = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || localName.startsWith("on")) {
        fail("UNSAFE_SVG", "SVG contains an event-handler attribute", {
          attribute: name,
        });
      }
      if (localName === "href" && !value.startsWith("#")) {
        fail("UNSAFE_SVG", "SVG contains an external reference", {
          attribute: name,
        });
      }
      if (localName === "href") continue;
      if (
        EXTERNAL_RESOURCE_ATTRIBUTES.has(name) ||
        EXTERNAL_RESOURCE_ATTRIBUTES.has(localName)
      ) {
        fail("UNSAFE_SVG", "SVG contains an external resource reference", {
          attribute: name,
        });
      }
      if (
        !isInertSvgMetadataAttribute(attribute, name, localName) &&
        hasUnsafeCss(attribute.value, ["#"])
      ) {
        fail("UNSAFE_SVG", "SVG contains an external resource reference", {
          attribute: name,
        });
      }
    }

    if (elementName === "style") {
      if (hasUnsafeCss(element.textContent ?? "", ["#"])) {
        fail("UNSAFE_SVG", "SVG style contains an external resource reference");
      }
    }
  }
}

function setAccessibleText(root, definition) {
  const namespace = root.namespaceURI;
  const titleElements = directChildrenByName(root, "title");
  const descriptionElements = directChildrenByName(root, "desc");

  let title =
    definition.title === undefined
      ? firstNonEmpty(titleElements)
      : titleElements[0];
  if (title === undefined && definition.title !== undefined) {
    title = root.ownerDocument.createElementNS(namespace, "title");
  }
  if (title === undefined) {
    fail("UNSAFE_SVG", "SVG requires a non-empty accessible title");
  }
  if (definition.title !== undefined) title.textContent = definition.title;
  if ((title.textContent ?? "").trim().length === 0) {
    fail("UNSAFE_SVG", "SVG requires a non-empty accessible title");
  }

  let description =
    definition.description === undefined
      ? firstNonEmpty(descriptionElements)
      : descriptionElements[0];
  if (description === undefined && definition.description !== undefined) {
    description = root.ownerDocument.createElementNS(namespace, "desc");
  }
  if (definition.description !== undefined) {
    description.textContent = definition.description;
  }
  if ((description?.textContent ?? "").trim().length === 0) {
    description = undefined;
  }

  for (const element of titleElements) {
    if (element !== title) element.remove();
  }
  for (const element of descriptionElements) {
    if (element !== description) element.remove();
  }

  const titleId = `${definition.id}-title`;
  const descriptionId = `${definition.id}-description`;
  if (hasIdCollision(root, titleId, title)) {
    fail("UNSAFE_SVG", "SVG accessible title id collides with existing content");
  }
  if (description !== undefined && hasIdCollision(root, descriptionId, description)) {
    fail("UNSAFE_SVG", "SVG accessible description id collides with existing content");
  }

  title.setAttribute("id", titleId);
  root.insertBefore(title, root.firstChild);
  const labelledBy = [titleId];
  if (description !== undefined) {
    description.setAttribute("id", descriptionId);
    root.insertBefore(description, title.nextSibling);
    labelledBy.push(descriptionId);
  }
  root.setAttribute("aria-labelledby", labelledBy.join(" "));
}

function serializeSvgFrame(root, id) {
  const outputDom = new JSDOM("<!doctype html><body></body>");
  try {
    const document = outputDom.window.document;
    const frame = document.createElement("div");
    frame.className = "artifact-svg-frame";
    frame.setAttribute("data-svg-id", id);
    frame.append(document.importNode(root, true));
    return frame.outerHTML;
  } finally {
    outputDom.window.close();
  }
}

export function loadSvgAsset(rootDirectory, definition) {
  validateSvgDefinition(definition);
  const entry = resolveTrustedFile(rootDirectory, definition.source);
  const content = readStrictUtf8(
    entry,
    MAX_SVG_BYTES,
    "UNSAFE_SVG",
    "SVG asset",
  );

  if (/<\s*!(?:doctype|entity)\b/i.test(content)) {
    fail("UNSAFE_SVG", "SVG declarations are not allowed", {
      label: entry.label,
    });
  }

  let dom;
  try {
    dom = new JSDOM(content, { contentType: "image/svg+xml" });
  } catch {
    fail("UNSAFE_SVG", "Unable to parse SVG asset", { label: entry.label });
  }

  try {
    const root = dom.window.document.documentElement;
    if (root.localName !== "svg") {
      fail("UNSAFE_SVG", "SVG asset must have an svg root element", {
        label: entry.label,
      });
    }
    const viewBox = root.getAttribute("viewBox");
    if (viewBox === null || viewBox.trim().length === 0) {
      fail("UNSAFE_SVG", "SVG asset requires a non-empty viewBox", {
        label: entry.label,
      });
    }

    validateSvgTree(root);
    setAccessibleText(root, definition);
    root.setAttribute("role", "img");
    root.classList.add("artifact-svg");

    return {
      id: definition.id,
      label: entry.label,
      html: serializeSvgFrame(root, definition.id),
    };
  } finally {
    dom.window.close();
  }
}
