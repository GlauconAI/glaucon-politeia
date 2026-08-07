import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderInteractiveDocument } from "../lib/html-note-kit/document.mjs";
import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";
import {
  buildInteractiveArtifact,
  buildNote,
  extractDataBlocks,
  verifyArtifact,
} from "../lib/html-note-kit/index.mjs";
import {
  atomicWriteUtf8,
  readUtf8File,
} from "../lib/html-note-kit/io.mjs";
import {
  verifyArtifactHtml,
  verifyArtifactStartup,
} from "../lib/html-note-kit/verify.mjs";

const roots: string[] = [];
const cli = join(process.cwd(), "scripts", "html-note-kit.mjs");

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "html-kit-api-"));
  roots.push(root);
  return root;
}

function writeProject(
  rendererBody = 'return { mainSections: "<section>Ready</section>" };',
  options: { script?: string; svg?: boolean } = {},
) {
  const root = temporaryRoot();
  writeFileSync(join(root, "data.json"), '{"ready":true}');
  writeFileSync(
    join(root, "renderer.mjs"),
    `export function renderArtifact({ svg }) { ${rendererBody} }`,
  );
  if (options.script !== undefined) {
    writeFileSync(join(root, "artifact.js"), options.script);
  }
  if (options.svg) {
    writeFileSync(
      join(root, "diagram.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>Diagram</title><path d="M0 0h10v10z"/></svg>',
    );
  }
  writeFileSync(
    join(root, "artifact.mjs"),
    `export default {
      contractVersion: 1,
      mode: "interactive",
      metadata: { title: "API fixture", description: "", eyebrow: "402v", lang: "en" },
      dataBlocks: [{ id: "registry", source: "./data.json" }],
      renderer: "./renderer.mjs",
      styles: [],
      scripts: ${options.script === undefined ? "[]" : '["./artifact.js"]'},
      svgAssets: ${options.svg ? '[{ id: "diagram", source: "./diagram.svg" }]' : "[]"},
      requiredDataBlocks: ["registry"]
    };`,
  );
  return root;
}

function validHtml(mainSections = "<section>Ready</section>") {
  return renderInteractiveDocument({
    metadata: {
      title: "Verified fixture",
      description: "",
      eyebrow: "402v",
      lang: "en",
    },
    data: new Map([["registry", { ready: true }]]),
    slots: {
      navigation: "",
      heroSupplementary: "",
      mainSections,
      rail: "",
      footer: "",
    },
    styles: [],
    scripts: [],
    svg: [],
    requiredDataBlocks: ["registry"],
  });
}

function expectArtifactError(run: () => unknown, code: string) {
  try {
    run();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactBuildError);
    expect(error).toMatchObject({ code, name: "ArtifactBuildError" });
    expect(() => JSON.stringify((error as ArtifactBuildError).toJSON())).not.toThrow();
    return error as ArtifactBuildError;
  }
}

async function expectArtifactRejection(run: () => Promise<unknown>, code: string) {
  try {
    await run();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ArtifactBuildError);
    expect(error).toMatchObject({ code, name: "ArtifactBuildError" });
    return error as ArtifactBuildError;
  }
}

function issueCodes(error: ArtifactBuildError) {
  return new Set(
    (error.details as { issues?: Array<{ code: string }> } | undefined)?.issues?.map(
      (issue) => issue.code,
    ),
  );
}

describe("interactive artifact build API", () => {
  it("builds, verifies, hashes, and reports deterministic standalone HTML", async () => {
    const root = writeProject();
    const output = join(root, "artifact.html");

    const result = await buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"),
      outputPath: output,
      force: true,
    });

    expect(result).toMatchObject({
      ok: true,
      mode: "interactive",
      output,
      title: "API fixture",
      dataBlockIds: ["registry"],
    });
    expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.outputHash).toBe(
      `sha256:${createHash("sha256").update(readFileSync(output)).digest("hex")}`,
    );
    expect(result.bytes).toBe(readFileSync(output).byteLength);
    expect(verifyArtifact({ path: output, requiredDataBlocks: ["registry"] })).toMatchObject({
      ok: true,
      mode: "interactive",
      dataBlockIds: ["registry"],
    });
    expect(extractDataBlocks(readFileSync(output, "utf8")).get("registry")).toEqual({
      ready: true,
    });
    expect(readFileSync(output, "utf8")).not.toContain(root);
    expect(readFileSync(output, "utf8")).not.toMatch(/\.tmp-|html-kit-api-/);
  });

  it("enforces force without modifying an existing destination", async () => {
    const root = writeProject();
    const output = join(root, "artifact.html");
    writeFileSync(output, "KEEP-EXISTING");

    await expectArtifactRejection(
      () =>
        buildInteractiveArtifact({
          manifestPath: join(root, "artifact.mjs"),
          outputPath: output,
        }),
      "OUTPUT_EXISTS",
    );
    expect(readFileSync(output, "utf8")).toBe("KEEP-EXISTING");

    await buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"),
      outputPath: output,
      force: true,
      verifyDeterminism: false,
    });
    expect(readFileSync(output, "utf8")).toMatch(/^<!doctype html>/);
  });

  it("leaves the destination byte-identical after renderer or verification failure", async () => {
    const rendererRoot = writeProject('throw new Error("renderer exploded");');
    const rendererOutput = join(rendererRoot, "artifact.html");
    writeFileSync(rendererOutput, "KEEP-RENDERER");

    await expectArtifactRejection(
      () =>
        buildInteractiveArtifact({
          manifestPath: join(rendererRoot, "artifact.mjs"),
          outputPath: rendererOutput,
          force: true,
        }),
      "INVALID_RENDERER_RESULT",
    );
    expect(readFileSync(rendererOutput, "utf8")).toBe("KEEP-RENDERER");

    const startupRoot = writeProject("return {};", {
      script: 'throw new Error("startup exploded");',
    });
    const startupOutput = join(startupRoot, "artifact.html");
    writeFileSync(startupOutput, "KEEP-STARTUP");
    await expectArtifactRejection(
      () =>
        buildInteractiveArtifact({
          manifestPath: join(startupRoot, "artifact.mjs"),
          outputPath: startupOutput,
          force: true,
        }),
      "ARTIFACT_VERIFICATION_FAILED",
    );
    expect(readFileSync(startupOutput, "utf8")).toBe("KEEP-STARTUP");

    for (const [root, output] of [
      [rendererRoot, rendererOutput],
      [startupRoot, startupOutput],
    ]) {
      expect(readdirSync(root).filter((name) => name.includes(".tmp-"))).toEqual([]);
      expect(existsSync(output)).toBe(true);
    }
  });

  it("rejects renderer module state and random output as non-deterministic by default", async () => {
    const stateful = writeProject(
      'globalThis.calls = (globalThis.calls ?? 0) + 1; return { mainSections: `<section>${globalThis.calls}</section>` };',
    );
    const random = writeProject(
      'return { mainSections: `<section>${Math.random()}</section>` };',
    );

    await expectArtifactRejection(
      () =>
        buildInteractiveArtifact({
          manifestPath: join(stateful, "artifact.mjs"),
          outputPath: join(stateful, "artifact.html"),
          force: true,
        }),
      "NON_DETERMINISTIC_BUILD",
    );
    await expectArtifactRejection(
      () =>
        buildInteractiveArtifact({
          manifestPath: join(random, "artifact.mjs"),
          outputPath: join(random, "artifact.html"),
          force: true,
          verifyDeterminism: true,
        }),
      "NON_DETERMINISTIC_BUILD",
    );
    expect(existsSync(join(stateful, "artifact.html"))).toBe(false);
    expect(existsSync(join(random, "artifact.html"))).toBe(false);
  });

  it("validates build options before reading or writing", async () => {
    const root = writeProject();
    const output = join(root, "artifact.html");

    await expectArtifactRejection(
      () =>
        buildInteractiveArtifact({
          manifestPath: join(root, "artifact.mjs"),
          outputPath: output,
          force: "yes" as unknown as boolean,
        }),
      "INVALID_BUILD_OPTIONS",
    );
    expect(existsSync(output)).toBe(false);
  });

  it("exports only the Task 5 public build surface", async () => {
    const api = await import("../lib/html-note-kit/index.mjs");

    expect(Object.keys(api).sort()).toEqual([
      "buildInteractiveArtifact",
      "buildNote",
      "extractDataBlocks",
      "verifyArtifact",
    ]);
    expect(api).not.toHaveProperty("updateArtifactData");
  });
});

describe("artifact verification", () => {
  it("reports malformed canonical data, duplicate IDs, hash mismatch, and missing IDs", () => {
    const source = validHtml();
    const malformed = source.replace('{\n  "ready": true\n}', '{"ready":');
    const nonCanonical = source.replace('{\n  "ready": true\n}', '{"ready":true}');
    const duplicate = source.replace(
      '<script data-402v-runtime>',
      '<script type="application/json" id="registry">{}</script>\n<script data-402v-runtime>',
    );
    const wrongHash = source.replace(/sha256:[a-f0-9]{64}/, `sha256:${"0".repeat(64)}`);
    const negativeZero = source.replace('{\n  "ready": true\n}', "-0");
    const nonCanonicalType = source.replace(
      'type="application/json"',
      'type="Application/JSON"',
    );
    const shadowedId = source.replace(
      "<section>Ready</section>",
      '<section id="registry">Ready</section>',
    );

    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(malformed), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "INVALID_DATA_BLOCK",
    );
    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(nonCanonical), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "NON_CANONICAL_DATA_BLOCK",
    );
    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(duplicate), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "DUPLICATE_DATA_BLOCK",
    );
    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(wrongHash), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "SOURCE_HASH_MISMATCH",
    );
    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(negativeZero), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "NON_CANONICAL_DATA_BLOCK",
    );
    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(nonCanonicalType), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "NON_CANONICAL_DATA_BLOCK",
    );
    expect(issueCodes(expectArtifactError(() => verifyArtifactHtml(shadowedId), "ARTIFACT_VERIFICATION_FAILED"))).toContain(
      "DUPLICATE_DATA_BLOCK",
    );
    expect(
      issueCodes(
        expectArtifactError(
          () => verifyArtifactHtml(source, { requiredDataBlocks: ["missing"] }),
          "ARTIFACT_VERIFICATION_FAILED",
        ),
      ),
    ).toContain("MISSING_DATA_BLOCK");
  });

  it("rejects external and unresolved resources, unsafe CSS, imports, and script reordering", () => {
    const source = validHtml();
    const cases: Array<[string, string]> = [
      [source.replace("</head>", '<script src="https://example.com/a.js"></script></head>'), "EXTERNAL_RESOURCE"],
      [source.replace("</head>", '<link rel="stylesheet" href="./missing.css"></head>'), "EXTERNAL_RESOURCE"],
      [source.replace("</head>", '<style>@import "https://example.com/a.css";</style></head>'), "UNSAFE_STYLESHEET"],
      [source.replace("</head>", '<style>.x{background:url(./missing.png)}</style></head>'), "UNSAFE_STYLESHEET"],
      [source.replace("<section>Ready</section>", '<section style="background:url(./missing.png)">Ready</section>'), "UNSAFE_STYLESHEET"],
      [source.replace("<section>Ready</section>", '<input type="image" src="./missing.png"><section>Ready</section>'), "EXTERNAL_RESOURCE"],
      [source.replace("</body>", '<script data-artifact-script="bad.js">import("./bad.js")</script></body>'), "INVALID_JAVASCRIPT"],
      [source.replace("<script data-402v-runtime>", '<script data-artifact-script="early.js">window.early=true</script>\n<script data-402v-runtime>'), "INVALID_SCRIPT_ORDER"],
      [source.replace("<script data-402v-runtime>", '<script>window.undeclared=true</script>\n<script data-402v-runtime>'), "UNDECLARED_SCRIPT"],
    ];

    for (const [html, expectedCode] of cases) {
      const error = expectArtifactError(
        () => verifyArtifactHtml(html),
        "ARTIFACT_VERIFICATION_FAILED",
      );
      expect(issueCodes(error), expectedCode).toContain(expectedCode);
    }
  });

  it("checks doctype, title, viewport, generator, mode, runtime, and overflow guards", () => {
    const source = validHtml();
    const cases: Array<[string, string]> = [
      [source.replace("<!doctype html>", ""), "INVALID_DOCTYPE"],
      [source.replace("<title>Verified fixture</title>", "<title></title>"), "INVALID_TITLE"],
      [source.replace('content="width=device-width, initial-scale=1"', 'content="width=1000"'), "INVALID_VIEWPORT"],
      [source.replace('content="402v HTML Note Kit"', 'content="Other"'), "INVALID_GENERATOR"],
      [source.replace('content="interactive"', 'content="unknown"'), "INVALID_MODE"],
      [source.replace(/<script data-402v-runtime>[\s\S]*?<\/script>\n/, ""), "MISSING_RUNTIME"],
      [source.replace("overflow-x: clip;", "overflow-x: visible;"), "MISSING_OVERFLOW_GUARD"],
    ];

    for (const [html, expectedCode] of cases) {
      expect(
        issueCodes(
          expectArtifactError(
            () => verifyArtifactHtml(html),
            "ARTIFACT_VERIFICATION_FAILED",
          ),
        ),
        expectedCode,
      ).toContain(expectedCode);
    }
  });

  it("returns structured issues for invalid public verification options", () => {
    const error = expectArtifactError(
      () => verifyArtifact({ html: validHtml(), path: "/duplicate-input" }),
      "ARTIFACT_VERIFICATION_FAILED",
    );

    expect(error.details).toMatchObject({
      issues: [
        {
          code: "INVALID_VERIFICATION_OPTIONS",
          message: expect.any(String),
        },
      ],
    });
  });

  it("promotes startup throws and bounds infinite loops in an isolated process", () => {
    const throwing = validHtml().replace(
      "</body>",
      '<script data-artifact-script="throw.js">throw new Error("startup exploded")</script></body>',
    );
    const looping = validHtml().replace(
      "</body>",
      '<script data-artifact-script="loop.js">while (true) {}</script></body>',
    );

    const thrown = expectArtifactError(
      () => verifyArtifactStartup(throwing, { timeoutMs: 1_000 }),
      "ARTIFACT_VERIFICATION_FAILED",
    );
    expect(issueCodes(thrown)).toContain("STARTUP_ERROR");

    const started = Date.now();
    const timedOut = expectArtifactError(
      () => verifyArtifactStartup(looping, { timeoutMs: 250 }),
      "ARTIFACT_VERIFICATION_FAILED",
    );
    expect(issueCodes(timedOut)).toContain("STARTUP_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("rejects a locked runtime that does not expose the canonical script data", () => {
    const forgedRuntime = `Object.defineProperty(window, "__402vArtifact", {
      value: Object.freeze({
        root: document.querySelector("[data-artifact-root]"),
        dataIds: () => ["registry"],
        getData: () => ({ forged: true })
      }),
      configurable: false,
      writable: false
    });`;
    const forged = validHtml().replace(
      /(<script data-402v-runtime>)[\s\S]*?(<\/script>)/,
      `$1\n${forgedRuntime}\n$2`,
    );

    expect(
      issueCodes(
        expectArtifactError(
          () => verifyArtifactHtml(forged),
          "ARTIFACT_VERIFICATION_FAILED",
        ),
      ),
    ).toContain("STARTUP_ERROR");
  });

  it("rejects unsafe, inaccessible, unframed, and unbounded SVG", () => {
    const validSvg =
      '<div class="artifact-svg-frame"><svg class="artifact-svg" role="img" aria-labelledby="map-title" viewBox="0 0 10 10"><title id="map-title">Map</title><path d="M0 0h10v10z"/></svg></div>';
    const source = validHtml(validSvg);
    expect(verifyArtifactHtml(source)).toMatchObject({ ok: true });

    const cases: Array<[string, string]> = [
      [validSvg.replace(' viewBox="0 0 10 10"', ""), "SVG_MISSING_VIEWBOX"],
      [validSvg.replace(' aria-labelledby="map-title"', ""), "SVG_INACCESSIBLE"],
      [validSvg.replace('<div class="artifact-svg-frame">', "<div>"), "SVG_MISSING_FRAME"],
      [validSvg.replace("<path", '<script>alert(1)</script><path'), "UNSAFE_SVG"],
      [validSvg.replace("<path", '<image href="https://example.com/x.png"/><path'), "UNSAFE_SVG"],
      [validSvg.replace("<svg ", '<svg onload="window.svgRan=true" '), "UNSAFE_SVG"],
      [validSvg.replace("<path", '<use href="#missing"/><path'), "UNSAFE_SVG"],
      [validSvg.replace("<path", '<path style="fill:url(data:image/svg+xml,x)"/><path'), "UNSAFE_SVG"],
    ];

    for (const [svg, expectedCode] of cases) {
      expect(
        issueCodes(
          expectArtifactError(
            () => verifyArtifactHtml(source.replace(validSvg, svg)),
            "ARTIFACT_VERIFICATION_FAILED",
          ),
        ),
        expectedCode,
      ).toContain(expectedCode);
    }
  });

  it("strictly decodes bounded UTF-8 files", () => {
    const root = temporaryRoot();
    const invalid = join(root, "invalid.html");
    const oversized = join(root, "oversized.html");
    writeFileSync(invalid, Buffer.from([0xc3, 0x28]));
    writeFileSync(oversized, "12345");

    expectArtifactError(
      () => verifyArtifact({ path: invalid }),
      "ARTIFACT_VERIFICATION_FAILED",
    );
    expectArtifactError(
      () => readUtf8File(oversized, { maximumBytes: 4 }),
      "ARTIFACT_READ_FAILED",
    );

    let getterCalls = 0;
    const hostileOptions = Object.defineProperty({}, "maximumBytes", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 4;
      },
    });
    expectArtifactError(
      () => readUtf8File(oversized, hostileOptions),
      "ARTIFACT_READ_FAILED",
    );
    expect(getterCalls).toBe(0);
  });
});

describe("atomic I/O and note compatibility", () => {
  it("cleans only its exact temporary file when replacement fails", () => {
    const root = temporaryRoot();
    const destinationDirectory = join(root, "destination");
    const unrelated = join(root, ".destination.tmp-keep");
    writeFileSync(unrelated, "KEEP");
    // A directory cannot be replaced by the temporary regular file.
    mkdirSync(destinationDirectory);

    expectArtifactError(
      () => atomicWriteUtf8(destinationDirectory, "replacement"),
      "ATOMIC_WRITE_FAILED",
    );
    expect(readFileSync(unrelated, "utf8")).toBe("KEEP");
    expect(
      readdirSync(root).filter(
        (entry) => entry.includes(`${basename(destinationDirectory)}.tmp-`) && entry !== basename(unrelated),
      ),
    ).toEqual([]);
  });

  it("buildNote preserves the current CLI output bytes", async () => {
    const root = temporaryRoot();
    const input = join(root, "note.md");
    const apiOutput = join(root, "api.html");
    const cliOutput = join(root, "cli.html");
    writeFileSync(
      input,
      `---\ntitle: Byte stable note\ndescription: Same adapter.\neyebrow: 402v\n---\n\n# Byte stable note\n\n| A | B |\n| - | - |\n| one | two |\n`,
    );

    const result = await buildNote({ inputPath: input, outputPath: apiOutput });
    const cliResult = spawnSync(
      process.execPath,
      [cli, "build", input, "--output", cliOutput],
      { encoding: "utf8" },
    );

    expect(cliResult.status).toBe(0);
    expect(readFileSync(apiOutput)).toEqual(readFileSync(cliOutput));
    expect(result).toMatchObject({
      ok: true,
      mode: "note",
      output: apiOutput,
      title: "Byte stable note",
      dataBlockIds: [],
    });
    expect(verifyArtifact({ path: apiOutput })).toMatchObject({
      ok: true,
      mode: "note",
    });
  });
});
