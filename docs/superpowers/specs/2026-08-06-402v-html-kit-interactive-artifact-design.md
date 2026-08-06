# 402v HTML Note Kit Interactive Artifact Design

## Goal

Extend the existing 402v HTML Note Kit into one backward-compatible standalone artifact compiler with two authoring modes:

- `note`: the existing Markdown-to-HTML workflow, kept lean and compatible;
- `interactive`: an opt-in manifest-driven workflow for offline, data-backed, client-interactive HTML artifacts.

The Kit owns generic compilation, shell, inlining, data-block, verification, and atomic-write primitives. Consumers own their schemas, renderers, interactions, and domain transactions. Openclaw Orchestrator is the first advanced consumer, not a special case in the Kit.

## Frozen Decisions

- Interactive renderer, JavaScript, and CSS entries are trusted local consumer code.
- Entry paths must resolve beneath an explicit consumer root directory.
- Untrusted third-party plugin sandboxing is outside this version.
- The final artifact is one UTF-8 HTML file with no required server or external runtime.
- JSON data blocks are the only machine-readable data declarations. Rendered views may display those values, but scripts and templates must not contain a second hand-maintained data constant.
- Existing `init` and `build <input.md>` commands remain valid and preserve note-mode behavior.
- No Orchestrator schema, search logic, projection compiler, transaction, or publishing behavior enters this repository.

## Approaches Considered

### 1. Add interactive options directly to the current template

This minimizes the initial diff, but the current template already combines tokens, layout, note-specific markup, and document assembly. Adding data, scripts, renderers, and update behavior there would create an implicit extension contract and make note compatibility difficult to prove.

### 2. Add a manifest compiler beside the Markdown adapter — selected

The existing Markdown path becomes one adapter into a shared document compiler. A new ESM manifest adapter supplies metadata, named data blocks, trusted-local renderer and assets, and fixed extension slots. Both modes reuse document assembly, verification, and atomic output.

This provides explicit contracts without a parallel scaffold. It also lets consumers test renderers independently and lets the Kit remain schema-agnostic.

### 3. Introduce a bundler and general plugin runtime

A bundler would support module graphs and richer component systems, while a plugin host could isolate third-party code. Both add dependency, versioning, security, and debugging costs that are unnecessary for the first trusted internal consumer. This remains a separate future project if untrusted extensions become a real requirement.

## Architecture

The compiler has five focused layers:

1. **Input adapters**
   - note adapter parses Markdown/frontmatter and produces note slots;
   - interactive adapter loads and validates a local ESM manifest.
2. **Canonical data**
   - validates data-block IDs and JSON values;
   - serializes objects with recursively sorted keys while preserving array order;
   - extracts emitted blocks without ambiguity and calculates a source hash.
3. **Trusted-local rendering and assets**
   - loads one renderer module and calls it with immutable data and prepared SVG assets;
   - validates its fixed slot result;
   - reads and validates local CSS, JavaScript, and SVG entries beneath the consumer root.
4. **Document assembly**
   - applies the existing 402v shell and responsive tokens;
   - inserts fixed extension slots, JSON blocks, interactive runtime, and inline entries in deterministic order;
   - adds no interactive runtime to note mode.
5. **Verification and transactional output**
   - verifies the complete in-memory HTML before writing;
   - optionally renders twice and compares bytes for determinism;
   - writes a same-directory temporary file, flushes it, then atomically renames it;
   - removes temporary files after any failure.

## Module Boundaries

### `lib/html-note-kit/data-blocks.mjs`

Owns data-block ID validation, canonical JSON serialization, safe `</script>` escaping, extraction, duplicate detection, and source hashing.

Public behavior:

```js
serializeDataBlocks(blocks)
extractDataBlocks(html)
computeSourceHash(blocks)
```

IDs use the bounded pattern `[A-Za-z][A-Za-z0-9_.:-]{0,127}`. Object keys are sorted recursively; arrays retain their semantic order. Non-JSON values such as `undefined`, functions, symbols, BigInt, non-finite numbers, and cycles fail before rendering.

The emitted form is exact and addressable:

```html
<script type="application/json" id="consumer-defined-id">
{ "strict": "json" }
</script>
```

`<`, `>`, `&`, U+2028, and U+2029 are escaped in JSON strings so data cannot terminate the script element. Extraction reverses those JSON escapes through `JSON.parse`; it rejects malformed JSON and duplicate IDs.

### `lib/html-note-kit/assets.mjs`

Owns trusted-local path resolution and inline entry validation.

- All declared paths must remain beneath `rootDirectory` after real-path resolution.
- JavaScript entries are classic browser scripts. Static/dynamic imports and source-map URLs are rejected. Syntax is checked with Node's VM parser.
- CSS entries reject `@import`, remote URLs, and local unresolved `url(...)` dependencies. Data URLs and fragment URLs are allowed.
- SVG entries reject doctypes/entities, scripts, foreign objects, embedded HTML, event-handler attributes, external references, and non-fragment links. Each SVG must have a `viewBox` and receives deterministic accessible `title`/`desc` IDs when supplied by the manifest.
- Every complex SVG is wrapped in a named `.artifact-svg-frame` container that owns horizontal scrolling. The page shell maintains `max-width: 100%` and `overflow-x: clip` at document level.

No general-purpose sanitizer is promised. This is a strict allow-bounded local asset compiler for trusted consumer repositories.

### `lib/html-note-kit/manifest.mjs`

Loads and validates one local ESM manifest. The manifest version is explicit so later additions can be backward compatible.

```js
export default {
  contractVersion: 1,
  mode: "interactive",
  rootDirectory: ".",
  metadata: {
    title: "Project Index",
    description: "A standalone interactive artifact.",
    eyebrow: "402v System",
    lang: "en",
  },
  dataBlocks: [
    { id: "project-registry", source: "./data/projects.json" },
  ],
  renderer: "./renderer.mjs",
  styles: ["./artifact.css"],
  scripts: ["./artifact.js"],
  svgAssets: [
    {
      id: "system-map",
      source: "./system-map.svg",
      title: "System map",
      description: "Relationships between the system components.",
    },
  ],
  requiredDataBlocks: ["project-registry"],
};
```

`rootDirectory` defaults to the manifest directory. Relative entries resolve against it. The CLI does not accept remote manifests or URL entries.

### `lib/html-note-kit/interactive.mjs`

Builds the interactive document model. It imports the renderer with a cache-busting file URL based on file content, passes deep-frozen copies of data and SVG assets, and requires this contract:

```js
export function renderArtifact({ data, svg, metadata }) {
  return {
    navigation: "<nav>...</nav>",
    heroSupplementary: "<section>...</section>",
    mainSections: "<section>...</section>",
    rail: "<section>...</section>",
    footer: "<p>...</p>",
  };
}
```

Every property is optional, but unknown slot names and non-string values fail. The renderer receives no Kit-specific domain helpers and can be unit-tested as a normal ESM module. It may derive visible HTML from canonical data, but it does not return another data declaration.

The five slot names are stable for contract version 1:

- `navigation`: inside the top bar after the artifact path;
- `heroSupplementary`: inside the hero after status metadata;
- `mainSections`: primary content panel;
- `rail`: additional information-rail content;
- `footer`: footer content before the Kit signature.

### `lib/html-note-kit/runtime.mjs`

Returns a small inline bootstrap string only for interactive mode. It exposes a frozen browser API:

```js
window.__402vArtifact = Object.freeze({
  getData(id),
  dataIds(),
  root,
});
```

`getData(id)` reads and parses the named script element on demand. The runtime never embeds a copied JavaScript data constant. Consumer scripts execute after the runtime and data blocks, and may use this API for search, filtering, counts, deep links, or other consumer-owned behavior.

### `lib/html-note-kit/document.mjs`

Assembles both modes from a common document model. Existing 402v tokens and note classes remain. Interactive-only styles and slots are additive. Output contains no build timestamp, absolute path, random identifier, or machine-specific value.

The current `template.mjs` remains the note-compatible adapter during migration and delegates common assembly to this module. This limits regression risk and avoids an unrelated visual rewrite.

### `lib/html-note-kit/verify.mjs`

Provides pure verification over bytes/text plus file-level UTF-8 validation.

Checks include:

- doctype, title, viewport, generator metadata, and recognized artifact mode;
- strict UTF-8 decoding;
- required named data blocks, unique IDs, strict JSON, and embedded source-hash match;
- no external script source, stylesheet, font, iframe runtime, remote image, or import;
- no unresolved local asset reference;
- interactive runtime and entry syntax;
- SVG safety, accessibility metadata, `viewBox`, and scroll container;
- responsive shell guards for page-level horizontal overflow;
- byte equality when a deterministic comparison is requested.

Verification returns structured issues. Build/update throw an `ArtifactBuildError` with a stable `code`, `message`, and optional `details` when required checks fail.

### `lib/html-note-kit/io.mjs`

Owns strict UTF-8 reads and atomic writes. It never truncates the destination before verification. Temporary files are created in the destination directory, written, flushed, closed, and renamed. Cleanup runs in `finally`.

### `lib/html-note-kit/index.mjs`

Exports the supported programmatic contract:

```js
buildNote(options)
buildInteractiveArtifact(options)
updateArtifactData(options)
verifyArtifact(options)
extractDataBlocks(html)
```

All build/update calls resolve to structured metadata:

```js
{
  ok: true,
  mode: "interactive",
  output: "/absolute/path/artifact.html",
  title: "Project Index",
  bytes: 48123,
  sourceHash: "sha256:...",
  outputHash: "sha256:...",
  dataBlockIds: ["project-registry"],
}
```

## CLI Contract

Existing commands remain unchanged:

```text
html-note-kit init <directory> --title <title> [--force]
html-note-kit build <input.md> [--output <output.html>] [--force]
```

New commands are additive:

```text
html-note-kit build-artifact <manifest.mjs> [--output <output.html>] [--preserve-data-from <artifact.html>] [--force]
html-note-kit update-data <artifact.html> --manifest <manifest.mjs> --id <block-id> --input <data.json> [--output <output.html>] [--force]
html-note-kit verify <artifact.html> [--required-block <block-id>]...
```

Commands print one JSON object to stdout on success. New commands print one structured error object to stderr on failure. The library API is the primary machine contract; CLI flags are a stable convenience wrapper.

## Data and Update Flow

### Initial build

1. Load and validate the manifest.
2. Read manifest data sources with strict UTF-8 and strict JSON parsing.
3. Prepare immutable canonical data and source hash.
4. Validate/inject SVG assets and load CSS/JS entries.
5. Invoke the renderer from canonical data.
6. Assemble HTML in memory in stable order.
7. Verify the artifact and render a second time to prove deterministic bytes.
8. Atomically replace the output only after both passes succeed.

### Rebuild while preserving data

`build-artifact --preserve-data-from old.html` extracts every existing named data block. Existing block values override manifest source values for matching IDs, and existing IDs absent from the new manifest remain present. This makes visual-shell rebuilds non-destructive to canonical embedded data.

### Named update

`update-data` extracts all blocks from the current artifact, requires the target ID to exist, strictly parses the replacement JSON, replaces only that value, and rebuilds through the supplied manifest. It verifies in temporary state and atomically replaces the selected output. Any parse, render, asset, determinism, or verification failure leaves the prior artifact byte-for-byte unchanged.

## Error Handling

Stable error codes cover:

- `INVALID_MANIFEST`
- `UNSAFE_ENTRY_PATH`
- `INVALID_DATA_BLOCK`
- `MISSING_DATA_BLOCK`
- `INVALID_RENDERER_RESULT`
- `INVALID_JAVASCRIPT`
- `INVALID_STYLESHEET`
- `UNSAFE_SVG`
- `NON_DETERMINISTIC_BUILD`
- `ARTIFACT_VERIFICATION_FAILED`
- `ATOMIC_WRITE_FAILED`

Errors retain their original cause internally without printing stack traces or file contents by default. CLI failures exit non-zero. Existing note-mode human-readable errors remain compatible.

## Backward Compatibility

- `npm run html:note -- init ...` is unchanged.
- `npm run html:note -- build note.md ...` remains the note default.
- Existing frontmatter keys and Markdown features remain supported.
- Existing note HTML keeps its visual shell and contains no interactive runtime, JSON block, or consumer script.
- The publisher receives the same complete standalone HTML contract and needs no change.
- No current public API is removed; newly extracted internals are exported only through `index.mjs`.

## Testing Strategy

### Existing regression

The current four Note Kit tests must remain green without expectation weakening. Publisher tests remain green because standalone output and publishing are unchanged.

### Focused unit tests

- canonical JSON ordering and hostile script-closing strings;
- duplicate/invalid IDs and malformed JSON extraction;
- source hash stability;
- root-bound path resolution and missing files;
- JavaScript syntax/import rejection;
- CSS import/remote dependency rejection;
- SVG safety, accessibility, `viewBox`, and external-reference rejection;
- manifest validation and renderer slot validation;
- verifier issue codes and UTF-8 rejection;
- atomic write cleanup and unchanged destination on failure.

### Interactive fixture integration

One generic fixture contains a project list data block, consumer renderer, inline CSS, inline JavaScript search/filter, and accessible local SVG. Tests prove:

- output is a single offline HTML file;
- the JSON block extracts and strictly parses;
- rendered cards derive from that block;
- the real client filter changes visible results in JSDOM;
- no external runtime or required resource remains;
- two builds from identical inputs are byte-identical;
- `--preserve-data-from` keeps canonical data after shell changes;
- `update-data` changes only the requested block and preserves all others;
- forced build/update failure leaves the destination unchanged;
- note mode remains script-free and configuration-free.

### Browser acceptance

Open the fixture directly from disk in a real browser at desktop width and approximately 390 px. Assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, while the complex SVG frame may have its own horizontal scroll. Exercise search/filter and deep-link-safe navigation without a local server or network.

## Delivery

The completed Kit upgrade includes:

- generic compiler modules and additive CLI commands;
- a reusable interactive fixture;
- unit, integration, regression, determinism, and failure-atomicity tests;
- updated Kit documentation with note and interactive examples;
- a Socrates handoff describing P0-1 through P0-6, stable consumer APIs, evidence, and the unchanged Orchestrator responsibility boundary.

No Orchestrator page is modified, migrated, published, or deployed by this work.
