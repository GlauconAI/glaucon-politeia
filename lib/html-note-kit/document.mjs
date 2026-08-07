import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { parse as parseHtmlDocument } from "parse5";

import {
  canonicalizeJson,
  computeSourceHash,
  serializeDataBlocks,
} from "./data-blocks.mjs";
import { ArtifactBuildError } from "./errors.mjs";
import { ARTIFACT_RESOURCE_LIMITS } from "./resource-limits.mjs";
import { renderInteractiveRuntime } from "./runtime.mjs";
import {
  escapeHtml,
  render402vBaseStyles,
  render402vShell,
  slugify,
} from "./template.mjs";

const MODEL_KEYS = Object.freeze([
  "metadata",
  "data",
  "slots",
  "styles",
  "scripts",
  "svg",
  "requiredDataBlocks",
]);
const METADATA_KEYS = Object.freeze([
  "title",
  "description",
  "eyebrow",
  "lang",
]);
const SLOT_KEYS = Object.freeze([
  "navigation",
  "heroSupplementary",
  "mainSections",
  "rail",
  "footer",
]);
const SLOT_PARENT_ELEMENTS = Object.freeze({
  navigation: "div",
  heroSupplementary: "header",
  mainSections: "main",
  rail: "aside",
  footer: "footer",
});
const ENTRY_KEYS = Object.freeze(["label", "content"]);
const SVG_KEYS = Object.freeze(["id", "label", "html"]);
const SLOT_BOUNDARY_ATTRIBUTE = "data-402v-boundary";

function fail(code, message, details = undefined, options = undefined) {
  throw new ArtifactBuildError(code, message, details, options);
}

function printableKey(key) {
  return typeof key === "symbol" ? key.toString() : String(key);
}

function inspectPlainObject(value, name, allowedKeys, requiredKeys) {
  if (value === null || typeof value !== "object") {
    fail("INVALID_RENDERER_RESULT", `${name} must be a plain object`);
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
      `${name} cannot be inspected safely`,
      undefined,
      { cause },
    );
  }

  if (
    array ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    fail("INVALID_RENDERER_RESULT", `${name} must be a plain object`);
  }

  const allowed = new Set(allowedKeys);
  const values = Object.create(null);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) {
      fail("INVALID_RENDERER_RESULT", `${name} contains an unknown property`, {
        property: printableKey(key),
      });
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      fail(
        "INVALID_RENDERER_RESULT",
        `${name} must contain only enumerable data properties`,
        { property: key },
      );
    }
    values[key] = descriptor.value;
  }

  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      fail("INVALID_RENDERER_RESULT", `${name} is missing a required property`, {
        property: key,
      });
    }
  }
  return values;
}

function inspectArray(value, name) {
  if (value === null || typeof value !== "object") {
    fail("INVALID_RENDERER_RESULT", `${name} must be an array`);
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
      `${name} cannot be inspected safely`,
      undefined,
      { cause },
    );
  }

  if (!array || prototype !== Array.prototype) {
    fail("INVALID_RENDERER_RESULT", `${name} must be an array`);
  }
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    fail("INVALID_RENDERER_RESULT", `${name} has an invalid length`);
  }

  const allowed = new Set(["length"]);
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowed.add(key);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      "get" in descriptor ||
      "set" in descriptor
    ) {
      fail(
        "INVALID_RENDERER_RESULT",
        `${name} must contain only enumerable data elements`,
        { index },
      );
    }
    result.push(descriptor.value);
  }
  const extra = keys.find((key) => !allowed.has(key));
  if (extra !== undefined) {
    fail("INVALID_RENDERER_RESULT", `${name} contains an extra property`, {
      property: printableKey(extra),
    });
  }
  return result;
}

function normalizeMetadata(value) {
  const metadata = inspectPlainObject(
    value,
    "Interactive document metadata",
    METADATA_KEYS,
    METADATA_KEYS,
  );
  for (const key of METADATA_KEYS) {
    if (typeof metadata[key] !== "string") {
      fail("INVALID_RENDERER_RESULT", "Document metadata values must be strings", {
        property: key,
      });
    }
  }
  return metadata;
}

function attributeValue(element, name) {
  const attribute = element.attrs?.find((entry) => entry.name === name);
  return attribute?.value;
}

function inspectSlotContent(nodes, dataIds) {
  const pending = [...nodes].reverse();
  while (pending.length > 0) {
    const node = pending.pop();
    if (typeof node?.tagName !== "string") continue;

    const element = node;
    if (element.tagName.toLowerCase() === "script") {
      return { hasScript: true };
    }
    const id = attributeValue(element, "id");
    if (id !== undefined && dataIds.has(id)) return { collidingDataId: id };

    let children = element.childNodes ?? [];
    if (
      element.namespaceURI === "http://www.w3.org/1999/xhtml" &&
      element.tagName === "template"
    ) {
      const content = element.content;
      if (content?.nodeName === "#document-fragment") {
        children = content.childNodes ?? [];
      }
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
  return {};
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validationBoundaries(slots) {
  const allHtml = SLOT_KEYS.map((slot) => slots[slot]).join("\0");
  const usedTokens = new Set();
  const nextToken = (seed) => {
    let token = sha256(seed);
    while (allHtml.includes(token) || usedTokens.has(token)) {
      token = sha256(token);
    }
    usedTokens.add(token);
    return token;
  };
  const root = `${nextToken(`root\0${allHtml}`)}-root`;
  const slotsByKey = Object.create(null);
  for (const slot of SLOT_KEYS) {
    const token = nextToken(`${slot}\0${slots[slot]}`);
    slotsByKey[slot] = {
      wrapper: `${token}-wrapper`,
      before: `${token}-before`,
      after: `${token}-after`,
    };
  }
  return { root, slots: slotsByKey };
}

function isHtmlElement(element, tagName) {
  return (
    element?.namespaceURI === "http://www.w3.org/1999/xhtml" &&
    element.tagName === tagName
  );
}

function hasOnlyBoundaryAttribute(element, value) {
  return (
    element.attrs?.length === 1 &&
    element.attrs[0].name === SLOT_BOUNDARY_ATTRIBUTE &&
    element.attrs[0].value === value
  );
}

function inspectSlotElements(slots, dataIds) {
  try {
    const boundaries = validationBoundaries(slots);
    const wrappersSource = SLOT_KEYS.map((slot) => {
      const boundary = boundaries.slots[slot];
      const parentElement = SLOT_PARENT_ELEMENTS[slot];
      return `<${parentElement} ${SLOT_BOUNDARY_ATTRIBUTE}="${boundary.wrapper}"><span ${SLOT_BOUNDARY_ATTRIBUTE}="${boundary.before}"></span>${slots[slot]}<span ${SLOT_BOUNDARY_ATTRIBUTE}="${boundary.after}"></span></${parentElement}>`;
    }).join("");
    const document = parseHtmlDocument(
      `<!doctype html><html><head></head><body><div ${SLOT_BOUNDARY_ATTRIBUTE}="${boundaries.root}">${wrappersSource}</div></body></html>`,
    );
    const documentChildren = document.childNodes ?? [];
    const [doctype, html] = documentChildren;
    const htmlChildren = html?.childNodes ?? [];
    const [head, body] = htmlChildren;
    const bodyChildren = body?.childNodes ?? [];
    const [root] = bodyChildren;
    const wrappers = root?.childNodes ?? [];
    if (
      documentChildren.length !== 2 ||
      doctype?.nodeName !== "#documentType" ||
      doctype.name !== "html" ||
      doctype.publicId !== "" ||
      doctype.systemId !== "" ||
      !isHtmlElement(html, "html") ||
      html.attrs?.length !== 0 ||
      htmlChildren.length !== 2 ||
      !isHtmlElement(head, "head") ||
      head.attrs?.length !== 0 ||
      head.childNodes?.length !== 0 ||
      !isHtmlElement(body, "body") ||
      body.attrs?.length !== 0 ||
      bodyChildren.length !== 1 ||
      !isHtmlElement(root, "div") ||
      !hasOnlyBoundaryAttribute(root, boundaries.root) ||
      wrappers.length !== SLOT_KEYS.length ||
      doctype.parentNode !== document ||
      html.parentNode !== document ||
      head.parentNode !== html ||
      body.parentNode !== html ||
      root.parentNode !== body
    ) {
      return { invalidStructure: true };
    }

    for (let index = 0; index < SLOT_KEYS.length; index += 1) {
      const slot = SLOT_KEYS[index];
      const boundary = boundaries.slots[slot];
      const wrapper = wrappers[index];
      const children = wrapper?.childNodes ?? [];
      const before = children[0];
      const after = children.at(-1);
      if (
        !isHtmlElement(wrapper, SLOT_PARENT_ELEMENTS[slot]) ||
        !hasOnlyBoundaryAttribute(wrapper, boundary.wrapper) ||
        wrapper.parentNode !== root ||
        children.length < 2 ||
        !isHtmlElement(before, "span") ||
        !hasOnlyBoundaryAttribute(before, boundary.before) ||
        before.childNodes?.length !== 0 ||
        before.parentNode !== wrapper ||
        !isHtmlElement(after, "span") ||
        !hasOnlyBoundaryAttribute(after, boundary.after) ||
        after.childNodes?.length !== 0 ||
        after.parentNode !== wrapper
      ) {
        return { invalidStructure: true, slot };
      }

      const inspected = inspectSlotContent(children.slice(1, -1), dataIds);
      if (inspected.hasScript || inspected.collidingDataId !== undefined) {
        return { ...inspected, slot };
      }
    }
    return {};
  } catch (cause) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Renderer slot HTML cannot be inspected safely",
      undefined,
      { cause },
    );
  }
}

function normalizeSlots(value, dataIds) {
  const slots = inspectPlainObject(
    value,
    "Interactive document slots",
    SLOT_KEYS,
    [],
  );
  const result = Object.create(null);
  let aggregateBytes = 0;
  for (const key of SLOT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(slots, key)) {
      result[key] = "";
      continue;
    }
    if (typeof slots[key] !== "string") {
      fail("INVALID_RENDERER_RESULT", "Document slots must be strings", {
        slot: key,
      });
    }
    const byteLength = Buffer.byteLength(slots[key], "utf8");
    if (byteLength > ARTIFACT_RESOURCE_LIMITS.slotBytes) {
      fail(
        "INVALID_RENDERER_RESULT",
        "Renderer slot exceeds the UTF-8 byte limit",
        {
          slot: key,
          maximumBytes: ARTIFACT_RESOURCE_LIMITS.slotBytes,
          actualBytes: byteLength,
        },
      );
    }
    aggregateBytes += byteLength;
    if (aggregateBytes > ARTIFACT_RESOURCE_LIMITS.slotAggregateBytes) {
      fail(
        "INVALID_RENDERER_RESULT",
        "Renderer slots exceed the aggregate UTF-8 byte limit",
        {
          maximumBytes: ARTIFACT_RESOURCE_LIMITS.slotAggregateBytes,
          actualBytes: aggregateBytes,
        },
      );
    }
    result[key] = slots[key];
  }

  const inspected = inspectSlotElements(result, dataIds);
  if (inspected.invalidStructure) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Renderer slot HTML escapes or swallows its fixed parent context",
      { slot: inspected.slot },
    );
  }
  if (inspected.hasScript) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Renderer slots must not contain script elements",
      { slot: inspected.slot },
    );
  }
  if (inspected.collidingDataId !== undefined) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Renderer slot id collides with a canonical data block id",
      { slot: inspected.slot, id: inspected.collidingDataId },
    );
  }
  return result;
}

function normalizeEntries(value, name) {
  return inspectArray(value, name)
    .map((entry, index) => {
      const inspected = inspectPlainObject(
        entry,
        `${name} entry`,
        ENTRY_KEYS,
        ENTRY_KEYS,
      );
      for (const key of ENTRY_KEYS) {
        if (typeof inspected[key] !== "string") {
          fail("INVALID_RENDERER_RESULT", `${name} entries must contain strings`, {
            index,
            property: key,
          });
        }
      }
      return { label: inspected.label, content: inspected.content };
    })
    .sort((left, right) =>
      left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
    );
}

function normalizeData(value) {
  if (value === null || typeof value !== "object") {
    fail("INVALID_RENDERER_RESULT", "Interactive document data must be a Map");
  }
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch (cause) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Interactive document data cannot be inspected safely",
      undefined,
      { cause },
    );
  }
  if (prototype !== Map.prototype) {
    fail("INVALID_RENDERER_RESULT", "Interactive document data must be a Map");
  }

  let entries;
  try {
    entries = [...Map.prototype.entries.call(value)];
  } catch (cause) {
    fail(
      "INVALID_RENDERER_RESULT",
      "Interactive document data cannot be read safely",
      undefined,
      { cause },
    );
  }

  const snapshot = new Map();
  for (const [id, data] of entries) {
    try {
      snapshot.set(id, canonicalizeJson(data));
    } catch (cause) {
      if (cause instanceof ArtifactBuildError) throw cause;
      fail(
        "INVALID_RENDERER_RESULT",
        "Interactive document data cannot be canonicalized safely",
        undefined,
        { cause },
      );
    }
  }
  return snapshot;
}

function validateSvg(value) {
  if (value !== null && typeof value === "object") {
    let prototype;
    try {
      prototype = Object.getPrototypeOf(value);
    } catch (cause) {
      fail(
        "INVALID_RENDERER_RESULT",
        "Interactive document SVG assets cannot be inspected safely",
        undefined,
        { cause },
      );
    }
    if (prototype === Map.prototype) {
      try {
        for (const ignored of Map.prototype.entries.call(value)) void ignored;
        return;
      } catch (cause) {
        fail(
          "INVALID_RENDERER_RESULT",
          "Interactive document SVG assets cannot be read safely",
          undefined,
          { cause },
        );
      }
    }
  }

  for (const [index, asset] of inspectArray(
    value,
    "Interactive document SVG assets",
  ).entries()) {
    const inspected = inspectPlainObject(
      asset,
      "Interactive document SVG asset",
      SVG_KEYS,
      SVG_KEYS,
    );
    for (const key of SVG_KEYS) {
      if (typeof inspected[key] !== "string") {
        fail(
          "INVALID_RENDERER_RESULT",
          "Interactive document SVG assets must contain strings",
          { index, property: key },
        );
      }
    }
  }
}

function normalizeRequiredData(value, data) {
  const ids = inspectArray(value, "Required data blocks");
  const seen = new Set();
  for (const [index, id] of ids.entries()) {
    if (typeof id !== "string") {
      fail("INVALID_RENDERER_RESULT", "Required data block ids must be strings", {
        index,
      });
    }
    if (seen.has(id)) {
      fail("INVALID_RENDERER_RESULT", "Required data block ids must be unique", {
        id,
      });
    }
    seen.add(id);
    if (!data.has(id)) {
      fail("MISSING_DATA_BLOCK", "Required data block is missing", { id });
    }
  }
  return ids;
}

function normalizeModel(value) {
  const inspected = inspectPlainObject(
    value,
    "Interactive document model",
    MODEL_KEYS,
    MODEL_KEYS,
  );
  const data = normalizeData(inspected.data);
  const result = {
    metadata: normalizeMetadata(inspected.metadata),
    data,
    slots: normalizeSlots(inspected.slots, new Set(data.keys())),
    styles: normalizeEntries(inspected.styles, "Interactive document styles"),
    scripts: normalizeEntries(inspected.scripts, "Interactive document scripts"),
  };
  validateSvg(inspected.svg);
  normalizeRequiredData(inspected.requiredDataBlocks, data);
  return result;
}

function renderStyleEntries(entries) {
  return entries
    .map(
      ({ label, content }) =>
        `  <style data-artifact-style="${escapeHtml(label)}">\n${content}\n  </style>`,
    )
    .join("\n");
}

function renderScriptEntries(entries) {
  return entries
    .map(
      ({ label, content }) =>
        `<script data-artifact-script="${escapeHtml(label)}">\n${content}\n</script>`,
    )
    .join("\n");
}

const INTERACTIVE_STYLES = `    html,
    body {
      max-width: 100%;
      overflow-x: clip;
    }
    [data-artifact-root],
    .artifact-topbar-inner,
    .artifact-shell,
    .artifact-layout,
    .artifact-main-panel,
    .artifact-rail {
      min-width: 0;
      max-width: 100%;
    }
    .artifact-topbar-inner {
      grid-template-columns: auto minmax(0, 1fr) minmax(0, auto) auto;
    }
    .artifact-navigation-slot {
      min-width: 0;
      max-width: 100%;
    }
    .artifact-navigation-slot:empty { display: none; }
    .artifact-topbar-status { grid-column: 4; }
    .artifact-svg-frame {
      max-width: 100%;
      overflow-x: auto;
    }
    .artifact-svg-frame > .artifact-svg {
      display: block;
      height: auto;
    }
    @media (max-width: 640px) {
      .artifact-topbar-inner {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .artifact-navigation-slot { grid-column: 1 / -1; }
    }`;

export function renderInteractiveDocument(model) {
  const normalized = normalizeModel(model);
  const { metadata, slots, styles, scripts, data } = normalized;
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const eyebrow = escapeHtml(metadata.eyebrow);
  const lang = escapeHtml(metadata.lang);
  const slug = escapeHtml(slugify(metadata.title));
  let dataBlocks;
  let sourceHash;
  try {
    dataBlocks = serializeDataBlocks(data);
    sourceHash = computeSourceHash(data);
  } catch (cause) {
    if (cause instanceof ArtifactBuildError) throw cause;
    fail(
      "INVALID_RENDERER_RESULT",
      "Interactive document data cannot be serialized safely",
      undefined,
      { cause },
    );
  }
  const styleEntries = renderStyleEntries(styles);
  const scriptEntries = renderScriptEntries(scripts);

  return render402vShell({
    lang,
    head: `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="generator" content="402v HTML Note Kit">
  <meta name="402v-artifact-mode" content="interactive">
  <meta name="402v-source-hash" content="${sourceHash}">
  <title>${title}</title>
  <style>
${render402vBaseStyles()}
${INTERACTIVE_STYLES}
  </style>
${styleEntries}`,
    body: `  <div data-artifact-root>
    <header class="artifact-topbar">
      <div class="artifact-topbar-inner">
        <a class="artifact-brand" href="https://402v.com">402v</a>
        <span class="artifact-path">~/sites/${slug}</span>
        <div class="artifact-navigation-slot">${slots.navigation}</div>
        <span class="artifact-topbar-status">artifact: standalone</span>
      </div>
    </header>
    <div class="artifact-shell">
      <header class="artifact-hero">
        <p class="note-eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        ${description ? `<p class="note-description">&gt; ${description}</p>` : ""}
        <div class="artifact-status" aria-label="Artifact status">
          <span>status: ready</span>
          <span>target: 402v</span>
          <span>runtime: offline</span>
        </div>
        ${slots.heroSupplementary}
      </header>
      <div class="artifact-layout">
        <main class="artifact-main-panel">
          ${slots.mainSections}
          <footer class="note-footer">${slots.footer}402v HTML Note Kit · standalone HTML</footer>
        </main>
        <aside class="artifact-rail" aria-label="Artifact information">
          ${slots.rail}
          <section class="artifact-rail-panel artifact-meta">
            <h2>Artifact</h2>
            <dl>
              <div><dt>format</dt><dd>HTML</dd></div>
              <div><dt>layout</dt><dd>402v / interactive</dd></div>
              <div><dt>delivery</dt><dd>local · 402v</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  </div>
${dataBlocks}
<script data-402v-runtime>
${renderInteractiveRuntime()}
</script>
${scriptEntries}`,
  });
}
