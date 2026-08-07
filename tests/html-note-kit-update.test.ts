import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";
import {
  buildInteractiveArtifact,
  extractDataBlocks,
  updateArtifactData,
  verifyArtifact,
} from "../lib/html-note-kit/index.mjs";

const roots: string[] = [];
const cli = join(process.cwd(), "scripts", "html-note-kit.mjs");

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "html-kit-update-"));
  roots.push(root);
  return root;
}

function writeManifest(root: string, ids = ["registry", "settings", "extra"]) {
  const definitions = ids
    .map((id) => `{ id: ${JSON.stringify(id)}, source: ${JSON.stringify(`./${id}.json`)} }`)
    .join(", ");
  writeFileSync(
    join(root, "artifact.mjs"),
    `export default {
      contractVersion: 1,
      mode: "interactive",
      metadata: { title: "Update fixture", description: "", eyebrow: "402v", lang: "en" },
      dataBlocks: [${definitions}],
      renderer: "./renderer.mjs",
      styles: [],
      scripts: [],
      svgAssets: [],
      requiredDataBlocks: ["registry"]
    };`,
  );
}

function fixture() {
  const root = temporaryRoot();
  writeFileSync(join(root, "registry.json"), '{"version":1,"items":["alpha"]}');
  writeFileSync(join(root, "settings.json"), '{"theme":"dark"}');
  writeFileSync(join(root, "extra.json"), '{"retained":true}');
  writeFileSync(
    join(root, "renderer.mjs"),
    `export function renderArtifact({ data }) {
      return { mainSections: '<section>' + data.registry.items.join(',') + ':' + data.settings.theme + '</section>' };
    }`,
  );
  writeManifest(root);
  return root;
}

function temporaryNames(root: string) {
  return readdirSync(root).filter((name) => name.includes(".tmp-"));
}

function artifactError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(ArtifactBuildError);
  expect(error).toMatchObject({ code });
}

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function parseSuccess(result: ReturnType<typeof run>) {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const parsed = JSON.parse(result.stdout);
  expect(result.stdout).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

function parseFailure(result: ReturnType<typeof run>) {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  const parsed = JSON.parse(result.stderr);
  expect(result.stderr).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  expect(parsed).toMatchObject({ ok: false, error: { code: expect.any(String) } });
  return parsed;
}

describe("canonical artifact preservation", () => {
  it("preserves modified and removed-manifest data while the renderer sees preserved values", async () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const output = join(root, "artifact.html");
    await buildInteractiveArtifact({ manifestPath, outputPath: output, force: true });
    await updateArtifactData({
      artifactPath: output,
      manifestPath,
      id: "registry",
      value: { version: 2, items: ["beta"] },
    });

    writeFileSync(join(root, "registry.json"), '{"version":999,"items":["stale"]}');
    writeFileSync(join(root, "settings.json"), '{"theme":"stale"}');
    writeManifest(root, ["registry", "settings"]);
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact({ data }) {
        return { mainSections: '<section class="new-shell">' + data.registry.items.join(',') + ':' + data.settings.theme + ':' + data.extra.retained + '</section>' };
      }`,
    );

    const result = await buildInteractiveArtifact({
      manifestPath,
      outputPath: output,
      preserveDataFrom: output,
      force: true,
    });

    const html = readFileSync(output, "utf8");
    expect(result.dataBlockIds).toEqual(["extra", "registry", "settings"]);
    expect(extractDataBlocks(html)).toEqual(
      new Map([
        ["extra", { retained: true }],
        ["registry", { items: ["beta"], version: 2 }],
        ["settings", { theme: "dark" }],
      ]),
    );
    expect(html).toContain('class="new-shell"');
    expect(html).toContain("beta:dark:true");
    expect(html).not.toContain("stale");
  }, 15_000);

  it("reads and verifies the preserved artifact once before deterministic rendering", async () => {
    const root = fixture();
    const source = join(root, "preserved.html");
    const output = join(root, "rebuilt.html");
    await buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"),
      outputPath: source,
      force: true,
    });
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact({ data }) {
        process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(source)}, "MUTATED");
        return { mainSections: '<section>' + data.registry.items.join(',') + '</section>' };
      }`,
    );

    await buildInteractiveArtifact({
      manifestPath: join(root, "artifact.mjs"),
      outputPath: output,
      preserveDataFrom: source,
      force: true,
    });

    expect(readFileSync(source, "utf8")).toBe("MUTATED");
    expect(extractDataBlocks(readFileSync(output, "utf8")).get("registry")).toEqual({
      items: ["alpha"],
      version: 1,
    });
  });

  it("rejects an invalid preserved artifact without changing the destination", async () => {
    const root = fixture();
    const preserved = join(root, "invalid.html");
    const output = join(root, "artifact.html");
    writeFileSync(preserved, "not an artifact");
    writeFileSync(output, "KEEP");

    await expect(
      buildInteractiveArtifact({
        manifestPath: join(root, "artifact.mjs"),
        outputPath: output,
        preserveDataFrom: preserved,
        force: true,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      artifactError(error, "ARTIFACT_VERIFICATION_FAILED");
      return true;
    });
    expect(readFileSync(output, "utf8")).toBe("KEEP");
    expect(temporaryNames(root)).toEqual([]);
  });
});

describe("updateArtifactData", () => {
  it("updates only the named block, ignores stale manifest data, and returns build metadata", async () => {
    const root = fixture();
    const artifactPath = join(root, "artifact.html");
    const manifestPath = join(root, "artifact.mjs");
    await buildInteractiveArtifact({ manifestPath, outputPath: artifactPath, force: true });
    writeFileSync(join(root, "registry.json"), '{"version":999,"items":["stale"]}');
    writeFileSync(join(root, "settings.json"), '{"theme":"stale"}');

    const result = await updateArtifactData({
      artifactPath,
      manifestPath,
      id: "registry",
      value: { version: 2, items: ["beta"] },
    });

    const bytes = readFileSync(artifactPath);
    expect(result).toMatchObject({
      ok: true,
      mode: "interactive",
      output: artifactPath,
      title: "Update fixture",
      bytes: bytes.byteLength,
      dataBlockIds: ["extra", "registry", "settings"],
    });
    expect(result.outputHash).toBe(
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    );
    expect(result.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(extractDataBlocks(bytes.toString("utf8"))).toEqual(
      new Map([
        ["extra", { retained: true }],
        ["registry", { items: ["beta"], version: 2 }],
        ["settings", { theme: "dark" }],
      ]),
    );
    expect(bytes.toString("utf8")).toContain("beta:dark");
    expect(verifyArtifact({ path: artifactPath })).toMatchObject({ ok: true });
  });

  it("rejects missing IDs and invalid replacement values without changing old bytes", async () => {
    const root = fixture();
    const artifactPath = join(root, "artifact.html");
    const manifestPath = join(root, "artifact.mjs");
    await buildInteractiveArtifact({ manifestPath, outputPath: artifactPath, force: true });
    const before = readFileSync(artifactPath);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;

    for (const [id, value, code] of [
      ["missing", {}, "MISSING_DATA_BLOCK"],
      ["bad id", {}, "INVALID_DATA_BLOCK"],
      ["registry", cycle, "INVALID_DATA_BLOCK"],
      ["registry", () => undefined, "INVALID_DATA_BLOCK"],
    ] as const) {
      await expect(
        updateArtifactData({ artifactPath, manifestPath, id, value }),
      ).rejects.toSatisfy((error: unknown) => {
        artifactError(error, code);
        return true;
      });
      expect(readFileSync(artifactPath)).toEqual(before);
    }
    expect(temporaryNames(root)).toEqual([]);
  });

  it("strictly validates its plain options before touching the artifact", async () => {
    const root = fixture();
    const artifactPath = join(root, "missing.html");
    const manifestPath = join(root, "artifact.mjs");
    const hostile = Object.defineProperty({}, "artifactPath", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });

    for (const options of [
      { artifactPath, manifestPath, id: "registry", value: {}, unknown: true },
      hostile,
      [],
    ]) {
      await expect(
        updateArtifactData(options as never),
      ).rejects.toSatisfy((error: unknown) => {
        artifactError(error, "INVALID_UPDATE_OPTIONS");
        return true;
      });
    }
    expect(existsSync(artifactPath)).toBe(false);
  });

  it("honors same/different output and force semantics without leaving temporary files", async () => {
    const root = fixture();
    const artifactPath = join(root, "artifact.html");
    const manifestPath = join(root, "artifact.mjs");
    const copy = join(root, "copy.html");
    await buildInteractiveArtifact({ manifestPath, outputPath: artifactPath, force: true });
    const original = readFileSync(artifactPath);
    writeFileSync(copy, "KEEP");

    await expect(
      updateArtifactData({
        artifactPath,
        manifestPath,
        id: "registry",
        value: { version: 2, items: ["blocked"] },
        outputPath: copy,
        force: false,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      artifactError(error, "OUTPUT_EXISTS");
      return true;
    });
    expect(readFileSync(copy, "utf8")).toBe("KEEP");
    expect(readFileSync(artifactPath)).toEqual(original);

    const copied = await updateArtifactData({
      artifactPath,
      manifestPath,
      id: "registry",
      value: { version: 2, items: ["copied"] },
      outputPath: copy,
      force: true,
    });
    expect(copied.output).toBe(copy);
    expect(extractDataBlocks(readFileSync(copy, "utf8")).get("registry")).toEqual({
      items: ["copied"],
      version: 2,
    });
    expect(readFileSync(artifactPath)).toEqual(original);
    expect(temporaryNames(root)).toEqual([]);
  });

  it("protects dangling symlinks and build-time no-clobber races", async () => {
    const danglingRoot = fixture();
    const danglingArtifact = join(danglingRoot, "artifact.html");
    const danglingOutput = join(danglingRoot, "copy.html");
    await buildInteractiveArtifact({
      manifestPath: join(danglingRoot, "artifact.mjs"),
      outputPath: danglingArtifact,
      force: true,
    });
    symlinkSync("missing.html", danglingOutput);
    await expect(
      updateArtifactData({
        artifactPath: danglingArtifact,
        manifestPath: join(danglingRoot, "artifact.mjs"),
        id: "registry",
        value: {},
        outputPath: danglingOutput,
        force: false,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      artifactError(error, "OUTPUT_EXISTS");
      return true;
    });
    expect(lstatSync(danglingOutput).isSymbolicLink()).toBe(true);
    expect(readlinkSync(danglingOutput)).toBe("missing.html");

    const raceRoot = fixture();
    const raceArtifact = join(raceRoot, "artifact.html");
    const raceOutput = join(raceRoot, "copy.html");
    const raceManifest = join(raceRoot, "artifact.mjs");
    await buildInteractiveArtifact({
      manifestPath: raceManifest,
      outputPath: raceArtifact,
      force: true,
    });
    writeFileSync(
      join(raceRoot, "renderer.mjs"),
      `export function renderArtifact() {
        process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(raceOutput)}, "RACE-WINNER");
        return { mainSections: "<section>race</section>" };
      }`,
    );
    await expect(
      updateArtifactData({
        artifactPath: raceArtifact,
        manifestPath: raceManifest,
        id: "registry",
        value: {},
        outputPath: raceOutput,
        force: false,
        verifyDeterminism: false,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      artifactError(error, "OUTPUT_EXISTS");
      return true;
    });
    expect(readFileSync(raceOutput, "utf8")).toBe("RACE-WINNER");
    expect(temporaryNames(danglingRoot)).toEqual([]);
    expect(temporaryNames(raceRoot)).toEqual([]);
  });

  it("leaves the source and destination byte-identical after renderer failure", async () => {
    const root = fixture();
    const artifactPath = join(root, "artifact.html");
    const outputPath = join(root, "copy.html");
    const manifestPath = join(root, "artifact.mjs");
    await buildInteractiveArtifact({ manifestPath, outputPath: artifactPath, force: true });
    const sourceBefore = readFileSync(artifactPath);
    writeFileSync(outputPath, "KEEP");
    writeFileSync(
      join(root, "renderer.mjs"),
      'export function renderArtifact(){ throw new Error("private renderer failure"); }',
    );

    await expect(
      updateArtifactData({
        artifactPath,
        manifestPath,
        id: "registry",
        value: {},
        outputPath,
        force: true,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      artifactError(error, "INVALID_RENDERER_RESULT");
      return true;
    });
    expect(readFileSync(artifactPath)).toEqual(sourceBefore);
    expect(readFileSync(outputPath, "utf8")).toBe("KEEP");
    expect(temporaryNames(root)).toEqual([]);
  });
});

describe("Task 7 CLI", () => {
  it("updates the artifact in place when output and force are omitted", () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const artifactPath = join(root, "artifact.html");
    const inputPath = join(root, "replacement.json");
    parseSuccess(run(["build-artifact", manifestPath]));
    writeFileSync(inputPath, '{"version":2,"items":["in-place"]}');

    const result = parseSuccess(
      run([
        "update-data",
        artifactPath,
        "--manifest",
        manifestPath,
        "--id",
        "registry",
        "--input",
        inputPath,
      ]),
    );

    expect(result).toMatchObject({ command: "update-data", output: artifactPath });
    expect(
      extractDataBlocks(readFileSync(artifactPath, "utf8")).get("registry"),
    ).toEqual({ items: ["in-place"], version: 2 });
  }, 20_000);

  it("does not clobber an alternate output when force is omitted", () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const artifactPath = join(root, "artifact.html");
    const inputPath = join(root, "replacement.json");
    const outputPath = join(root, "copy.html");
    parseSuccess(run(["build-artifact", manifestPath]));
    writeFileSync(inputPath, '{"version":2,"items":["blocked"]}');
    writeFileSync(outputPath, "KEEP");

    const failure = parseFailure(
      run([
        "update-data",
        artifactPath,
        "--manifest",
        manifestPath,
        "--id",
        "registry",
        "--input",
        inputPath,
        "--output",
        outputPath,
      ]),
    );

    expect(failure.error.code).toBe("OUTPUT_EXISTS");
    expect(readFileSync(outputPath, "utf8")).toBe("KEEP");
  }, 20_000);

  it("replaces an alternate output when force is provided", () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const artifactPath = join(root, "artifact.html");
    const inputPath = join(root, "replacement.json");
    const outputPath = join(root, "copy.html");
    parseSuccess(run(["build-artifact", manifestPath]));
    writeFileSync(inputPath, '{"version":2,"items":["forced"]}');
    writeFileSync(outputPath, "KEEP");

    const result = parseSuccess(
      run([
        "update-data",
        artifactPath,
        "--manifest",
        manifestPath,
        "--id",
        "registry",
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--force",
      ]),
    );

    expect(result).toMatchObject({ command: "update-data", output: outputPath });
    expect(
      extractDataBlocks(readFileSync(outputPath, "utf8")).get("registry"),
    ).toEqual({ items: ["forced"], version: 2 });
  }, 20_000);

  it("preserves data during shell rebuild and reports one structured result", async () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const output = join(root, "artifact.html");
    await buildInteractiveArtifact({ manifestPath, outputPath: output, force: true });
    await updateArtifactData({
      artifactPath: output,
      manifestPath,
      id: "registry",
      value: { version: 2, items: ["beta"] },
    });
    writeFileSync(join(root, "registry.json"), '{"version":999,"items":["stale"]}');

    const result = parseSuccess(
      run([
        "build-artifact",
        manifestPath,
        "--output",
        output,
        "--preserve-data-from",
        output,
        "--force",
      ]),
    );
    expect(result).toMatchObject({ ok: true, command: "build-artifact", output });
    expect(extractDataBlocks(readFileSync(output, "utf8")).get("registry")).toEqual({
      items: ["beta"],
      version: 2,
    });
  }, 20_000);

  it("updates from strict JSON in the isolated worker and contains consumer streams", () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const output = join(root, "artifact.html");
    const input = join(root, "replacement.json");
    parseSuccess(run(["build-artifact", manifestPath]));
    writeFileSync(input, '{"version":2,"items":["cli"]}');
    writeFileSync(
      join(root, "renderer.mjs"),
      `export function renderArtifact({ data }) {
        process.stdout.write("forged stdout\\n");
        process.stderr.write("forged stderr\\n");
        console.log("console stdout");
        console.error("console stderr");
        return { mainSections: '<section>' + data.registry.items.join(',') + '</section>' };
      }`,
    );

    const result = parseSuccess(
      run([
        "update-data",
        output,
        "--manifest",
        manifestPath,
        "--id",
        "registry",
        "--input",
        input,
        "--force",
      ]),
    );
    expect(Object.keys(result)).toEqual([
      "ok",
      "command",
      "mode",
      "output",
      "title",
      "bytes",
      "sourceHash",
      "outputHash",
      "dataBlockIds",
    ]);
    expect(result).toMatchObject({
      ok: true,
      command: "update-data",
      output,
      dataBlockIds: ["extra", "registry", "settings"],
    });
    expect(readFileSync(output, "utf8")).toContain("cli");
  }, 20_000);

  it("returns one structured error for malformed, non-JSON, and invalid UTF-8 input", () => {
    const root = fixture();
    const manifestPath = join(root, "artifact.mjs");
    const output = join(root, "artifact.html");
    parseSuccess(run(["build-artifact", manifestPath]));

    for (const [name, bytes] of [
      ["malformed.json", Buffer.from('{"bad":')],
      ["non-json.json", Buffer.from("undefined")],
      ["invalid-utf8.json", Buffer.from([0xc3, 0x28])],
    ] as const) {
      const input = join(root, name);
      writeFileSync(input, bytes);
      const before = readFileSync(output);
      const failure = parseFailure(
        run([
          "update-data",
          output,
          "--manifest",
          manifestPath,
          "--id",
          "registry",
          "--input",
          input,
          "--force",
        ]),
      );
      expect(["ARTIFACT_READ_FAILED", "INVALID_DATA_BLOCK"]).toContain(
        failure.error.code,
      );
      expect(readFileSync(output)).toEqual(before);
    }
    expect(temporaryNames(root)).toEqual([]);
  }, 30_000);

  it.each([
    ["unknown flag", ["update-data", "a.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json", "--wat"]],
    ["missing value", ["update-data", "a.html", "--manifest", "--force", "--id", "x", "--input", "x.json"]],
    ["missing required flag", ["update-data", "a.html", "--manifest", "a.mjs", "--input", "x.json"]],
    ["duplicate manifest", ["update-data", "a.html", "--manifest", "a.mjs", "--manifest", "b.mjs", "--id", "x", "--input", "x.json"]],
    ["duplicate id", ["update-data", "a.html", "--manifest", "a.mjs", "--id", "x", "--id", "y", "--input", "x.json"]],
    ["duplicate input", ["update-data", "a.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json", "--input", "y.json"]],
    ["duplicate output", ["update-data", "a.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json", "--output", "a", "--output", "b"]],
    ["duplicate force", ["update-data", "a.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json", "--force", "--force"]],
    ["extra positional", ["update-data", "a.html", "b.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json"]],
    ["short flag", ["update-data", "a.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json", "-x"]],
    ["separator", ["update-data", "--", "a.html", "--manifest", "a.mjs", "--id", "x", "--input", "x.json"]],
    ["duplicate preserve", ["build-artifact", "a.mjs", "--preserve-data-from", "a.html", "--preserve-data-from", "b.html"]],
    ["missing preserve value", ["build-artifact", "a.mjs", "--preserve-data-from", "--force"]],
  ])("strictly rejects %s", (_label, args) => {
    expect(parseFailure(run(args)).error.code).toBe("INVALID_CLI_ARGUMENTS");
  });
});
