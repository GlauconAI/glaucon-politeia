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
const FORBIDDEN_SVG_ELEMENTS = new Set([
  "audio",
  "embed",
  "feimage",
  "foreignobject",
  "iframe",
  "image",
  "object",
  "script",
  "video",
]);
const EXTERNAL_RESOURCE_ATTRIBUTES = new Set([
  "data",
  "poster",
  "src",
  "srcset",
  "xml:base",
]);

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

export function resolveTrustedEntry(rootDirectory, source) {
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
  const entry = resolveTrustedEntry(rootDirectory, source);
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

function isIdentifierCharacter(character) {
  return character !== undefined && /[A-Za-z0-9_-]/.test(character);
}

function scanCss(content) {
  const urls = [];
  let hasImport = false;
  let index = 0;

  while (index < content.length) {
    if (content.startsWith("/*", index)) {
      const end = content.indexOf("*/", index + 2);
      index = end === -1 ? content.length : end + 2;
      continue;
    }

    const character = content[index];
    if (character === '"' || character === "'") {
      const quote = character;
      index += 1;
      while (index < content.length) {
        if (content[index] === "\\") {
          index += 2;
        } else if (content[index] === quote) {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }
      continue;
    }

    if (
      character === "@" &&
      content.slice(index, index + 7).toLowerCase() === "@import" &&
      !isIdentifierCharacter(content[index + 7])
    ) {
      hasImport = true;
      index += 7;
      continue;
    }

    if (
      content.slice(index, index + 3).toLowerCase() === "url" &&
      !isIdentifierCharacter(content[index - 1]) &&
      !isIdentifierCharacter(content[index + 3])
    ) {
      let cursor = index + 3;
      while (/\s/u.test(content[cursor] ?? "")) cursor += 1;
      if (content[cursor] !== "(") {
        index += 3;
        continue;
      }
      cursor += 1;
      while (/\s/u.test(content[cursor] ?? "")) cursor += 1;

      let value = "";
      const quote = content[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        while (cursor < content.length && content[cursor] !== quote) {
          if (content[cursor] === "\\" && cursor + 1 < content.length) {
            value += content[cursor] + content[cursor + 1];
            cursor += 2;
          } else {
            value += content[cursor];
            cursor += 1;
          }
        }
        if (content[cursor] !== quote) {
          urls.push(null);
          break;
        }
        cursor += 1;
        while (/\s/u.test(content[cursor] ?? "")) cursor += 1;
      } else {
        const end = content.indexOf(")", cursor);
        if (end === -1) {
          urls.push(null);
          break;
        }
        value = content.slice(cursor, end).trim();
        cursor = end;
      }

      if (content[cursor] !== ")") {
        urls.push(null);
        break;
      }
      urls.push(value.trim());
      index = cursor + 1;
      continue;
    }

    index += 1;
  }

  return { hasImport, urls };
}

function hasUnsafeCss(content, allowedSchemes) {
  const { hasImport, urls } = scanCss(content);
  if (hasImport) return true;
  return urls.some((value) => {
    if (value === null || value.length === 0) return true;
    const normalized = value.toLowerCase();
    return !allowedSchemes.some((prefix) => normalized.startsWith(prefix));
  });
}

export function loadStylesheetEntry(rootDirectory, source) {
  const entry = resolveTrustedEntry(rootDirectory, source);
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
  return [...root.querySelectorAll("[id]")].some(
    (element) => element !== allowedElement && element.getAttribute("id") === id,
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
      if (
        EXTERNAL_RESOURCE_ATTRIBUTES.has(name) ||
        EXTERNAL_RESOURCE_ATTRIBUTES.has(localName) ||
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
  const entry = resolveTrustedEntry(rootDirectory, definition.source);
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
