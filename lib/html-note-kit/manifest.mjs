import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  loadScriptEntry,
  loadStylesheetEntry,
  loadSvgAsset,
  resolveTrustedEntry,
} from "./assets.mjs";
import { canonicalizeJson, DATA_BLOCK_ID } from "./data-blocks.mjs";
import { ArtifactBuildError } from "./errors.mjs";

const MANIFEST_INTERNAL = Symbol.for("402v.html-note-kit.manifest-internal.v1");
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_DATA_BYTES = 16 * 1024 * 1024;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const TOP_LEVEL_KEYS = new Set([
  "contractVersion",
  "mode",
  "rootDirectory",
  "metadata",
  "dataBlocks",
  "renderer",
  "styles",
  "scripts",
  "svgAssets",
  "requiredDataBlocks",
]);
const METADATA_KEYS = new Set(["title", "description", "eyebrow", "lang"]);
const DATA_BLOCK_KEYS = new Set(["id", "source"]);
const SVG_ASSET_KEYS = new Set([
  "id",
  "source",
  "title",
  "description",
]);

function fail(code, message, details = undefined, options = undefined) {
  throw new ArtifactBuildError(code, message, details, options);
}

function invalidManifest(message, details = undefined, options = undefined) {
  fail("INVALID_MANIFEST", message, details, options);
}

function stableLabel(value) {
  if (typeof value === "string") return value;
  if (typeof value === "symbol") return value.toString();
  return String(value);
}

function plainRecord(value, label, allowedKeys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    invalidManifest(`${label} must be a plain object`);
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    const property = stableLabel(key);
    if (typeof key !== "string" || !allowedKeys.has(key)) {
      invalidManifest(`${label} contains an unknown property`, { property });
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      invalidManifest(`${label} properties must be enumerable data properties`, {
        property,
      });
    }
  }
  return descriptors;
}

function field(descriptors, key) {
  return descriptors[key]?.value;
}

function denseArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    invalidManifest(`${label} must be an array`);
  }
  const ownKeys = Reflect.ownKeys(value);
  const allowedKeys = new Set(["length"]);
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    allowedKeys.add(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      invalidManifest(`${label} must be dense and contain only data values`, {
        index,
      });
    }
  }
  const extra = ownKeys.find((key) => !allowedKeys.has(key));
  if (extra !== undefined) {
    invalidManifest(`${label} must not contain extra properties`, {
      property: stableLabel(extra),
    });
  }
  return value;
}

function stringValue(value, label) {
  if (typeof value !== "string") {
    invalidManifest(`${label} must be a string`);
  }
  return value;
}

function localPathValue(value, label) {
  const path = stringValue(value, label);
  if (
    path.length === 0 ||
    path.includes("\0") ||
    URL_SCHEME.test(path) ||
    path.startsWith("//")
  ) {
    invalidManifest(`${label} must be a non-empty local path`);
  }
  return path;
}

function readStrictUtf8(path, maximumBytes, code, label) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (cause) {
    fail(code, `Unable to read ${label}`, undefined, { cause });
  }
  if (bytes.length > maximumBytes) {
    fail(code, `${label} exceeds the maximum file size`, { maximumBytes });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    fail(code, `${label} must contain valid UTF-8`, undefined, { cause });
  }
}

function contentHash(content) {
  return createHash("sha256").update(content).digest("hex");
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

function resolveManifestPath(input) {
  const source = localPathValue(input, "manifest path");
  let path;
  let stats;
  try {
    path = realpathSync(resolve(source));
    stats = statSync(path);
  } catch (cause) {
    invalidManifest("Unable to resolve manifest path", undefined, { cause });
  }
  if (!stats.isFile()) invalidManifest("Manifest path must resolve to a file");
  return path;
}

function resolveRootDirectory(manifestDirectory, declaredRoot) {
  if (declaredRoot !== undefined && isAbsolute(declaredRoot)) {
    invalidManifest("rootDirectory must be relative to the manifest directory");
  }
  const source = declaredRoot ?? ".";
  localPathValue(source, "rootDirectory");
  let rootPath;
  let stats;
  try {
    rootPath = realpathSync(resolve(manifestDirectory, source));
    stats = statSync(rootPath);
  } catch (cause) {
    invalidManifest("Unable to resolve rootDirectory", undefined, { cause });
  }
  if (!stats.isDirectory()) invalidManifest("rootDirectory must resolve to a directory");
  if (!isContained(manifestDirectory, rootPath)) {
    invalidManifest("rootDirectory must remain beneath the manifest directory");
  }
  return rootPath;
}

async function importLocalModule(path, code, label) {
  const content = readStrictUtf8(path, MAX_MANIFEST_BYTES, code, label);
  const url = new URL(pathToFileURL(path));
  url.searchParams.set("content", contentHash(content));
  try {
    // Vitest evaluates this module through its VM runner, which cannot hand
    // arbitrary local file URLs back to Node. A content URL preserves the
    // same cache key in tests; production always uses the hashed file URL.
    if (process.env.VITEST) {
      return await import(
        /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(content).toString("base64")}`
      );
    }
    return await import(/* @vite-ignore */ url.href);
  } catch (cause) {
    fail(code, `Unable to import ${label}`, undefined, { cause });
  }
}

function validateMetadata(value) {
  const descriptors = plainRecord(value, "metadata", METADATA_KEYS);
  for (const key of METADATA_KEYS) {
    if (descriptors[key] === undefined) {
      invalidManifest("metadata is missing a required property", { property: key });
    }
  }
  return Object.freeze({
    title: stringValue(field(descriptors, "title"), "metadata.title"),
    description: stringValue(
      field(descriptors, "description"),
      "metadata.description",
    ),
    eyebrow: stringValue(field(descriptors, "eyebrow"), "metadata.eyebrow"),
    lang: stringValue(field(descriptors, "lang"), "metadata.lang"),
  });
}

function validateId(value, label) {
  if (typeof value !== "string" || !DATA_BLOCK_ID.test(value)) {
    invalidManifest(`${label} must match DATA_BLOCK_ID`);
  }
  return value;
}

function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) {
      invalidManifest(`${label} ids must be unique`, { id: item.id });
    }
    ids.add(item.id);
  }
  return ids;
}

function normalizeDataBlocks(value, rootPath) {
  const definitions = denseArray(value, "dataBlocks").map(
    (definition, index) => {
      const label = `dataBlocks[${index}]`;
      const descriptors = plainRecord(definition, label, DATA_BLOCK_KEYS);
      const id = validateId(field(descriptors, "id"), `${label}.id`);
      const source = localPathValue(field(descriptors, "source"), `${label}.source`);
      return { id, source };
    },
  );
  uniqueIds(definitions, "dataBlocks");
  return Object.freeze(
    definitions.map(({ id, source }) =>
      Object.freeze({
        id,
        source: resolveTrustedEntry(rootPath, source).label,
      }),
    ),
  );
}

function normalizeStringEntries(value, label, rootPath) {
  return Object.freeze(
    denseArray(value, label).map((source, index) => {
      const normalized = localPathValue(source, `${label}[${index}]`);
      return resolveTrustedEntry(rootPath, normalized).label;
    }),
  );
}

function normalizeSvgAssets(value, rootPath) {
  const definitions = denseArray(value, "svgAssets").map(
    (definition, index) => {
      const label = `svgAssets[${index}]`;
      const descriptors = plainRecord(definition, label, SVG_ASSET_KEYS);
      const id = validateId(field(descriptors, "id"), `${label}.id`);
      const source = localPathValue(field(descriptors, "source"), `${label}.source`);
      const normalized = { id, source };
      for (const key of ["title", "description"]) {
        if (descriptors[key] !== undefined) {
          normalized[key] = stringValue(field(descriptors, key), `${label}.${key}`);
        }
      }
      return normalized;
    },
  );
  uniqueIds(definitions, "svgAssets");
  return Object.freeze(
    definitions.map((definition) =>
      Object.freeze({
        ...definition,
        source: resolveTrustedEntry(rootPath, definition.source).label,
      }),
    ),
  );
}

function normalizeRequiredBlocks(value, availableIds) {
  const required = denseArray(value, "requiredDataBlocks").map((id, index) =>
    validateId(id, `requiredDataBlocks[${index}]`),
  );
  const seen = new Set();
  for (const id of required) {
    if (seen.has(id)) {
      invalidManifest("requiredDataBlocks must not contain duplicates", { id });
    }
    if (!availableIds.has(id)) {
      invalidManifest("requiredDataBlocks must reference declared data blocks", {
        id,
      });
    }
    seen.add(id);
  }
  return Object.freeze(required);
}

function loadCanonicalData(rootPath, definitions) {
  const data = new Map();
  for (const definition of definitions) {
    const path = resolve(rootPath, definition.source);
    const content = readStrictUtf8(
      path,
      MAX_DATA_BYTES,
      "INVALID_DATA_BLOCK",
      `data block ${definition.id}`,
    );
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (cause) {
      fail(
        "INVALID_DATA_BLOCK",
        "Data block source must contain strict JSON",
        { id: definition.id, source: definition.source },
        { cause },
      );
    }
    data.set(definition.id, canonicalizeJson(parsed));
  }
  return data;
}

function cloneCanonicalMap(data) {
  return new Map(
    [...data.entries()].map(([id, value]) => [id, canonicalizeJson(value)]),
  );
}

export async function loadArtifactManifest(manifestInput) {
  const manifestPath = resolveManifestPath(manifestInput);
  const manifestDirectory = dirname(manifestPath);
  const namespace = await importLocalModule(
    manifestPath,
    "INVALID_MANIFEST",
    "artifact manifest",
  );
  const descriptors = plainRecord(
    namespace.default,
    "artifact manifest",
    TOP_LEVEL_KEYS,
  );

  if (field(descriptors, "contractVersion") !== 1) {
    invalidManifest("contractVersion must be 1");
  }
  if (field(descriptors, "mode") !== "interactive") {
    invalidManifest('mode must be exactly "interactive"');
  }

  const rootDeclaration =
    descriptors.rootDirectory === undefined
      ? undefined
      : localPathValue(field(descriptors, "rootDirectory"), "rootDirectory");
  const rootPath = resolveRootDirectory(manifestDirectory, rootDeclaration);
  const metadata = validateMetadata(field(descriptors, "metadata"));
  const dataBlocks = normalizeDataBlocks(field(descriptors, "dataBlocks"), rootPath);
  const dataIds = uniqueIds(dataBlocks, "dataBlocks");
  const rendererSource = localPathValue(field(descriptors, "renderer"), "renderer");
  const renderer = resolveTrustedEntry(rootPath, rendererSource).label;
  const styles = normalizeStringEntries(field(descriptors, "styles"), "styles", rootPath);
  const scripts = normalizeStringEntries(field(descriptors, "scripts"), "scripts", rootPath);
  const svgAssets = normalizeSvgAssets(field(descriptors, "svgAssets"), rootPath);
  uniqueIds(svgAssets, "svgAssets");
  const requiredDataBlocks = normalizeRequiredBlocks(
    field(descriptors, "requiredDataBlocks"),
    dataIds,
  );
  const initialData = loadCanonicalData(rootPath, dataBlocks);

  const manifest = {
    contractVersion: 1,
    mode: "interactive",
    rootDirectory: posixLabel(manifestDirectory, rootPath),
    metadata,
    dataBlocks,
    renderer,
    styles,
    scripts,
    svgAssets,
    requiredDataBlocks,
  };

  Object.defineProperty(manifest, MANIFEST_INTERNAL, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      loadData: () => cloneCanonicalMap(initialData),
      loadStyles: () => styles.map((source) => loadStylesheetEntry(rootPath, source)),
      loadScripts: () => scripts.map((source) => loadScriptEntry(rootPath, source)),
      loadSvg: () => svgAssets.map((definition) => loadSvgAsset(rootPath, definition)),
      importRenderer: async () => {
        const path = resolve(rootPath, renderer);
        return importLocalModule(
          path,
          "INVALID_RENDERER_RESULT",
          `renderer ${renderer}`,
        );
      },
    }),
    writable: false,
  });

  return Object.freeze(manifest);
}
