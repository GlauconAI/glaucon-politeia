import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";
import { renderInteractiveModel } from "../lib/html-note-kit/interactive.mjs";
import { loadArtifactManifest } from "../lib/html-note-kit/manifest.mjs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "html-kit-manifest-"));
  roots.push(root);
  return root;
}

function writeManifest(root: string, body: string, name = "artifact.mjs") {
  const path = join(root, name);
  writeFileSync(path, `export default ${body};`);
  return path;
}

function validManifest(overrides = "") {
  return `{
    contractVersion: 1,
    mode: "interactive",
    metadata: { title: "Project Index", description: "Offline", eyebrow: "402v", lang: "en" },
    dataBlocks: [{ id: "project-registry", source: "./data.json" }],
    renderer: "./renderer.mjs",
    styles: [],
    scripts: [],
    svgAssets: [],
    requiredDataBlocks: ["project-registry"]
    ${overrides}
  }`;
}

async function expectArtifactError(
  run: () => Promise<unknown>,
  code: string,
) {
  try {
    await run();
    throw new Error(`Expected a ${code} error`);
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactBuildError);
    expect(error).toMatchObject({ code, name: "ArtifactBuildError" });
    expect((error as Error).message).toMatch(new RegExp(`^${code}: `));
    expect(() => JSON.stringify((error as ArtifactBuildError).toJSON())).not.toThrow();
  }
}

describe("interactive artifact manifest", () => {
  it("loads canonical data, validated assets, and only the five stable renderer slots", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), '{"z":2,"projects":[{"name":"Atlas"}]}');
    writeFileSync(join(root, "artifact.css"), ".card { color: white; }");
    writeFileSync(join(root, "artifact.js"), "window.ready = true;");
    writeFileSync(
      join(root, "map.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Existing map</title><path d="M0 0h10"/></svg>',
    );
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact({ data, svg, metadata }) {
        return {
          navigation: "<nav>" + metadata.eyebrow + "</nav>",
          heroSupplementary: "<p>hero</p>",
          mainSections: "<section>" + data["project-registry"].projects[0].name + "</section>",
          rail: svg["system-map"].html,
          footer: "<p>footer</p>"
        };
      }`,
    );
    const manifestPath = writeManifest(
      root,
      `{
        contractVersion: 1,
        mode: "interactive",
        metadata: { title: "Project Index", description: "Offline", eyebrow: "402v", lang: "en" },
        dataBlocks: [{ id: "project-registry", source: "./data.json" }],
        renderer: "./renderer.mjs",
        styles: ["./artifact.css"],
        scripts: ["./artifact.js"],
        svgAssets: [{ id: "system-map", source: "./map.svg", title: "System map", description: "Relationships" }],
        requiredDataBlocks: ["project-registry"]
      }`,
    );

    const manifest = await loadArtifactManifest(manifestPath);
    const model = await renderInteractiveModel(manifest);

    expect([...model.data.keys()]).toEqual(["project-registry"]);
    expect(model.data.get("project-registry")).toEqual({
      projects: [{ name: "Atlas" }],
      z: 2,
    });
    expect(Object.keys(model.slots)).toEqual([
      "navigation",
      "heroSupplementary",
      "mainSections",
      "rail",
      "footer",
    ]);
    expect(model.slots.mainSections).toContain("Atlas");
    expect(model.styles).toEqual([{ label: "artifact.css", content: ".card { color: white; }" }]);
    expect(model.scripts).toEqual([{ label: "artifact.js", content: "window.ready = true;" }]);
    expect(model.svg[0]).toMatchObject({ id: "system-map", label: "map.svg" });
    expect(model.requiredDataBlocks).toEqual(["project-registry"]);
  });

  it("overlays preserved canonical data with preserved values winning and the union retained", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), '{"value":"manifest"}');
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact({ data }) {
        return { mainSections: data["project-registry"].value + ":" + data["preserved-only"].count };
      }`,
    );
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));

    const model = await renderInteractiveModel(manifest, {
      preservedData: new Map([
        ["project-registry", { value: "preserved" }],
        ["preserved-only", { count: 3 }],
      ]),
    });

    expect([...model.data.keys()]).toEqual(["preserved-only", "project-registry"]);
    expect(model.data.get("project-registry")).toEqual({ value: "preserved" });
    expect(model.slots.mainSections).toBe("preserved:3");
  });

  it("passes deep-cloned, deeply frozen renderer inputs", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), '{"nested":{"items":[1]}}');
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact({ data, svg, metadata }) {
        const frozen = [data, data["project-registry"], data["project-registry"].nested,
          data["project-registry"].nested.items, svg, metadata].every(Object.isFrozen);
        let blocked = false;
        try { data["project-registry"].nested.items.push(2); } catch { blocked = true; }
        return { mainSections: String(frozen && blocked) };
      }`,
    );
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));

    const model = await renderInteractiveModel(manifest);

    expect(model.slots.mainSections).toBe("true");
    expect(model.data.get("project-registry")).toEqual({ nested: { items: [1] } });
  });

  it("cache-busts renderer imports from the current content hash", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    const rendererPath = join(root, "renderer.mjs");
    writeFileSync(rendererPath, 'export function renderArtifact() { return { mainSections: "first" }; }');
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));
    expect((await renderInteractiveModel(manifest)).slots.mainSections).toBe("first");

    writeFileSync(rendererPath, 'export function renderArtifact() { return { mainSections: "second" }; }');

    expect((await renderInteractiveModel(manifest)).slots.mainSections).toBe("second");
  });

  it("executes the exact validated renderer bytes from a content-addressed data URL", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact() { return { mainSections: import.meta.url }; }`,
    );
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));

    const model = await renderInteractiveModel(manifest);

    expect(model.slots.mainSections).toMatch(/^data:text\/javascript;base64,/);
    expect(model.slots.mainSections).toMatch(/#sha256=[a-f0-9]{64}$/);
  });

  it("rejects manifest and renderer dependency graphs as unsupported P0 inputs", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(
      join(root, "manifest-values.mjs"),
      'export const title = "Imported title";',
    );
    writeFileSync(
      join(root, "renderer-helper.mjs"),
      'export const section = "Imported renderer";',
    );
    writeFileSync(
      join(root, "renderer.mjs"),
      'import { section } from "./renderer-helper.mjs"; export function renderArtifact() { return { mainSections: section }; }',
    );
    const path = join(root, "artifact.mjs");
    writeFileSync(
      path,
      `import { title } from "./manifest-values.mjs";
       export default {
         contractVersion: 1, mode: "interactive",
         metadata: { title, description: "", eyebrow: "", lang: "en" },
         dataBlocks: [{ id: "project-registry", source: "./data.json" }],
         renderer: "./renderer.mjs", styles: [], scripts: [], svgAssets: [],
         requiredDataBlocks: ["project-registry"]
       };`,
    );

    await expectArtifactError(() => loadArtifactManifest(path), "INVALID_MANIFEST");

    writeFileSync(
      path,
      `export default {
        contractVersion: 1, mode: "interactive",
        metadata: { title: "Single file", description: "", eyebrow: "", lang: "en" },
        dataBlocks: [{ id: "project-registry", source: "./data.json" }],
        renderer: "./renderer.mjs", styles: [], scripts: [], svgAssets: [],
        requiredDataBlocks: ["project-registry"]
      };`,
    );
    const manifest = await loadArtifactManifest(path);
    await expectArtifactError(
      () => renderInteractiveModel(manifest),
      "INVALID_RENDERER_RESULT",
    );
  });

  it("revalidates the renderer path when the entry becomes an escaping symlink", async () => {
    const root = fixture();
    const consumer = join(root, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "data.json"), "{}");
    const rendererPath = join(consumer, "renderer.mjs");
    writeFileSync(rendererPath, 'export function renderArtifact() { return { mainSections: "inside" }; }');
    const markerPath = join(root, "outside-executed.txt");
    writeFileSync(
      join(root, "outside.mjs"),
      `import { writeFileSync } from "node:fs";
       writeFileSync(${JSON.stringify(markerPath)}, "executed");
       export function renderArtifact() { return { mainSections: "outside" }; }`,
    );
    const manifest = await loadArtifactManifest(
      writeManifest(root, validManifest(', rootDirectory: "./consumer"')),
    );
    unlinkSync(rendererPath);
    symlinkSync(join(root, "outside.mjs"), rendererPath);

    await expectArtifactError(
      () => renderInteractiveModel(manifest),
      "INVALID_RENDERER_RESULT",
    );
    expect(existsSync(markerPath)).toBe(false);
  });

  it("rejects a renderer that changes while its content-hashed module is importing", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    const rendererPath = join(root, "renderer.mjs");
    const validatedMarker = join(root, "validated-renderer-executed.txt");
    const replacementMarker = join(root, "replacement-renderer-executed.txt");
    writeFileSync(
      rendererPath,
      `const { writeFileSync } = process.getBuiltinModule("node:fs");
       writeFileSync(${JSON.stringify(validatedMarker)}, "validated");
       writeFileSync(${JSON.stringify(rendererPath)}, 'const { writeFileSync } = process.getBuiltinModule("node:fs"); writeFileSync(${JSON.stringify(replacementMarker)}, "replacement"); export function renderArtifact() { return { mainSections: "changed" }; }');
       export function renderArtifact() { return { mainSections: "original" }; }`,
    );
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));

    try {
      await renderInteractiveModel(manifest);
      throw new Error("Expected renderer import mismatch");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_RENDERER_RESULT" });
      expect((error as Error).message).toMatch(/changed while importing/i);
    }
    expect(existsSync(validatedMarker)).toBe(true);
    expect(existsSync(replacementMarker)).toBe(false);
  });

  it("pins root identity across sequential rename and symlink substitution", async () => {
    const root = fixture();
    const consumer = join(root, "consumer");
    const original = join(root, "consumer-original");
    const outside = join(root, "outside-root");
    mkdirSync(consumer);
    mkdirSync(outside);
    writeFileSync(join(consumer, "data.json"), "{}");
    writeFileSync(join(consumer, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const markerPath = join(root, "root-substitution-executed.txt");
    writeFileSync(join(outside, "data.json"), "{}");
    writeFileSync(
      join(outside, "renderer.mjs"),
      `const { writeFileSync } = process.getBuiltinModule("node:fs");
       writeFileSync(${JSON.stringify(markerPath)}, "executed");
       export function renderArtifact() { return {}; }`,
    );
    const manifest = await loadArtifactManifest(
      writeManifest(root, validManifest(', rootDirectory: "./consumer"')),
    );
    renameSync(consumer, original);
    symlinkSync(outside, consumer);

    await expectArtifactError(
      () => renderInteractiveModel(manifest),
      "INVALID_RENDERER_RESULT",
    );
    expect(existsSync(markerPath)).toBe(false);
  });

  it("rejects unsupported versions, modes, unknown keys, malformed shapes, and duplicate IDs", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const invalidBodies = [
      validManifest(', extra: true'),
      validManifest().replace('contractVersion: 1', 'contractVersion: 2'),
      validManifest().replace('mode: "interactive"', 'mode: "note"'),
      validManifest().replace('lang: "en"', 'lang: 1'),
      validManifest().replace('styles: []', 'styles: "./style.css"'),
      validManifest().replace(
        'dataBlocks: [{ id: "project-registry", source: "./data.json" }]',
        'dataBlocks: [{ id: "project-registry", source: "./data.json" }, { id: "project-registry", source: "./data.json" }]',
      ),
      validManifest().replace(
        'svgAssets: []',
        'svgAssets: [{ id: "map", source: "./one.svg" }, { id: "map", source: "./two.svg" }]',
      ),
      validManifest().replace(
        'requiredDataBlocks: ["project-registry"]',
        'requiredDataBlocks: ["missing"]',
      ),
      validManifest().replace(
        '{ id: "project-registry", source: "./data.json" }',
        '{ id: "project-registry", source: "./data.json", schema: "forbidden" }',
      ),
    ];

    for (const [index, body] of invalidBodies.entries()) {
      const path = writeManifest(root, body, `invalid-${index}.mjs`);
      await expectArtifactError(() => loadArtifactManifest(path), "INVALID_MANIFEST");
    }
  });

  it("rejects malformed JSON, invalid UTF-8 data, and unsafe local paths with stable errors", async () => {
    const root = fixture();
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    writeFileSync(join(root, "data.json"), "{broken}");
    const malformed = writeManifest(root, validManifest(), "malformed.mjs");
    await expectArtifactError(() => loadArtifactManifest(malformed), "INVALID_DATA_BLOCK");

    writeFileSync(join(root, "data.json"), Buffer.from([0xc3, 0x28]));
    const invalidUtf8 = writeManifest(root, validManifest(), "invalid-utf8.mjs");
    await expectArtifactError(() => loadArtifactManifest(invalidUtf8), "INVALID_DATA_BLOCK");

    writeFileSync(join(root, "data.json"), "{}");
    const outsideName = `outside-renderer-${basename(root)}.mjs`;
    const outside = join(root, "..", outsideName);
    writeFileSync(outside, "export function renderArtifact() { return {}; }");
    roots.push(outside);
    const escaped = writeManifest(
      root,
      validManifest().replace('renderer: "./renderer.mjs"', `renderer: "../${outsideName}"`),
      "escaped.mjs",
    );
    await expectArtifactError(() => loadArtifactManifest(escaped), "UNSAFE_ENTRY_PATH");
  });

  it("requires rootDirectory to remain beneath the manifest directory", async () => {
    const root = fixture();
    const consumer = join(root, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "data.json"), "{}");
    writeFileSync(join(consumer, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const valid = writeManifest(
      root,
      validManifest(', rootDirectory: "./consumer"'),
      "nested-root.mjs",
    );
    expect((await loadArtifactManifest(valid)).renderer).toBe("renderer.mjs");

    const escaped = writeManifest(
      root,
      validManifest(', rootDirectory: ".."'),
      "escaped-root.mjs",
    );
    await expectArtifactError(() => loadArtifactManifest(escaped), "INVALID_MANIFEST");
  });

  it("rejects missing, throwing, unknown-slot, and non-string renderer results", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    const renderers = [
      "export const other = true;",
      'export function renderArtifact() { throw new Error("secret"); }',
      'export function renderArtifact() { return { sidebar: "bad" }; }',
      "export function renderArtifact() { return { mainSections: 42 }; }",
      "export function renderArtifact() { return null; }",
    ];

    for (const [index, renderer] of renderers.entries()) {
      const rendererName = `renderer-${index}.mjs`;
      writeFileSync(join(root, rendererName), renderer);
      const path = writeManifest(
        root,
        validManifest().replace('renderer: "./renderer.mjs"', `renderer: "./${rendererName}"`),
        `renderer-case-${index}.mjs`,
      );
      const manifest = await loadArtifactManifest(path);
      await expectArtifactError(() => renderInteractiveModel(manifest), "INVALID_RENDERER_RESULT");
    }
  });

  it("normalizes reflective Proxy failures from manifests and renderer results", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    const traps = ["getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor"];
    for (const [index, trap] of traps.entries()) {
      const proxyManifest = join(root, `proxy-manifest-${index}.mjs`);
      writeFileSync(
        proxyManifest,
        `export default new Proxy({ contractVersion: 1 }, { ${trap}() { throw new Error("trap"); } });`,
      );
      await expectArtifactError(
        () => loadArtifactManifest(proxyManifest),
        "INVALID_MANIFEST",
      );

      const rendererName = `proxy-renderer-${index}.mjs`;
      writeFileSync(
        join(root, rendererName),
        `export function renderArtifact() {
          return new Proxy({ mainSections: "ok" }, { ${trap}() { throw new Error("trap"); } });
        }`,
      );
      const manifest = await loadArtifactManifest(
        writeManifest(
          root,
          validManifest().replace(
            'renderer: "./renderer.mjs"',
            `renderer: "./${rendererName}"`,
          ),
          `proxy-renderer-manifest-${index}.mjs`,
        ),
      );
      await expectArtifactError(
        () => renderInteractiveModel(manifest),
        "INVALID_RENDERER_RESULT",
      );
    }
  });

  it("normalizes revoked Proxy inspection failures", async () => {
    const root = fixture();
    const revokedManifest = join(root, "revoked-manifest.mjs");
    writeFileSync(
      revokedManifest,
      `const state = Proxy.revocable({}, {}); state.revoke(); export default state.proxy;`,
    );
    await expectArtifactError(
      () => loadArtifactManifest(revokedManifest),
      "INVALID_MANIFEST",
    );

    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact() {
        const state = Proxy.revocable({}, {}); state.revoke(); return state.proxy;
      }`,
    );
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));
    await expectArtifactError(
      () => renderInteractiveModel(manifest),
      "INVALID_RENDERER_RESULT",
    );
  });

  it("normalizes hostile manifest and render-options boundaries", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));

    const revokedManifest = Proxy.revocable(manifest, {});
    revokedManifest.revoke();
    await expectArtifactError(
      () => renderInteractiveModel(revokedManifest.proxy),
      "INVALID_MANIFEST",
    );
    await expectArtifactError(
      () =>
        renderInteractiveModel(
          new Proxy(manifest, {
            getOwnPropertyDescriptor() {
              throw new Error("manifest trap");
            },
          }),
        ),
      "INVALID_MANIFEST",
    );

    let getterInvoked = false;
    const accessorOptions = Object.defineProperty({}, "preservedData", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("options getter");
      },
    });
    await expectArtifactError(
      () => renderInteractiveModel(manifest, accessorOptions),
      "INVALID_DATA_BLOCK",
    );
    expect(getterInvoked).toBe(false);

    const revokedOptions = Proxy.revocable({}, {});
    revokedOptions.revoke();
    await expectArtifactError(
      () => renderInteractiveModel(manifest, revokedOptions.proxy),
      "INVALID_DATA_BLOCK",
    );
    await expectArtifactError(
      () =>
        renderInteractiveModel(
          manifest,
          new Proxy({}, { ownKeys() { throw new Error("options trap"); } }),
        ),
      "INVALID_DATA_BLOCK",
    );

    const revokedData = Proxy.revocable(new Map(), {});
    revokedData.revoke();
    await expectArtifactError(
      () => renderInteractiveModel(manifest, { preservedData: revokedData.proxy }),
      "INVALID_DATA_BLOCK",
    );
  });

  it("rejects oversized manifest, data, and renderer sources with stable errors", async () => {
    const root = fixture();
    const oversizedManifest = join(root, "oversized-manifest.mjs");
    writeFileSync(
      oversizedManifest,
      `${" ".repeat(2 * 1024 * 1024 + 1)}export default {};`,
    );
    await expectArtifactError(
      () => loadArtifactManifest(oversizedManifest),
      "INVALID_MANIFEST",
    );

    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    writeFileSync(
      join(root, "data.json"),
      `"${"x".repeat(16 * 1024 * 1024)}"`,
    );
    await expectArtifactError(
      () => loadArtifactManifest(writeManifest(root, validManifest(), "oversized-data.mjs")),
      "INVALID_DATA_BLOCK",
    );

    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(
      join(root, "renderer.mjs"),
      `${" ".repeat(2 * 1024 * 1024 + 1)}export function renderArtifact() { return {}; }`,
    );
    const manifest = await loadArtifactManifest(
      writeManifest(root, validManifest(), "oversized-renderer.mjs"),
    );
    await expectArtifactError(
      () => renderInteractiveModel(manifest),
      "INVALID_RENDERER_RESULT",
    );
  });

  it("rejects resource counts above the bounded manifest contract", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const cases = [
      [
        "dataBlocks",
        `[${Array.from({ length: 33 }, (_, index) =>
          `{ id: "block-${index}", source: "./data-${index}.json" }`,
        ).join(",")}]`,
      ],
      [
        "styles",
        `[${Array.from({ length: 17 }, (_, index) => `"./style-${index}.css"`).join(",")}]`,
      ],
      [
        "scripts",
        `[${Array.from({ length: 17 }, (_, index) => `"./script-${index}.js"`).join(",")}]`,
      ],
      [
        "svgAssets",
        `[${Array.from({ length: 17 }, (_, index) =>
          `{ id: "svg-${index}", source: "./svg-${index}.svg" }`,
        ).join(",")}]`,
      ],
    ];

    for (const [index, [field, replacement]] of cases.entries()) {
      const original =
        field === "dataBlocks"
          ? 'dataBlocks: [{ id: "project-registry", source: "./data.json" }]'
          : field === "styles"
            ? "styles: []"
            : field === "scripts"
              ? "scripts: []"
              : "svgAssets: []";
      const body = validManifest()
        .replace(original, `${field}: ${replacement}`)
        .replace(
          'requiredDataBlocks: ["project-registry"]',
          field === "dataBlocks" ? "requiredDataBlocks: []" : 'requiredDataBlocks: ["project-registry"]',
        );
      await expectArtifactError(
        () => loadArtifactManifest(writeManifest(root, body, `count-${index}.mjs`)),
        "INVALID_MANIFEST",
      );
    }
  });

  it("rejects oversized arrays from the length descriptor before enumerating entries", async () => {
    const root = fixture();
    const path = join(root, "preemptive-count.mjs");
    writeFileSync(
      path,
      `const dataBlocks = new Proxy(new Array(1_000_000), {
         ownKeys() { throw new Error("entries must not be enumerated"); }
       });
       export default {
         contractVersion: 1, mode: "interactive",
         metadata: { title: "Bounded", description: "", eyebrow: "", lang: "en" },
         dataBlocks, renderer: "./missing.mjs", styles: [], scripts: [], svgAssets: [],
         requiredDataBlocks: []
       };`,
    );

    try {
      await loadArtifactManifest(path);
      throw new Error("Expected preemptive count rejection");
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_MANIFEST" });
      expect((error as Error).message).toMatch(/maximum item count/i);
    }
  });

  it("allows repeated JSON and SVG sources while counting each occurrence", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    symlinkSync(join(root, "data.json"), join(root, "data-alias.json"));
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    writeFileSync(
      join(root, "shared.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>Map</title></svg>',
    );
    symlinkSync(join(root, "shared.svg"), join(root, "shared-alias.svg"));

    const body = validManifest()
      .replace(
        'dataBlocks: [{ id: "project-registry", source: "./data.json" }]',
        'dataBlocks: [{ id: "project-registry", source: "./data.json" }, { id: "other", source: "./data-alias.json" }]',
      )
      .replace(
        "svgAssets: []",
        'svgAssets: [{ id: "map-a", source: "./shared.svg", title: "First map" }, { id: "map-b", source: "./shared-alias.svg", title: "Second map" }]',
      );
    const manifest = await loadArtifactManifest(writeManifest(root, body));
    const model = await renderInteractiveModel(manifest);

    expect([...model.data.keys()]).toEqual(["other", "project-registry"]);
    expect(model.data.get("other")).toEqual(model.data.get("project-registry"));
    expect(model.svg).toHaveLength(2);
    expect(model.svg[0].html).toContain("First map");
    expect(model.svg[1].html).toContain("Second map");
  });

  it("enforces aggregate raw, canonical-node, and stylesheet budgets", async () => {
    const root = fixture();
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const rawDefinitions = [];
    for (let index = 0; index < 3; index += 1) {
      const source = `raw-${index}.json`;
      writeFileSync(join(root, source), `"${"x".repeat(11 * 1024 * 1024)}"`);
      rawDefinitions.push(`{ id: "raw-${index}", source: "./${source}" }`);
    }
    const rawManifest = validManifest()
      .replace(
        'dataBlocks: [{ id: "project-registry", source: "./data.json" }]',
        `dataBlocks: [${rawDefinitions.join(",")}]`,
      )
      .replace('requiredDataBlocks: ["project-registry"]', "requiredDataBlocks: []");
    await expectArtifactError(
      () => loadArtifactManifest(writeManifest(root, rawManifest, "raw-budget.mjs")),
      "INVALID_DATA_BLOCK",
    );

    writeFileSync(join(root, "nodes.json"), JSON.stringify(new Array(250_000).fill(0)));
    const nodeManifest = validManifest().replace("./data.json", "./nodes.json");
    await expectArtifactError(
      () => loadArtifactManifest(writeManifest(root, nodeManifest, "node-budget.mjs")),
      "INVALID_DATA_BLOCK",
    );

    writeFileSync(join(root, "data.json"), "{}");
    const styles = [];
    for (let index = 0; index < 5; index += 1) {
      const source = `aggregate-${index}.css`;
      writeFileSync(join(root, source), " ".repeat(1_700_000));
      styles.push(`"./${source}"`);
    }
    const styleManifest = validManifest().replace(
      "styles: []",
      `styles: [${styles.join(",")}]`,
    );
    const manifest = await loadArtifactManifest(
      writeManifest(root, styleManifest, "style-budget.mjs"),
    );
    await expectArtifactError(
      () => renderInteractiveModel(manifest),
      "INVALID_STYLESHEET",
    );
  });

  it("stops preserved-data canonicalization at the shared node budget", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));
    let descriptorVisits = 0;
    const oversized = new Proxy(new Array(500_000).fill(0), {
      getOwnPropertyDescriptor(target, property) {
        descriptorVisits += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    await expectArtifactError(
      () =>
        renderInteractiveModel(manifest, {
          preservedData: new Map([["oversized", oversized]]),
        }),
      "INVALID_DATA_BLOCK",
    );
    expect(descriptorVisits).toBeGreaterThan(249_000);
    expect(descriptorVisits).toBeLessThan(251_000);
  });

  it("does not accept copied forgeable manifest internals", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));
    const oldBrand = Symbol.for("402v.html-note-kit.manifest-internal.v1");
    const forged = {
      contractVersion: 1,
      mode: "interactive",
      metadata: manifest.metadata,
      requiredDataBlocks: manifest.requiredDataBlocks,
    };
    Object.defineProperty(forged, oldBrand, {
      value: Object.getOwnPropertyDescriptor(manifest, oldBrand)?.value,
    });

    await expectArtifactError(
      () => renderInteractiveModel(forged),
      "INVALID_MANIFEST",
    );
    expect(Object.getOwnPropertySymbols(manifest)).toEqual([]);
  });


  it("does not expose absolute paths through manifest, model, or structured errors", async () => {
    const root = fixture();
    writeFileSync(join(root, "data.json"), "{}");
    writeFileSync(join(root, "renderer.mjs"), "export function renderArtifact() { return {}; }");
    const manifest = await loadArtifactManifest(writeManifest(root, validManifest()));
    const model = await renderInteractiveModel(manifest);

    expect(JSON.stringify(manifest)).not.toContain(root);
    expect(JSON.stringify(model)).not.toContain(root);
    expect(manifest).toMatchObject({ renderer: "renderer.mjs" });
    expect(manifest.dataBlocks).toEqual([{ id: "project-registry", source: "data.json" }]);
  });
});
