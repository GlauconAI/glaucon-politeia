import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    const outside = join(root, "..", "outside-renderer.mjs");
    writeFileSync(outside, "export function renderArtifact() { return {}; }");
    const escaped = writeManifest(
      root,
      validManifest().replace('renderer: "./renderer.mjs"', 'renderer: "../outside-renderer.mjs"'),
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
