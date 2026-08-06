import { canonicalizeJson, DATA_BLOCK_ID } from "./data-blocks.mjs";
import { ArtifactBuildError } from "./errors.mjs";

const MANIFEST_INTERNAL = Symbol.for("402v.html-note-kit.manifest-internal.v1");

export const INTERACTIVE_SLOTS = Object.freeze([
  "navigation",
  "heroSupplementary",
  "mainSections",
  "rail",
  "footer",
]);

const SLOT_SET = new Set(INTERACTIVE_SLOTS);

function fail(code, message, details = undefined, options = undefined) {
  throw new ArtifactBuildError(code, message, details, options);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return value;
}

function rendererData(data) {
  const result = Object.create(null);
  for (const [id, value] of data) {
    Object.defineProperty(result, id, {
      configurable: false,
      enumerable: true,
      value: canonicalizeJson(value),
      writable: false,
    });
  }
  return deepFreeze(result);
}

function rendererSvg(assets) {
  const result = Object.create(null);
  for (const asset of assets) {
    Object.defineProperty(result, asset.id, {
      configurable: false,
      enumerable: true,
      value: deepFreeze({ ...asset }),
      writable: false,
    });
  }
  return deepFreeze(result);
}

function canonicalPreservedData(value) {
  if (value === undefined) return new Map();
  if (!(value instanceof Map)) {
    fail("INVALID_DATA_BLOCK", "preservedData must be a Map");
  }
  const result = new Map();
  for (const [id, data] of value) {
    if (typeof id !== "string" || !DATA_BLOCK_ID.test(id)) {
      fail("INVALID_DATA_BLOCK", "Preserved data block id must match DATA_BLOCK_ID");
    }
    if (result.has(id)) {
      fail("INVALID_DATA_BLOCK", "Preserved data block ids must be unique", { id });
    }
    result.set(id, canonicalizeJson(data));
  }
  return result;
}

function sortedData(data) {
  return new Map(
    [...data.entries()].sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function validateRendererResult(value) {
  if (value === null || typeof value !== "object") {
    fail("INVALID_RENDERER_RESULT", "renderArtifact must return a plain object");
  }

  let array;
  let descriptors;
  let keys;
  let prototype;
  try {
    array = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(value);
  } catch (cause) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Renderer result cannot be inspected safely",
      undefined,
      { cause },
    );
  }
  if (array) {
    fail("INVALID_RENDERER_RESULT", "renderArtifact must return a plain object");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_RENDERER_RESULT", "renderArtifact must return a plain object");
  }

  for (const key of keys) {
    const printableKey = typeof key === "symbol" ? key.toString() : String(key);
    if (typeof key !== "string" || !SLOT_SET.has(key)) {
      fail("INVALID_RENDERER_RESULT", "Renderer returned an unknown slot", {
        slot: printableKey,
      });
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      "get" in descriptor ||
      "set" in descriptor ||
      typeof descriptor.value !== "string"
    ) {
      fail("INVALID_RENDERER_RESULT", "Renderer slots must be enumerable strings", {
        slot: printableKey,
      });
    }
  }

  const slots = {};
  for (const slot of INTERACTIVE_SLOTS) {
    if (descriptors[slot] !== undefined) slots[slot] = descriptors[slot].value;
  }
  return slots;
}

export async function renderInteractiveModel(manifest, options = {}) {
  const internals = manifest?.[MANIFEST_INTERNAL];
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    manifest.contractVersion !== 1 ||
    manifest.mode !== "interactive" ||
    internals === null ||
    typeof internals !== "object"
  ) {
    fail("INVALID_MANIFEST", "Expected a loaded contract-version-1 manifest");
  }

  const data = internals.loadData();
  for (const [id, value] of canonicalPreservedData(options.preservedData)) {
    data.set(id, value);
  }
  const normalizedData = sortedData(data);
  const styles = internals.loadStyles();
  const scripts = internals.loadScripts();
  const svg = internals.loadSvg();

  let namespace;
  try {
    namespace = await internals.importRenderer();
  } catch (cause) {
    if (cause instanceof ArtifactBuildError) throw cause;
    fail(
      "INVALID_RENDERER_RESULT",
      "Unable to import renderer",
      undefined,
      { cause },
    );
  }
  if (typeof namespace.renderArtifact !== "function") {
    fail(
      "INVALID_RENDERER_RESULT",
      "Renderer must export a renderArtifact function",
    );
  }

  let rendered;
  try {
    rendered = await namespace.renderArtifact({
      data: rendererData(normalizedData),
      svg: rendererSvg(svg),
      metadata: deepFreeze({ ...manifest.metadata }),
    });
  } catch (cause) {
    fail(
      "INVALID_RENDERER_RESULT",
      "renderArtifact execution failed",
      undefined,
      { cause },
    );
  }

  return {
    metadata: { ...manifest.metadata },
    data: normalizedData,
    slots: validateRendererResult(rendered),
    styles,
    scripts,
    svg,
    requiredDataBlocks: [...manifest.requiredDataBlocks],
  };
}
