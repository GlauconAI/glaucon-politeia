import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadScriptEntry,
  loadStylesheetEntry,
  loadSvgAsset,
  resolveTrustedEntry,
} from "../lib/html-note-kit/assets.mjs";
import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";

const CSS_AND_JS_LIMIT = 2 * 1024 * 1024;
const SVG_LIMIT = 5 * 1024 * 1024;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const container = mkdtempSync(join(tmpdir(), "html-kit-assets-"));
  const root = join(container, "manifest-root");
  roots.push(container);
  mkdirSync(join(root, "entries"), { recursive: true });
  return { container, root };
}

function expectArtifactError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error(`Expected a ${code} error`);
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactBuildError);
    expect(error).toMatchObject({ code, name: "ArtifactBuildError" });
    expect((error as Error).message).toMatch(new RegExp(`^${code}: `));
  }
}

describe("trusted local artifact entries", () => {
  it("loads valid CSS, classic JavaScript, and an accessible SVG with relative labels", () => {
    const { root } = fixture();
    writeFileSync(
      join(root, "entries/app.css"),
      '.card { mask: url("#shape"); background: url(data:image/png;base64,AA==); }',
    );
    writeFileSync(join(root, "entries/app.js"), "window.ready = true;");
    writeFileSync(
      join(root, "entries/map.svg"),
      '<svg class="map" viewBox="0 0 100 50"><defs><path id="route" d="M0 0h100"/></defs><use href="#route"/></svg>',
    );

    const css = loadStylesheetEntry(root, "./entries/app.css");
    const script = loadScriptEntry(root, "./entries/app.js");
    const svg = loadSvgAsset(root, {
      id: "system-map",
      source: "./entries/map.svg",
      title: "System map",
      description: "Component relationships",
    });

    expect(resolveTrustedEntry(root, "./entries/app.css").label).toBe(
      "entries/app.css",
    );
    expect(css).toEqual({
      label: "entries/app.css",
      content:
        '.card { mask: url("#shape"); background: url(data:image/png;base64,AA==); }',
    });
    expect(script).toEqual({
      label: "entries/app.js",
      content: "window.ready = true;",
    });
    expect(svg.id).toBe("system-map");
    expect(svg.label).toBe("entries/map.svg");
    expect(svg.html).not.toContain(root);

    const dom = new JSDOM(svg.html);
    try {
      const frame = dom.window.document.querySelector(".artifact-svg-frame");
      const element = frame?.querySelector("svg");
      expect(frame?.getAttribute("data-svg-id")).toBe("system-map");
      expect(element?.getAttribute("viewBox")).toBe("0 0 100 50");
      expect(element?.getAttribute("role")).toBe("img");
      expect(element?.classList.contains("map")).toBe(true);
      expect(element?.classList.contains("artifact-svg")).toBe(true);
      expect(element?.getAttribute("aria-labelledby")).toBe(
        "system-map-title system-map-description",
      );
      expect(element?.querySelector("title")?.id).toBe("system-map-title");
      expect(element?.querySelector("title")?.textContent).toBe("System map");
      expect(element?.querySelector("desc")?.id).toBe(
        "system-map-description",
      );
      expect(element?.querySelector("desc")?.textContent).toBe(
        "Component relationships",
      );
      expect(element?.querySelector('use[href="#route"]')).not.toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it("rejects traversal, symlink escape, URLs, NUL bytes, and empty sources", () => {
    const { container, root } = fixture();
    const outside = join(container, "outside.js");
    writeFileSync(outside, "window.outside = true;");
    symlinkSync(outside, join(root, "entries/link.js"));

    for (const source of [
      "../outside.js",
      "./entries/link.js",
      "https://example.com/app.js",
      "file:///tmp/app.js",
      "./entries/app\0.js",
      "",
    ]) {
      expectArtifactError(
        () => resolveTrustedEntry(root, source),
        "UNSAFE_ENTRY_PATH",
      );
    }
    expectArtifactError(
      () => resolveTrustedEntry("https://example.com", "app.js"),
      "UNSAFE_ENTRY_PATH",
    );
  });

  it("reports missing and non-file entries without exposing file contents", () => {
    const { root } = fixture();
    writeFileSync(join(root, "entries/secret.js"), "TOP_SECRET_FILE_CONTENT");

    for (const source of ["./entries/missing.js", "./entries"]) {
      try {
        resolveTrustedEntry(root, source);
        throw new Error("Expected an unsafe path error");
      } catch (error) {
        expect(error).toMatchObject({ code: "UNSAFE_ENTRY_PATH" });
        expect(JSON.stringify(error)).not.toContain("TOP_SECRET_FILE_CONTENT");
      }
    }
  });

  it("enforces strict UTF-8 for every entry type", () => {
    const { root } = fixture();
    const invalidUtf8 = Buffer.from([0xc3, 0x28]);
    writeFileSync(join(root, "entries/bad.css"), invalidUtf8);
    writeFileSync(join(root, "entries/bad.js"), invalidUtf8);
    writeFileSync(join(root, "entries/bad.svg"), invalidUtf8);

    expectArtifactError(
      () => loadStylesheetEntry(root, "./entries/bad.css"),
      "INVALID_STYLESHEET",
    );
    expectArtifactError(
      () => loadScriptEntry(root, "./entries/bad.js"),
      "INVALID_JAVASCRIPT",
    );
    expectArtifactError(
      () =>
        loadSvgAsset(root, {
          id: "bad-svg",
          source: "./entries/bad.svg",
          title: "Bad SVG",
        }),
      "UNSAFE_SVG",
    );
  });

  it("accepts exact size limits and rejects entries one byte over", () => {
    const { root } = fixture();
    writeFileSync(join(root, "entries/exact.css"), Buffer.alloc(CSS_AND_JS_LIMIT, 32));
    writeFileSync(
      join(root, "entries/large.css"),
      Buffer.alloc(CSS_AND_JS_LIMIT + 1, 32),
    );
    writeFileSync(join(root, "entries/exact.js"), Buffer.alloc(CSS_AND_JS_LIMIT, 32));
    writeFileSync(
      join(root, "entries/large.js"),
      Buffer.alloc(CSS_AND_JS_LIMIT + 1, 32),
    );

    const svgStart = '<svg viewBox="0 0 1 1"><title>Exact</title><!--';
    const svgEnd = "--></svg>";
    writeFileSync(
      join(root, "entries/exact.svg"),
      `${svgStart}${"x".repeat(SVG_LIMIT - svgStart.length - svgEnd.length)}${svgEnd}`,
    );
    writeFileSync(join(root, "entries/large.svg"), Buffer.alloc(SVG_LIMIT + 1, 32));

    expect(loadStylesheetEntry(root, "./entries/exact.css").content).toHaveLength(
      CSS_AND_JS_LIMIT,
    );
    expect(loadScriptEntry(root, "./entries/exact.js").content).toHaveLength(
      CSS_AND_JS_LIMIT,
    );
    expect(
      loadSvgAsset(root, { id: "exact", source: "./entries/exact.svg" }).html,
    ).toContain("<svg");
    expectArtifactError(
      () => loadStylesheetEntry(root, "./entries/large.css"),
      "INVALID_STYLESHEET",
    );
    expectArtifactError(
      () => loadScriptEntry(root, "./entries/large.js"),
      "INVALID_JAVASCRIPT",
    );
    expectArtifactError(
      () =>
        loadSvgAsset(root, {
          id: "large",
          source: "./entries/large.svg",
          title: "Large",
        }),
      "UNSAFE_SVG",
    );
  });

  it("rejects invalid classic JavaScript without executing it", () => {
    const { root } = fixture();
    const cases = new Map([
      ["syntax.js", "function broken( {"],
      ["static-import.js", 'import value from "./value.js";'],
      ["export.js", "export const value = 1;"],
      ["dynamic-import.js", 'const load = import("./value.js");'],
      ["source-map.js", "//# sourceMappingURL=app.js.map"],
      ["close.js", 'window.value = "</ScRiPt>";'],
    ]);

    for (const [filename, content] of cases) {
      writeFileSync(join(root, "entries", filename), content);
      expectArtifactError(
        () => loadScriptEntry(root, `./entries/${filename}`),
        "INVALID_JAVASCRIPT",
      );
    }

    writeFileSync(
      join(root, "entries/no-execute.js"),
      'throw new Error("must not execute");',
    );
    expect(loadScriptEntry(root, "./entries/no-execute.js").content).toContain(
      "must not execute",
    );
  });

  it("conservatively rejects dynamic import tokens inside comments and strings", () => {
    const { root } = fixture();
    writeFileSync(join(root, "entries/comment.js"), "// import('./later.js')");
    writeFileSync(join(root, "entries/string.js"), 'const text = "import( later )";');

    expectArtifactError(
      () => loadScriptEntry(root, "./entries/comment.js"),
      "INVALID_JAVASCRIPT",
    );
    expectArtifactError(
      () => loadScriptEntry(root, "./entries/string.js"),
      "INVALID_JAVASCRIPT",
    );
  });

  it("rejects unsafe CSS dependencies and HTML-closing text", () => {
    const { root } = fixture();
    const cases = new Map([
      ["import.css", '@IMPORT "theme.css";'],
      ["https.css", "body { background: url(https://example.com/a.png); }"],
      ["http.css", 'body { background: url("http://example.com/a.png"); }'],
      ["protocol.css", "body { background: url(//example.com/a.png); }"],
      ["local.css", "body { background: url(../images/a.png); }"],
      ["close.css", 'body::after { content: "</StYlE>"; }'],
    ]);

    for (const [filename, content] of cases) {
      writeFileSync(join(root, "entries", filename), content);
      expectArtifactError(
        () => loadStylesheetEntry(root, `./entries/${filename}`),
        "INVALID_STYLESHEET",
      );
    }
  });

  it("allows only data and fragment CSS url references", () => {
    const { root } = fixture();
    writeFileSync(
      join(root, "entries/safe.css"),
      '.a { fill: url( "#gradient" ); } .b { background: URL("data:image/svg+xml;base64,AA=="); } .c::after { content: "https://text-only.example"; }',
    );

    expect(loadStylesheetEntry(root, "./entries/safe.css").label).toBe(
      "entries/safe.css",
    );
  });

  it("rejects SVG declarations, missing accessibility, and malformed roots", () => {
    const { root } = fixture();
    const cases = new Map([
      [
        "doctype.svg",
        '<!DOCTYPE svg [<!ENTITY xxe "value">]><svg viewBox="0 0 1 1"><title>&xxe;</title></svg>',
      ],
      ["entity.svg", '<!ENTITY x "value"><svg viewBox="0 0 1 1"><title>X</title></svg>'],
      ["root.svg", '<html><title>Wrong root</title></html>'],
      ["viewbox.svg", "<svg><title>No dimensions</title></svg>"],
      ["title.svg", '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'],
    ]);

    for (const [filename, content] of cases) {
      writeFileSync(join(root, "entries", filename), content);
      expectArtifactError(
        () =>
          loadSvgAsset(root, {
            id: `unsafe-${filename.replace(".svg", "")}`,
            source: `./entries/${filename}`,
          }),
        "UNSAFE_SVG",
      );
    }
  });

  it("rejects forbidden SVG elements and event or resource attributes", () => {
    const { root } = fixture();
    const bodies = new Map([
      ["script", "<script>alert(1)</script>"],
      ["foreign", "<foreignObject><p>HTML</p></foreignObject>"],
      ["iframe", '<iframe src="local.html"/>'],
      ["object", '<object data="local.bin"/>'],
      ["embed", '<embed src="local.bin"/>'],
      ["audio", '<audio src="local.mp3"/>'],
      ["video", '<video src="local.mp4"/>'],
      ["event", '<path onmouseover="alert(1)"/>'],
      ["namespaced-event", '<path xmlns:x="urn:test" x:onload="alert(1)"/>'],
      ["href", '<a href="https://example.com"><path/></a>'],
      ["xlink", '<use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="icons.svg#x"/>'],
      ["image", '<image href="data:image/png;base64,AA=="/>'],
      ["src", '<path src="local.bin"/>'],
      ["namespaced-src", '<path xmlns:x="urn:test" x:src="local.bin"/>'],
    ]);

    for (const [filename, body] of bodies) {
      writeFileSync(
        join(root, "entries", `${filename}.svg`),
        `<svg viewBox="0 0 10 10"><title>Unsafe</title>${body}</svg>`,
      );
      expectArtifactError(
        () =>
          loadSvgAsset(root, {
            id: `unsafe-${filename}`,
            source: `./entries/${filename}.svg`,
          }),
        "UNSAFE_SVG",
      );
    }
  });

  it("rejects external CSS references in SVG attributes and style blocks", () => {
    const { root } = fixture();
    const cases = new Map([
      ["attribute", '<path fill="url(https://example.com/a.svg#paint)"/>'],
      ["local", '<path style="fill:url(./paint.svg#paint)"/>'],
      ["style", "<style>.x { fill: url(//example.com/a.svg#paint); }</style>"],
      ["import", '<style>@import "theme.css";</style>'],
    ]);

    for (const [filename, body] of cases) {
      writeFileSync(
        join(root, "entries", `${filename}.svg`),
        `<svg viewBox="0 0 10 10"><title>Unsafe</title>${body}</svg>`,
      );
      expectArtifactError(
        () =>
          loadSvgAsset(root, {
            id: `unsafe-${filename}`,
            source: `./entries/${filename}.svg`,
          }),
        "UNSAFE_SVG",
      );
    }
  });

  it("preserves safe SVG content, existing accessible text, and fragment references", () => {
    const { root } = fixture();
    writeFileSync(
      join(root, "entries/safe.svg"),
      '<svg viewBox="0 0 20 20"><title>Existing title</title><desc>Existing description</desc><defs><linearGradient id="paint"/></defs><path fill="url(#paint)"/><use href="#paint"/></svg>',
    );

    const result = loadSvgAsset(root, {
      id: "safe-svg",
      source: "./entries/safe.svg",
    });
    const dom = new JSDOM(result.html);
    try {
      const svg = dom.window.document.querySelector("svg");
      expect(svg?.querySelector("title")?.textContent).toBe("Existing title");
      expect(svg?.querySelector("desc")?.textContent).toBe(
        "Existing description",
      );
      expect(svg?.querySelector('path[fill="url(#paint)"]')).not.toBeNull();
      expect(svg?.querySelector('use[href="#paint"]')).not.toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it("escapes manifest accessibility text and replaces it deterministically", () => {
    const { root } = fixture();
    writeFileSync(
      join(root, "entries/text.svg"),
      '<svg viewBox="0 0 5 5"><title id="old-title">Old</title><desc id="old-desc">Old description</desc><path id="kept"/></svg>',
    );

    const definition = {
      id: "escaped-text",
      source: "./entries/text.svg",
      title: '<Title & "quoted">',
      description: "Description </desc><script>alert(1)</script>",
    };
    const first = loadSvgAsset(root, definition);
    const second = loadSvgAsset(root, definition);

    expect(second).toEqual(first);
    expect(first.html).not.toContain("<script>");
    expect(first.html).not.toContain("old-title");
    expect(first.html).not.toContain("old-desc");
    const dom = new JSDOM(first.html);
    try {
      const svg = dom.window.document.querySelector("svg");
      expect(svg?.querySelector("title")?.textContent).toBe('<Title & "quoted">');
      expect(svg?.querySelector("desc")?.textContent).toBe(
        "Description </desc><script>alert(1)</script>",
      );
      expect(svg?.querySelectorAll("title")).toHaveLength(1);
      expect(svg?.querySelectorAll("desc")).toHaveLength(1);
      expect(svg?.querySelector("#kept")).not.toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it("requires a safe bounded SVG id and valid definition text", () => {
    const { root } = fixture();
    writeFileSync(
      join(root, "entries/id.svg"),
      '<svg viewBox="0 0 1 1"><title>Safe</title></svg>',
    );

    for (const id of ["bad id", "1starts-with-number", `a${"x".repeat(128)}`]) {
      expectArtifactError(
        () => loadSvgAsset(root, { id, source: "./entries/id.svg" }),
        "UNSAFE_SVG",
      );
    }
    expectArtifactError(
      () =>
        loadSvgAsset(root, {
          id: "safe-id",
          source: "./entries/id.svg",
          title: 42 as unknown as string,
        }),
      "UNSAFE_SVG",
    );
  });
});
