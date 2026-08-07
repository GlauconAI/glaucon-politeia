import { createHash } from "node:crypto";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { renderInteractiveDocument } from "../lib/html-note-kit/document.mjs";
import {
  computeSourceHash,
  extractDataBlocks,
} from "../lib/html-note-kit/data-blocks.mjs";
import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";
import { renderHtmlDocument } from "../lib/html-note-kit/template.mjs";

function model() {
  return {
    metadata: {
      title: "Project Index",
      description: "Projects",
      eyebrow: "402v",
      lang: "en",
    },
    data: new Map([
      ["zeta", { ready: true }],
      ["registry", { projects: [{ name: "Atlas" }] }],
    ]),
    slots: {
      navigation: '<nav id="artifact-navigation">Navigation</nav>',
      heroSupplementary: '<div id="hero-extra">Hero</div>',
      mainSections: '<section id="main-extra">Main</section>',
      rail: '<section id="rail-extra">Rail</section>',
      footer: '<span id="footer-extra">Footer</span>',
    },
    styles: [
      { label: "z.css", content: ".z-entry { display: block; }" },
      { label: "a.css", content: ".a-entry { min-width: 0; }" },
    ],
    scripts: [
      { label: "z.js", content: 'window.entryOrder.push("z");' },
      {
        label: "a.js",
        content:
          'window.entryOrder = ["a"]; window.runtimeData = window.__402vArtifact.getData("registry");',
      },
    ],
    svg: [],
    requiredDataBlocks: ["registry"],
  };
}

function expectArtifactError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error(`Expected a ${code} error`);
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactBuildError);
    expect(error).toMatchObject({ code, name: "ArtifactBuildError" });
  }
}

describe("interactive 402v document", () => {
  it("assembles every fixed slot at its contract location", () => {
    const dom = new JSDOM(renderInteractiveDocument(model()));
    const document = dom.window.document;
    const navigation = document.querySelector("#artifact-navigation");
    const hero = document.querySelector("#hero-extra");
    const main = document.querySelector("#main-extra");
    const rail = document.querySelector("#rail-extra");
    const footer = document.querySelector("#footer-extra");

    expect(navigation?.parentElement).toMatchObject({
      className: "artifact-topbar-inner",
    });
    expect(navigation?.previousElementSibling).toMatchObject({
      className: "artifact-path",
    });
    expect(hero?.parentElement).toMatchObject({ className: "artifact-hero" });
    expect(hero?.previousElementSibling).toMatchObject({
      className: "artifact-status",
    });
    expect(main?.parentElement).toMatchObject({
      className: "artifact-main-panel",
    });
    expect(rail?.parentElement).toMatchObject({ className: "artifact-rail" });
    expect(footer?.parentElement).toMatchObject({ className: "note-footer" });
    expect(footer?.nextSibling?.textContent).toContain(
      "402v HTML Note Kit · standalone HTML",
    );
    expect(document.querySelector("[data-artifact-root]")).not.toBeNull();
    dom.window.close();
  });

  it("installs a locked frozen runtime with stable lazy named-data access", () => {
    const html = renderInteractiveDocument(model());
    const dom = new JSDOM(html, { runScripts: "dangerously" });
    const artifactWindow = dom.window as unknown as {
      __402vArtifact: {
        root: Element;
        dataIds(): string[];
        getData(id: string): unknown;
      };
      entryOrder: string[];
      runtimeData: unknown;
    };
    const descriptor = Object.getOwnPropertyDescriptor(
      artifactWindow,
      "__402vArtifact",
    );

    expect(descriptor).toMatchObject({ configurable: false, writable: false });
    expect(Object.isFrozen(artifactWindow.__402vArtifact)).toBe(true);
    expect(artifactWindow.__402vArtifact.root).toBe(
      dom.window.document.querySelector("[data-artifact-root]"),
    );
    expect(artifactWindow.__402vArtifact.dataIds()).toEqual([
      "registry",
      "zeta",
    ]);
    const ids = artifactWindow.__402vArtifact.dataIds();
    ids.push("forged");
    expect(artifactWindow.__402vArtifact.dataIds()).toEqual([
      "registry",
      "zeta",
    ]);
    expect(artifactWindow.runtimeData).toEqual({
      projects: [{ name: "Atlas" }],
    });
    expect(artifactWindow.entryOrder).toEqual(["a", "z"]);

    const registry = dom.window.document.getElementById("registry");
    if (registry === null) throw new Error("missing registry data block");
    registry.textContent = '{"changed":true}';
    expect(artifactWindow.__402vArtifact.getData("registry")).toEqual({
      changed: true,
    });
    expect(() => artifactWindow.__402vArtifact.getData("unknown")).toThrow(
      "Unknown artifact data block: unknown",
    );
    dom.window.close();
  });

  it("escapes shell metadata and labels while keeping trusted slot markup", () => {
    const input = model();
    input.metadata = {
      title: '<Title & "friends">',
      description: '</p><script id="metadata-script">bad()</script>',
      eyebrow: "<strong>eyebrow</strong>",
      lang: 'en\" data-forged="yes',
    };
    input.styles = [
      {
        label: 'style\" data-forged="yes',
        content: ".trusted-style { color: red; }",
      },
    ];
    input.scripts = [
      {
        label: 'script\" data-forged="yes',
        content: "window.trustedConsumerScript = true;",
      },
    ];
    input.slots.mainSections =
      '<section id="trusted-slot"><strong>Trusted HTML</strong></section>';

    const html = renderInteractiveDocument(input);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    expect(document.title).toBe('<Title & "friends">');
    expect(document.documentElement.lang).toBe('en" data-forged="yes');
    expect(document.documentElement.hasAttribute("data-forged")).toBe(false);
    expect(document.querySelector("#metadata-script")).toBeNull();
    expect(document.querySelector("#trusted-slot strong")?.textContent).toBe(
      "Trusted HTML",
    );
    expect(
      document.querySelector("style[data-artifact-style]")?.getAttribute(
        "data-artifact-style",
      ),
    ).toBe('style" data-forged="yes');
    expect(
      document.querySelector("script[data-artifact-script]")?.getAttribute(
        "data-artifact-script",
      ),
    ).toBe('script" data-forged="yes');
    dom.window.close();
  });

  it("orders styles, canonical data, runtime, and consumer scripts deterministically", () => {
    const first = renderInteractiveDocument(model());
    const second = renderInteractiveDocument(model());

    expect(second).toBe(first);
    expect(first).toContain(
      'name="402v-artifact-mode" content="interactive"',
    );
    expect(first).toMatch(
      /name="402v-source-hash" content="sha256:[a-f0-9]{64}"/,
    );
    expect(first.indexOf('data-artifact-style="a.css"')).toBeLessThan(
      first.indexOf('data-artifact-style="z.css"'),
    );
    expect(first.indexOf('id="registry"')).toBeLessThan(
      first.indexOf('id="zeta"'),
    );
    expect(first.indexOf('id="zeta"')).toBeLessThan(
      first.indexOf("__402vArtifact"),
    );
    expect(first.indexOf("__402vArtifact")).toBeLessThan(
      first.indexOf('data-artifact-script="a.js"'),
    );
    expect(first.indexOf('data-artifact-script="a.js"')).toBeLessThan(
      first.indexOf('data-artifact-script="z.js"'),
    );
    expect(first).not.toContain(process.cwd());
    expect(first).not.toMatch(/(?:build|generated)(?:At| at)["': ]/i);
  });

  it("snapshots adversarial data once so emitted JSON and its hash agree", () => {
    let descriptorReads = 0;
    const changing = new Proxy(
      { value: 0 },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key !== "value" || descriptor === undefined) return descriptor;
          descriptorReads += 1;
          return { ...descriptor, value: descriptorReads };
        },
      },
    );
    const input = model();
    input.data = new Map([["registry", changing]]);
    input.requiredDataBlocks = ["registry"];

    const html = renderInteractiveDocument(input);
    const document = new JSDOM(html).window.document;
    const embeddedHash = document
      .querySelector('meta[name="402v-source-hash"]')
      ?.getAttribute("content");

    expect(embeddedHash).toBe(computeSourceHash(extractDataBlocks(html)));
    expect(descriptorReads).toBe(1);
  });

  it("assigns page overflow guards and SVG-frame scroll ownership", () => {
    const html = renderInteractiveDocument(model());

    expect(html).toMatch(
      /html,\s*body\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*clip;/s,
    );
    expect(html).toMatch(
      /\.artifact-svg-frame\s*\{[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;/s,
    );
  });

  it("rejects model accessors and Proxy introspection failures without invoking code", () => {
    let getterCalls = 0;
    const withGetter = model();
    Object.defineProperty(withGetter, "metadata", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return model().metadata;
      },
    });
    const trapped = new Proxy(model(), {
      getPrototypeOf() {
        throw new Error("trap");
      },
    });

    expectArtifactError(
      () => renderInteractiveDocument(withGetter),
      "INVALID_RENDERER_RESULT",
    );
    expect(getterCalls).toBe(0);
    expectArtifactError(
      () => renderInteractiveDocument(trapped),
      "INVALID_RENDERER_RESULT",
    );
  });

  it("rejects unknown shapes, missing required data, and extra JSON declarations", () => {
    const unknownRoot = { ...model(), unexpected: true };
    const missing = model();
    missing.requiredDataBlocks = ["missing"];
    const duplicateTruth = model();
    duplicateTruth.slots.rail =
      '<SCRIPT data-note="bad" TYPE = "application/json" id="second-truth">{}</SCRIPT>';

    expectArtifactError(
      () => renderInteractiveDocument(unknownRoot),
      "INVALID_RENDERER_RESULT",
    );
    expectArtifactError(
      () => renderInteractiveDocument(missing),
      "MISSING_DATA_BLOCK",
    );
    expectArtifactError(
      () => renderInteractiveDocument(duplicateTruth),
      "INVALID_RENDERER_RESULT",
    );
  });

  it("keeps note mode byte-stable and free of interactive declarations", () => {
    const html = renderHtmlDocument({
      metadata: {
        title: "Lean note",
        description: "",
        eyebrow: "402v",
        lang: "en",
      },
      articleHtml: "<h1>Lean note</h1>",
      headings: [],
    });

    expect(createHash("sha256").update(html).digest("hex")).toBe(
      "aac27cc14720b0b8073f240102bb4146c77f3f0633d07dcc9c3bd15be9323ace",
    );
    expect(html).not.toContain("__402vArtifact");
    expect(html).not.toContain('type="application/json"');
    expect(html).not.toContain('name="402v-artifact-mode"');
    expect(html).toContain('class="note-article"');
  });
});
