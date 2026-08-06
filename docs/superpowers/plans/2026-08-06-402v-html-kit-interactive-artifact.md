# 402v HTML Note Kit Interactive Artifact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing 402v HTML Note Kit into a backward-compatible dual-mode compiler that builds, updates, and verifies deterministic offline interactive artifacts from canonical JSON data and trusted local consumer entries.

**Architecture:** Keep Markdown note authoring as the default adapter and add an opt-in ESM manifest adapter. Both paths produce standalone documents through focused data, asset, rendering, verification, and atomic-I/O modules; interactive artifacts alone receive fixed extension slots, strict JSON blocks, a tiny data-access runtime, and inline consumer CSS/JS/SVG.

**Tech Stack:** Node.js ESM and standard library, React static rendering already used by note mode, Vitest, JSDOM, existing 402v CSS contract

---

## Requirement Coverage

| Requirement | Implemented and proven by |
| --- | --- |
| P0-1 mode and extension slots | Tasks 3, 4, 6, and note regression tests |
| P0-2 strict addressable JSON | Tasks 1, 5, 7, and fixture extraction tests |
| P0-3 inline local JS/CSS | Tasks 2, 4, 5, and startup verification |
| P0-4 consumer renderer/data views | Tasks 3, 4, and fixture renderer test |
| P0-5 safe local SVG | Tasks 2, 4, 8, and real-browser overflow checks |
| P0-6 build/update/verify API | Tasks 5, 6, 7, and failure-atomicity tests |

The plan adds no consumer schema, consumer interaction implementation beyond the generic fixture, server, external runtime, publisher change, or Orchestrator migration.

---

### Task 1: Canonical JSON data blocks and stable errors

**Files:**
- Create: `lib/html-note-kit/errors.mjs`
- Create: `lib/html-note-kit/data-blocks.mjs`
- Create: `tests/html-note-kit-data-blocks.test.ts`

- [ ] **Step 1: Write failing data-block contract tests**

```ts
import { describe, expect, it } from "vitest";

import {
  computeSourceHash,
  extractDataBlocks,
  serializeDataBlocks,
} from "../lib/html-note-kit/data-blocks.mjs";

describe("HTML Note Kit data blocks", () => {
  it("serializes keys canonically and safely embeds script-closing text", () => {
    const html = serializeDataBlocks(new Map([
      ["project-registry", { z: 2, a: { y: "</script>", x: 1 } }],
    ]));

    expect(html).toContain('type="application/json" id="project-registry"');
    expect(html).toContain('{\n  "a": {\n    "x": 1,\n    "y": "\\u003c/script\\u003e"');
    expect(html).not.toContain("</script>\n</script>");
    expect(extractDataBlocks(html).get("project-registry")).toEqual({
      a: { x: 1, y: "</script>" },
      z: 2,
    });
  });

  it("produces the same source hash for equivalent object key order", () => {
    const first = new Map([["registry", { b: 2, a: 1 }]]);
    const second = new Map([["registry", { a: 1, b: 2 }]]);
    expect(computeSourceHash(first)).toBe(computeSourceHash(second));
  });

  it("rejects invalid IDs, duplicate emitted IDs, malformed JSON, and non-JSON values", () => {
    expect(() => serializeDataBlocks(new Map([["bad id", {}]]))).toThrow(/INVALID_DATA_BLOCK/);
    expect(() => serializeDataBlocks(new Map([["registry", { count: Number.NaN }]]))).toThrow(/INVALID_DATA_BLOCK/);
    expect(() => extractDataBlocks(
      '<script type="application/json" id="registry">{}</script>' +
      '<script type="application/json" id="registry">{}</script>',
    )).toThrow(/duplicate/i);
    expect(() => extractDataBlocks(
      '<script type="application/json" id="registry">{broken}</script>',
    )).toThrow(/strict JSON/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-data-blocks.test.ts`

Expected: FAIL because `lib/html-note-kit/data-blocks.mjs` does not exist.

- [ ] **Step 3: Implement the stable error and canonical data-block API**

`errors.mjs` must export this complete public error shape:

```js
export class ArtifactBuildError extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(`${code}: ${message}`, options);
    this.name = "ArtifactBuildError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message.replace(`${this.code}: `, ""),
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}
```

`data-blocks.mjs` must expose exactly this public surface; the algorithms below define each implementation completely:

```js
export { DATA_BLOCK_ID, canonicalizeJson, stableJson, serializeDataBlocks, extractDataBlocks, computeSourceHash };
```

Implementation rules:

- `canonicalizeJson` recursively sorts object keys and preserves array order.
- It detects cycles with a `WeakSet` and rejects every value JSON cannot faithfully represent.
- `stableJson` uses two-space `JSON.stringify` and escapes `<`, `>`, `&`, U+2028, and U+2029.
- `serializeDataBlocks` sorts entries by ID and emits one exact script element per block.
- `extractDataBlocks` matches only `type="application/json"` script elements with an ID, rejects duplicates, and parses strict JSON.
- `computeSourceHash` hashes the stable sequence `id + "\0" + stableJson(value) + "\0"` with SHA-256 and returns `sha256:<hex>`.

- [ ] **Step 4: Run focused and existing tests and verify GREEN**

Run: `npm test -- tests/html-note-kit-data-blocks.test.ts tests/html-note-kit.test.ts`

Expected: 7 tests pass, including the original 4 Note Kit tests.

- [ ] **Step 5: Commit the canonical data layer**

```bash
git add lib/html-note-kit/errors.mjs lib/html-note-kit/data-blocks.mjs tests/html-note-kit-data-blocks.test.ts
git commit -m "feat: add canonical HTML artifact data blocks"
```

### Task 2: Trusted local CSS, JavaScript, and SVG entries

**Files:**
- Create: `lib/html-note-kit/assets.mjs`
- Create: `tests/html-note-kit-assets.test.ts`

- [ ] **Step 1: Write failing local-entry tests**

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadStylesheetEntry,
  loadScriptEntry,
  loadSvgAsset,
  resolveTrustedEntry,
} from "../lib/html-note-kit/assets.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "html-kit-assets-"));
  roots.push(root);
  mkdirSync(join(root, "entries"));
  return root;
}

describe("trusted local artifact entries", () => {
  it("loads valid CSS, classic JavaScript, and accessible SVG", () => {
    const root = fixture();
    writeFileSync(join(root, "entries/app.css"), ".card { color: #fff; }");
    writeFileSync(join(root, "entries/app.js"), "window.ready = true;");
    writeFileSync(join(root, "entries/map.svg"), '<svg viewBox="0 0 100 50"><path d="M0 0h100"/></svg>');

    expect(loadStylesheetEntry(root, "./entries/app.css").content).toContain(".card");
    expect(loadScriptEntry(root, "./entries/app.js").content).toContain("window.ready");
    const svg = loadSvgAsset(root, {
      id: "system-map",
      source: "./entries/map.svg",
      title: "System map",
      description: "Component relationships",
    });
    expect(svg.html).toContain('class="artifact-svg-frame"');
    expect(svg.html).toContain('role="img"');
    expect(svg.html).toContain("<title");
    expect(svg.html).toContain("<desc");
  });

  it("rejects path escape, imports, remote dependencies, and unsafe SVG", () => {
    const root = fixture();
    const outside = join(root, "..", "outside.js");
    writeFileSync(outside, "window.outside = true;");
    writeFileSync(join(root, "entries/import.js"), 'import "./other.js";');
    writeFileSync(join(root, "entries/remote.css"), '@import url("https://example.com/app.css");');
    writeFileSync(join(root, "entries/unsafe.svg"), '<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script></svg>');

    expect(() => resolveTrustedEntry(root, "../outside.js")).toThrow(/UNSAFE_ENTRY_PATH/);
    expect(() => loadScriptEntry(root, "./entries/import.js")).toThrow(/INVALID_JAVASCRIPT/);
    expect(() => loadStylesheetEntry(root, "./entries/remote.css")).toThrow(/INVALID_STYLESHEET/);
    expect(() => loadSvgAsset(root, { id: "unsafe", source: "./entries/unsafe.svg" })).toThrow(/UNSAFE_SVG/);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-assets.test.ts`

Expected: FAIL because `lib/html-note-kit/assets.mjs` does not exist.

- [ ] **Step 3: Implement bounded local entry handling**

Expose exactly this public surface; the required behavior below defines each implementation completely:

```js
export { resolveTrustedEntry, loadStylesheetEntry, loadScriptEntry, loadSvgAsset };
```

Required behavior:

- Resolve root and source through `realpathSync`; missing files produce a stable asset-specific error.
- Accept the root itself or descendants using `relative(root, candidate)`; reject `..`, absolute relative results, symlinks escaping root, directories, NUL bytes, and URLs.
- Return manifest-relative POSIX labels rather than absolute paths.
- Parse JavaScript with `new vm.Script(content)`. Reject static imports, `import(...)`, `sourceMappingURL`, and HTML-closing `</script` text.
- Reject CSS `@import`, `https:`, `http:`, protocol-relative URLs, and non-data/non-fragment `url(...)` values.
- Require SVG root and `viewBox`; reject doctype/entity declarations, `script`, `foreignObject`, `iframe`, `object`, `embed`, `audio`, `video`, event attributes, external `href`/`xlink:href`, and non-fragment `url(...)`.
- Escape manifest-provided SVG title/description as text, assign deterministic IDs derived from the asset ID, add `role="img"` and `aria-labelledby`, then wrap the SVG in `<div class="artifact-svg-frame" data-svg-id="...">`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/html-note-kit-assets.test.ts tests/html-note-kit-data-blocks.test.ts`

Expected: 6 tests pass.

- [ ] **Step 5: Commit trusted asset support**

```bash
git add lib/html-note-kit/assets.mjs tests/html-note-kit-assets.test.ts
git commit -m "feat: inline trusted HTML artifact entries"
```

### Task 3: Versioned manifest and consumer renderer contract

**Files:**
- Create: `lib/html-note-kit/manifest.mjs`
- Create: `lib/html-note-kit/interactive.mjs`
- Create: `tests/html-note-kit-manifest.test.ts`

- [ ] **Step 1: Write failing manifest and renderer tests**

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadArtifactManifest } from "../lib/html-note-kit/manifest.mjs";
import { renderInteractiveModel } from "../lib/html-note-kit/interactive.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("interactive artifact manifest", () => {
  it("loads canonical data and renders only stable slots", async () => {
    const root = mkdtempSync(join(tmpdir(), "html-kit-manifest-"));
    roots.push(root);
    writeFileSync(join(root, "data.json"), '{"projects":[{"name":"Atlas"}]}');
    writeFileSync(join(root, "renderer.mjs"), `
      export function renderArtifact({ data }) {
        return { mainSections: '<section>' + data['project-registry'].projects[0].name + '</section>' };
      }
    `);
    writeFileSync(join(root, "artifact.mjs"), `
      export default {
        contractVersion: 1,
        mode: "interactive",
        metadata: { title: "Project Index", description: "", eyebrow: "402v", lang: "en" },
        dataBlocks: [{ id: "project-registry", source: "./data.json" }],
        renderer: "./renderer.mjs",
        styles: [], scripts: [], svgAssets: [], requiredDataBlocks: ["project-registry"]
      };
    `);

    const manifest = await loadArtifactManifest(join(root, "artifact.mjs"));
    const model = await renderInteractiveModel(manifest);
    expect([...model.data.keys()]).toEqual(["project-registry"]);
    expect(model.slots.mainSections).toContain("Atlas");
    expect(Object.keys(model.slots)).toEqual(["mainSections"]);
  });

  it("rejects unsupported versions and unknown renderer slots", async () => {
    const root = mkdtempSync(join(tmpdir(), "html-kit-manifest-"));
    roots.push(root);
    writeFileSync(join(root, "bad-version.mjs"), 'export default { contractVersion: 2, mode: "interactive" };');
    await expect(loadArtifactManifest(join(root, "bad-version.mjs"))).rejects.toThrow(/INVALID_MANIFEST/);

    writeFileSync(join(root, "renderer.mjs"), 'export function renderArtifact() { return { sidebar: "bad" }; }');
    writeFileSync(join(root, "bad-slot.mjs"), `export default {
      contractVersion: 1, mode: "interactive",
      metadata: { title: "Bad", description: "", eyebrow: "", lang: "en" },
      dataBlocks: [], renderer: "./renderer.mjs", styles: [], scripts: [], svgAssets: [], requiredDataBlocks: []
    };`);
    const manifest = await loadArtifactManifest(join(root, "bad-slot.mjs"));
    await expect(renderInteractiveModel(manifest)).rejects.toThrow(/INVALID_RENDERER_RESULT/);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-manifest.test.ts`

Expected: FAIL because the manifest and interactive modules do not exist.

- [ ] **Step 3: Implement manifest loading and model rendering**

`manifest.mjs` must export `loadArtifactManifest`:

```js
export { loadArtifactManifest };
```

It validates contract version 1, exact mode `interactive`, metadata strings, arrays, unique data/SVG IDs, renderer path, and required block membership. It resolves `rootDirectory` from the manifest directory, loads data sources through strict UTF-8 plus `JSON.parse`, and returns normalized absolute paths internally with stable relative labels for output.

`interactive.mjs` must expose this exact public surface:

```js
export const INTERACTIVE_SLOTS = Object.freeze([
  "navigation",
  "heroSupplementary",
  "mainSections",
  "rail",
  "footer",
]);
export { renderInteractiveModel };
```

`renderInteractiveModel` starts with manifest data and then overlays `options.preservedData`, so preserved values win while the union of IDs remains. It loads validated entries/assets, deep-clones and deep-freezes renderer inputs, imports the renderer by content-hashed file URL, calls `renderArtifact`, rejects unknown/non-string slots, and returns `{ metadata, data, slots, styles, scripts, svg, requiredDataBlocks }`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- tests/html-note-kit-manifest.test.ts tests/html-note-kit-assets.test.ts tests/html-note-kit-data-blocks.test.ts`

Expected: 8 tests pass.

- [ ] **Step 5: Commit the consumer contract**

```bash
git add lib/html-note-kit/manifest.mjs lib/html-note-kit/interactive.mjs tests/html-note-kit-manifest.test.ts
git commit -m "feat: add interactive artifact manifest contract"
```

### Task 4: Shared 402v document shell and interactive browser runtime

**Files:**
- Create: `lib/html-note-kit/runtime.mjs`
- Create: `lib/html-note-kit/document.mjs`
- Modify: `lib/html-note-kit/template.mjs`
- Create: `tests/html-note-kit-document.test.ts`

- [ ] **Step 1: Write failing document assembly tests**

```ts
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { renderInteractiveDocument } from "../lib/html-note-kit/document.mjs";

describe("interactive 402v document", () => {
  it("assembles fixed slots, canonical data, and a working data runtime", () => {
    const html = renderInteractiveDocument({
      metadata: { title: "Project Index", description: "Projects", eyebrow: "402v", lang: "en" },
      data: new Map([["registry", { projects: [{ name: "Atlas" }] }]]),
      slots: {
        navigation: '<nav id="artifact-navigation">Navigation</nav>',
        heroSupplementary: '<div id="hero-extra">Hero</div>',
        mainSections: '<section id="main-extra">Main</section>',
        rail: '<section id="rail-extra">Rail</section>',
        footer: '<span id="footer-extra">Footer</span>',
      },
      styles: [{ label: "artifact.css", content: ".project-card { display:block; }" }],
      scripts: [{ label: "artifact.js", content: 'window.runtimeData = window.__402vArtifact.getData("registry");' }],
      svg: new Map(),
      requiredDataBlocks: ["registry"],
    });

    const dom = new JSDOM(html, { runScripts: "dangerously" });
    expect(dom.window.document.querySelector("#artifact-navigation")).not.toBeNull();
    expect(dom.window.document.querySelector("#hero-extra")).not.toBeNull();
    expect(dom.window.document.querySelector("#main-extra")).not.toBeNull();
    expect(dom.window.document.querySelector("#rail-extra")).not.toBeNull();
    expect(dom.window.document.querySelector("#footer-extra")).not.toBeNull();
    expect((dom.window as unknown as { runtimeData: unknown }).runtimeData).toEqual({ projects: [{ name: "Atlas" }] });
    expect(html).toContain('name="402v-artifact-mode" content="interactive"');
    expect(html).toContain('name="402v-source-hash" content="sha256:');
    expect(html).toContain("overflow-x: clip");
    expect(html).toContain(".artifact-svg-frame");
  });

  it("keeps note mode free of the interactive runtime", async () => {
    const { renderHtmlDocument } = await import("../lib/html-note-kit/template.mjs");
    const html = renderHtmlDocument({
      metadata: { title: "Lean note", description: "", eyebrow: "402v", lang: "en" },
      articleHtml: "<h1>Lean note</h1>",
      headings: [],
    });
    expect(html).not.toContain("__402vArtifact");
    expect(html).not.toContain('type="application/json"');
    expect(html).toContain('class="note-article"');
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-document.test.ts`

Expected: FAIL because `document.mjs` and `runtime.mjs` do not exist.

- [ ] **Step 3: Implement the runtime and shared document assembly**

`runtime.mjs` exports `renderInteractiveRuntime()` and emits one self-contained script that:

```js
(function () {
  "use strict";
  const root = document.querySelector("[data-artifact-root]");
  const ids = Object.freeze(Array.from(document.querySelectorAll('script[type="application/json"][id]')).map((node) => node.id));
  const api = Object.freeze({
    root,
    dataIds: () => ids.slice(),
    getData(id) {
      if (!ids.includes(id)) throw new Error(`Unknown artifact data block: ${id}`);
      return JSON.parse(document.getElementById(id).textContent);
    },
  });
  Object.defineProperty(window, "__402vArtifact", { value: api, configurable: false, writable: false });
})();
```

`document.mjs` exports `renderInteractiveDocument(model)`. It reuses extracted 402v token/style helpers from `template.mjs`, inserts every fixed slot at the location defined in the design, sorts inline style/script entries by stable label, emits JSON blocks before runtime/client scripts, and adds the artifact mode/source-hash metadata.

Refactor `template.mjs` only enough to share base CSS/shell helpers. Preserve the original note markup, classes, strings, and no-script behavior so the existing snapshot-like assertions continue to pass.

- [ ] **Step 4: Run document and note regressions and verify GREEN**

Run: `npm test -- tests/html-note-kit-document.test.ts tests/html-note-kit.test.ts`

Expected: 6 tests pass.

- [ ] **Step 5: Commit document assembly**

```bash
git add lib/html-note-kit/runtime.mjs lib/html-note-kit/document.mjs lib/html-note-kit/template.mjs tests/html-note-kit-document.test.ts
git commit -m "feat: assemble interactive 402v HTML artifacts"
```

### Task 5: Verification, deterministic build, atomic I/O, and public API

**Files:**
- Create: `lib/html-note-kit/verify.mjs`
- Create: `lib/html-note-kit/io.mjs`
- Create: `lib/html-note-kit/index.mjs`
- Create: `tests/html-note-kit-build-api.test.ts`

- [ ] **Step 1: Write failing build API and failure-atomicity tests**

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildInteractiveArtifact,
  verifyArtifact,
} from "../lib/html-note-kit/index.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(rendererBody = 'return { mainSections: "<section>Ready</section>" };') {
  const root = mkdtempSync(join(tmpdir(), "html-kit-api-"));
  roots.push(root);
  writeFileSync(join(root, "data.json"), '{"ready":true}');
  writeFileSync(join(root, "renderer.mjs"), `export function renderArtifact() { ${rendererBody} }`);
  writeFileSync(join(root, "artifact.mjs"), `export default {
    contractVersion: 1, mode: "interactive",
    metadata: { title: "API fixture", description: "", eyebrow: "402v", lang: "en" },
    dataBlocks: [{ id: "registry", source: "./data.json" }], renderer: "./renderer.mjs",
    styles: [], scripts: [], svgAssets: [], requiredDataBlocks: ["registry"]
  };`);
  return root;
}

describe("interactive artifact build API", () => {
  it("builds, verifies, hashes, and reports deterministic standalone HTML", async () => {
    const root = project();
    const output = join(root, "artifact.html");
    const result = await buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"), outputPath: output, force: true, verifyDeterminism: true,
    });
    expect(result).toMatchObject({ ok: true, mode: "interactive", output, dataBlockIds: ["registry"] });
    expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifyArtifact({ path: output, requiredDataBlocks: ["registry"] })).toMatchObject({ ok: true });
  });

  it("leaves an existing destination unchanged when rendering fails", async () => {
    const root = project('throw new Error("renderer exploded");');
    const output = join(root, "artifact.html");
    writeFileSync(output, "KEEP-EXISTING");
    await expect(buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"), outputPath: output, force: true,
    })).rejects.toThrow(/renderer exploded/);
    expect(readFileSync(output, "utf8")).toBe("KEEP-EXISTING");
  });

  it("rejects non-deterministic renderer output", async () => {
    const root = project('return { mainSections: `<section>${Math.random()}</section>` };');
    await expect(buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"), outputPath: join(root, "artifact.html"), force: true, verifyDeterminism: true,
    })).rejects.toThrow(/NON_DETERMINISTIC_BUILD/);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-build-api.test.ts`

Expected: FAIL because the public API does not exist.

- [ ] **Step 3: Implement verification and transactional build**

`verify.mjs` exposes:

```js
export { verifyArtifactHtml, verifyArtifactFile, verifyArtifactStartup };
```

It returns `{ ok: true, mode, sourceHash, dataBlockIds, issues: [] }` or throws `ARTIFACT_VERIFICATION_FAILED` with structured issue objects. It checks every condition in the design, including exact embedded source hash, no external runtime/resource, required blocks, interactive runtime presence, SVG contract, and responsive overflow guards. `verifyArtifactStartup(html)` creates an isolated `JSDOM` with `runScripts: "dangerously"`, no resource loader, a captured virtual console, and an error listener; any uncaught synchronous runtime or consumer-entry error fails the build before writing.

`io.mjs` exposes:

```js
export { readUtf8File, atomicWriteUtf8 };
```

Use `TextDecoder("utf-8", { fatal: true })` for reads. Use `openSync` with exclusive creation for a same-directory temporary file, `writeFileSync`, `fsyncSync`, `closeSync`, `renameSync`, and `unlinkSync` cleanup in `finally`.

`index.mjs` exports the design contract. `buildInteractiveArtifact` loads/render/assembles twice when `verifyDeterminism` is true, verifies before write, enforces `force`, writes atomically, and returns source/output SHA-256 metadata. Also export the existing note builder through `buildNote(options)` by moving the current build body from the CLI without changing its behavior.

- [ ] **Step 4: Run build API and regression tests and verify GREEN**

Run: `npm test -- tests/html-note-kit-build-api.test.ts tests/html-note-kit-document.test.ts tests/html-note-kit.test.ts`

Expected: 9 tests pass.

- [ ] **Step 5: Commit the public build API**

```bash
git add lib/html-note-kit/verify.mjs lib/html-note-kit/io.mjs lib/html-note-kit/index.mjs tests/html-note-kit-build-api.test.ts
git commit -m "feat: add verified atomic HTML artifact builds"
```

### Task 6: Additive machine-readable CLI commands

**Files:**
- Modify: `scripts/html-note-kit.mjs`
- Create: `tests/html-note-kit-cli-v2.test.ts`

- [ ] **Step 1: Write failing CLI tests**

```ts
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const cli = join(process.cwd(), "scripts", "html-note-kit.mjs");

describe("HTML Note Kit v2 CLI", () => {
  it("builds and verifies an interactive manifest with JSON results", () => {
    const root = mkdtempSync(join(tmpdir(), "html-kit-cli-v2-"));
    try {
      writeFileSync(join(root, "data.json"), '{"items":["one"]}');
      writeFileSync(join(root, "renderer.mjs"), 'export function renderArtifact(){ return { mainSections: "<section>one</section>" }; }');
      writeFileSync(join(root, "artifact.mjs"), `export default {
        contractVersion: 1, mode: "interactive",
        metadata: { title: "CLI fixture", description: "", eyebrow: "402v", lang: "en" },
        dataBlocks: [{ id: "registry", source: "./data.json" }], renderer: "./renderer.mjs",
        styles: [], scripts: [], svgAssets: [], requiredDataBlocks: ["registry"]
      };`);
      const output = join(root, "artifact.html");
      const built = spawnSync(process.execPath, [cli, "build-artifact", join(root, "artifact.mjs"), "--output", output], { encoding: "utf8" });
      expect(built.status).toBe(0);
      expect(JSON.parse(built.stdout)).toMatchObject({ ok: true, command: "build-artifact", mode: "interactive" });

      const verified = spawnSync(process.execPath, [cli, "verify", output, "--required-block", "registry"], { encoding: "utf8" });
      expect(verified.status).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({ ok: true, command: "verify" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-cli-v2.test.ts`

Expected: FAIL with unknown command `build-artifact`.

- [ ] **Step 3: Refactor the CLI into an async wrapper over the public API**

Keep existing `init` behavior and flags. Route `build` through `buildNote`. Add:

```text
build-artifact <manifest.mjs> [--output <output.html>] [--preserve-data-from <artifact.html>] [--force]
verify <artifact.html> [--required-block <block-id>]...
```

Add a repeated-flag parser for `--required-block`. Success output is one JSON object. For new commands, catch `ArtifactBuildError` and write `JSON.stringify(error.toJSON(), null, 2)` to stderr with exit code 1. Preserve the old plain error text for `init` and Markdown `build` failures. Task 7 adds `update-data` only after its backing API exists.

- [ ] **Step 4: Run CLI and old-command regressions and verify GREEN**

Run: `npm test -- tests/html-note-kit-cli-v2.test.ts tests/html-note-kit.test.ts`

Expected: 5 tests pass.

- [ ] **Step 5: Commit the additive CLI**

```bash
git add scripts/html-note-kit.mjs tests/html-note-kit-cli-v2.test.ts
git commit -m "feat: add interactive HTML artifact CLI"
```

### Task 7: Preserve canonical data and update one named block

**Files:**
- Modify: `lib/html-note-kit/index.mjs`
- Modify: `scripts/html-note-kit.mjs`
- Create: `tests/html-note-kit-update.test.ts`

- [ ] **Step 1: Write failing preservation and update tests**

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildInteractiveArtifact,
  extractDataBlocks,
  updateArtifactData,
} from "../lib/html-note-kit/index.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "html-kit-update-"));
  roots.push(root);
  writeFileSync(join(root, "registry.json"), '{"version":1,"items":["alpha"]}');
  writeFileSync(join(root, "settings.json"), '{"theme":"dark"}');
  writeFileSync(join(root, "renderer.mjs"), `export function renderArtifact({data}) {
    return { mainSections: '<section>' + data.registry.items.join(',') + '</section>' };
  }`);
  writeFileSync(join(root, "artifact.mjs"), `export default {
    contractVersion: 1, mode: "interactive",
    metadata: { title: "Update fixture", description: "", eyebrow: "402v", lang: "en" },
    dataBlocks: [{ id: "registry", source: "./registry.json" }, { id: "settings", source: "./settings.json" }],
    renderer: "./renderer.mjs", styles: [], scripts: [], svgAssets: [], requiredDataBlocks: ["registry"]
  };`);
  return root;
}

describe("canonical artifact updates", () => {
  it("preserves existing data across a visual-shell rebuild", async () => {
    const root = fixture();
    const output = join(root, "artifact.html");
    await buildInteractiveArtifact({ manifestPath: join(root, "artifact.mjs"), outputPath: output, force: true });
    await updateArtifactData({ manifestPath: join(root, "artifact.mjs"), artifactPath: output, id: "registry", value: { version: 2, items: ["beta"] } });

    writeFileSync(join(root, "renderer.mjs"), `export function renderArtifact({data}) {
      return { mainSections: '<section class="new-shell">' + data.registry.items.join(',') + '</section>' };
    }`);
    writeFileSync(join(root, "registry.json"), '{"version":999,"items":["stale"]}');
    await buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"), outputPath: output, preserveDataFrom: output, force: true,
    });

    const html = readFileSync(output, "utf8");
    const blocks = extractDataBlocks(html);
    expect(blocks.get("registry")).toEqual({ version: 2, items: ["beta"] });
    expect(blocks.get("settings")).toEqual({ theme: "dark" });
    expect(html).toContain('class="new-shell"');
    expect(html).toContain("beta");
    expect(html).not.toContain("stale");
  });

  it("rejects missing IDs and keeps the old bytes after failed update", async () => {
    const root = fixture();
    const output = join(root, "artifact.html");
    await buildInteractiveArtifact({ manifestPath: join(root, "artifact.mjs"), outputPath: output, force: true });
    const before = readFileSync(output);
    await expect(updateArtifactData({
      manifestPath: join(root, "artifact.mjs"), artifactPath: output, id: "missing", value: {},
    })).rejects.toThrow(/MISSING_DATA_BLOCK/);
    expect(readFileSync(output)).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- tests/html-note-kit-update.test.ts`

Expected: FAIL because `updateArtifactData` and `preserveDataFrom` are not implemented.

- [ ] **Step 3: Implement preservation and named update**

`buildInteractiveArtifact` reads `preserveDataFrom` through strict UTF-8, verifies/extracts its data blocks, and passes the complete map as `preservedData` so existing values override manifest sources and existing extra IDs remain.

Implement:

```js
export async function updateArtifactData({
  artifactPath,
  manifestPath,
  id,
  value,
  outputPath = artifactPath,
  force = true,
  verifyDeterminism = true,
}) {}
```

It validates ID/value, extracts all existing blocks, requires the ID, replaces only that value, rebuilds with the full preserved map, verifies twice, and atomically writes. Wire CLI `update-data` to strict JSON input and this API.

- [ ] **Step 4: Run update, CLI, and regression tests and verify GREEN**

Run: `npm test -- tests/html-note-kit-update.test.ts tests/html-note-kit-cli-v2.test.ts tests/html-note-kit.test.ts`

Expected: 7 tests pass.

- [ ] **Step 5: Commit transactional data updates**

```bash
git add lib/html-note-kit/index.mjs scripts/html-note-kit.mjs tests/html-note-kit-update.test.ts
git commit -m "feat: preserve and update artifact data blocks"
```

### Task 8: Generic interactive fixture, browser behavior, and documentation

**Files:**
- Create: `fixtures/html-note-kit-interactive/artifact.mjs`
- Create: `fixtures/html-note-kit-interactive/data/projects.json`
- Create: `fixtures/html-note-kit-interactive/renderer.mjs`
- Create: `fixtures/html-note-kit-interactive/artifact.css`
- Create: `fixtures/html-note-kit-interactive/artifact.js`
- Create: `fixtures/html-note-kit-interactive/system-map.svg`
- Create: `tests/html-note-kit-interactive-fixture.test.ts`
- Modify: `docs/project/html-note-kit.md`

- [ ] **Step 1: Write the failing fixture integration test**

```ts
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { buildInteractiveArtifact, extractDataBlocks } from "../lib/html-note-kit/index.mjs";

const fixture = join(process.cwd(), "fixtures", "html-note-kit-interactive");
const output = join(fixture, "artifact.generated.html");
afterEach(() => rmSync(output, { force: true }));

describe("generic interactive artifact fixture", () => {
  it("builds deterministically and performs a real offline filter", async () => {
    const options = { manifestPath: join(fixture, "artifact.mjs"), outputPath: output, force: true, verifyDeterminism: true };
    const first = await buildInteractiveArtifact(options);
    const firstBytes = readFileSync(output);
    const second = await buildInteractiveArtifact(options);
    expect(readFileSync(output)).toEqual(firstBytes);
    expect(second.outputHash).toBe(first.outputHash);

    const html = firstBytes.toString("utf8");
    const blocks = extractDataBlocks(html);
    expect((blocks.get("project-registry") as { projects: unknown[] }).projects).toHaveLength(3);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet/i);
    expect(html).toContain('class="artifact-svg-frame"');

    const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://artifact.local/" });
    const input = dom.window.document.querySelector<HTMLInputElement>("#project-search");
    if (!input) throw new Error("missing project search input");
    input.value = "memory";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    const visible = [...dom.window.document.querySelectorAll<HTMLElement>("[data-project-card]")]
      .filter((node) => !node.hidden)
      .map((node) => node.dataset.projectName);
    expect(visible).toEqual(["Memory Loom"]);
    expect(dom.window.document.querySelector("#visible-count")?.textContent).toBe("1");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/html-note-kit-interactive-fixture.test.ts`

Expected: FAIL because the fixture does not exist.

- [ ] **Step 3: Create the generic fixture**

The data file contains exactly three generic projects: `Agent Atlas`, `Memory Loom`, and `Local Observer`, with category and description fields. The renderer emits:

- a navigation link to `#projects`;
- a hero summary with total count;
- a main `#projects` section with `#project-search`, `#visible-count`, and one `[data-project-card]` article per project;
- a rail panel containing the prepared `system-map` SVG;
- a short fixture footer.

The client script reads `project-registry` only through `window.__402vArtifact.getData`, handles `input`, updates each card's `hidden` property, and updates `#visible-count`. It contains no duplicated project array.

The CSS styles controls/cards within 402v tokens, applies `min-width: 0`, `max-width: 100%`, and grid collapse below 640 px. The SVG has a `viewBox` and enough internal width to prove container-only scrolling, while containing no external reference.

- [ ] **Step 4: Expand the Kit documentation**

Document:

- unchanged note quick start;
- manifest fields and renderer slots;
- `build-artifact`, `verify`, `--preserve-data-from`, and `update-data` commands;
- programmatic API imports from `lib/html-note-kit/index.mjs`;
- trusted-local security boundary;
- canonical data/source-hash and deterministic/atomic guarantees;
- offline, CSS/JS/SVG restrictions;
- the fixture path and its purpose;
- the explicit non-goal that Kit does not implement consumer schemas or interactions.

- [ ] **Step 5: Run fixture and complete automated quality gates**

Run:

```bash
npm test -- tests/html-note-kit-interactive-fixture.test.ts
npm test -- tests/html-note-kit-data-blocks.test.ts tests/html-note-kit-assets.test.ts tests/html-note-kit-manifest.test.ts tests/html-note-kit-document.test.ts tests/html-note-kit-build-api.test.ts tests/html-note-kit-cli-v2.test.ts tests/html-note-kit-update.test.ts tests/html-note-kit-interactive-fixture.test.ts tests/html-note-kit.test.ts tests/publish-html-cli.test.ts
npm test
npm run typecheck
npm run lint
git diff --check
```

Expected: all commands exit 0; all original Note Kit tests pass; the new interactive suites pass; the complete repository test suite, typecheck, and lint pass without new warnings attributable to this change.

- [ ] **Step 6: Run real browser acceptance from the file URL**

Build the fixture, open `file://<absolute-fixture-path>/artifact.generated.html` with the browser automation skill, and evaluate at desktop and 390 px:

```js
({
  pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  svgScrollIsContained: (() => {
    const frame = document.querySelector(".artifact-svg-frame");
    return Boolean(frame && frame.scrollWidth >= frame.clientWidth);
  })(),
  dataIds: window.__402vArtifact.dataIds(),
})
```

Expected at both widths: `pageFits` is true, `svgScrollIsContained` is true, and `dataIds` contains `project-registry`. Type `memory` into the search field and verify only `Memory Loom` remains visible with count `1`.

- [ ] **Step 7: Commit fixture and documentation**

```bash
git add fixtures/html-note-kit-interactive tests/html-note-kit-interactive-fixture.test.ts docs/project/html-note-kit.md
git commit -m "docs: ship interactive HTML artifact fixture"
```

### Task 9: Final independent review and Socrates handoff inputs

**Files:**
- Verify: all files changed since `3471aa3`
- Produce later outside this repository: `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/docs/socrates/2026-08-06-402v-html-kit-interactive-artifact-response.md`

- [ ] **Step 1: Run an independent spec-compliance review**

Give the reviewer the complete design requirements and the diff from `3471aa3`. Require an explicit P0-1 through P0-6 matrix, non-goal check, acceptance check, and list of missing or extra behavior. Fix every reported compliance gap and re-review until approved.

- [ ] **Step 2: Run an independent code-quality review**

Give a fresh reviewer the approved spec-compliant diff and test evidence. Require prioritized findings for correctness, security boundaries, deterministic behavior, atomicity, API clarity, compatibility, and maintainability. Fix every critical/important issue and re-review until approved.

- [ ] **Step 3: Run the final producer verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
git diff --check main...HEAD
git status --short --branch
git log --oneline main..HEAD
```

Expected: all quality commands exit 0; worktree is clean; the branch contains only the approved design and implementation commits.

- [ ] **Step 4: Prepare the handoff evidence**

Record exact commit SHAs, test counts, CLI/API names, fixture/browser results, P0 coverage, backward-compatibility evidence, and the unchanged responsibility boundary. The final response to Socrates must state that Orchestrator migration remains unmodified and unauthorized in this work.
