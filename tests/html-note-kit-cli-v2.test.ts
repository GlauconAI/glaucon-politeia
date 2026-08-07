import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const cli = join(process.cwd(), "scripts", "html-note-kit.mjs");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "html-kit-cli-v2-"));
  roots.push(root);
  return root;
}

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function writeProject(options: { script?: string; renderer?: string } = {}) {
  const root = temporaryRoot();
  writeFileSync(join(root, "data.json"), '{"items":["one"]}');
  writeFileSync(
    join(root, "renderer.mjs"),
    options.renderer ??
      'export function renderArtifact(){ return { mainSections: "<section>one</section>" }; }',
  );
  if (options.script !== undefined) {
    writeFileSync(join(root, "artifact.js"), options.script);
  }
  writeFileSync(
    join(root, "artifact.mjs"),
    `export default {
      contractVersion: 1,
      mode: "interactive",
      metadata: { title: "CLI fixture", description: "", eyebrow: "402v", lang: "en" },
      dataBlocks: [{ id: "registry", source: "./data.json" }],
      renderer: "./renderer.mjs",
      styles: [],
      scripts: ${options.script === undefined ? "[]" : '["./artifact.js"]'},
      svgAssets: [],
      requiredDataBlocks: ["registry"]
    };`,
  );
  return root;
}

function expectSingleJsonDocument(value: string) {
  const parsed = JSON.parse(value);
  expect(value).toBe(`${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

function parseSuccess(result: ReturnType<typeof run>) {
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.endsWith("\n")).toBe(true);
  return JSON.parse(result.stdout);
}

function parseFailure(result: ReturnType<typeof run>) {
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(result.stderr);
  expect(parsed).toMatchObject({ ok: false, error: { code: expect.any(String) } });
  expect(result.stderr.trimEnd()).toBe(JSON.stringify(parsed, null, 2));
  return parsed;
}

describe("HTML Note Kit v2 CLI", () => {
  it("builds to the default path and verifies without required-block flags", () => {
    const root = writeProject();
    const manifest = join(root, "artifact.mjs");
    const output = join(root, "artifact.html");

    const built = parseSuccess(run(["build-artifact", manifest]));
    expect(Object.keys(built)).toEqual([
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
    expect(built).toMatchObject({
      ok: true,
      command: "build-artifact",
      mode: "interactive",
      output,
      title: "CLI fixture",
      dataBlockIds: ["registry"],
    });
    expect(existsSync(output)).toBe(true);

    const verified = parseSuccess(run(["verify", output]));
    expect(verified).toEqual({
      ok: true,
      command: "verify",
      mode: "interactive",
      sourceHash: built.sourceHash,
      dataBlockIds: ["registry"],
      issues: [],
    });
  }, 10_000);

  it("supports an explicit output and force without clobbering by default", () => {
    const root = writeProject();
    const manifest = join(root, "artifact.mjs");
    const output = join(root, "custom.html");
    writeFileSync(output, "KEEP");

    const blocked = parseFailure(
      run(["build-artifact", manifest, "--output", output]),
    );
    expect(blocked.error.code).toBe("OUTPUT_EXISTS");
    expect(readFileSync(output, "utf8")).toBe("KEEP");

    const replaced = parseSuccess(
      run(["build-artifact", manifest, "--output", output, "--force"]),
    );
    expect(replaced.output).toBe(output);
    expect(readFileSync(output, "utf8")).toMatch(/^<!doctype html>/);
  });

  it("treats a dangling output symlink as existing", () => {
    const root = writeProject();
    const output = join(root, "artifact.html");
    symlinkSync("missing.html", output);

    const failed = parseFailure(run(["build-artifact", join(root, "artifact.mjs")]));
    expect(failed.error.code).toBe("OUTPUT_EXISTS");
    expect(lstatSync(output).isSymbolicLink()).toBe(true);
    expect(readlinkSync(output)).toBe("missing.html");
  });

  it("passes multiple required blocks in order and rejects missing, duplicate, and invalid IDs", () => {
    const root = writeProject();
    const output = join(root, "artifact.html");
    parseSuccess(run(["build-artifact", join(root, "artifact.mjs")]));

    const missing = parseFailure(
      run([
        "verify",
        output,
        "--required-block",
        "registry",
        "--required-block",
        "missing",
      ]),
    );
    expect(missing.error.code).toBe("ARTIFACT_VERIFICATION_FAILED");
    expect(missing.error.details.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MISSING_DATA_BLOCK" })]),
    );

    for (const args of [
      ["verify", output, "--required-block", "registry", "--required-block", "registry"],
      ["verify", output, "--required-block", "bad id"],
    ]) {
      const failed = parseFailure(run(args));
      expect(failed.error.code).toBe("ARTIFACT_VERIFICATION_FAILED");
      expect(failed.error.details.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "INVALID_VERIFICATION_OPTIONS" }),
        ]),
      );
    }
  }, 30_000);

  it.each([
    ["unknown flag", ["build-artifact", "artifact.mjs", "--wat"]],
    ["missing output value", ["build-artifact", "artifact.mjs", "--output", "--force"]],
    ["missing required-block value", ["verify", "artifact.html", "--required-block"]],
    ["extra positional", ["verify", "a.html", "b.html"]],
    ["duplicate output", ["build-artifact", "a.mjs", "--output", "a", "--output", "b"]],
    ["duplicate force", ["build-artifact", "a.mjs", "--force", "--force"]],
    ["short flag", ["verify", "a.html", "-x"]],
    ["separator", ["verify", "--", "a.html"]],
  ])("rejects %s with one structured error", (_label, args) => {
    const failed = parseFailure(run(args));
    expect(failed.error.code).toBe("INVALID_CLI_ARGUMENTS");
  });

  it("keeps outputs absent or byte-identical after manifest and startup failures", () => {
    const invalidRoot = writeProject({
      renderer: 'export function renderArtifact(){ throw new Error("secret renderer detail"); }',
    });
    const invalidOutput = join(invalidRoot, "artifact.html");
    const rendererFailure = parseFailure(
      run(["build-artifact", join(invalidRoot, "artifact.mjs")]),
    );
    expect(rendererFailure.error.code).toBe("INVALID_RENDERER_RESULT");
    expect(existsSync(invalidOutput)).toBe(false);

    const startupRoot = writeProject({ script: 'throw new Error("startup exploded");' });
    const startupOutput = join(startupRoot, "artifact.html");
    writeFileSync(startupOutput, "KEEP");
    const startupFailure = parseFailure(
      run([
        "build-artifact",
        join(startupRoot, "artifact.mjs"),
        "--output",
        startupOutput,
        "--force",
      ]),
    );
    expect(startupFailure.error.code).toBe("ARTIFACT_VERIFICATION_FAILED");
    expect(readFileSync(startupOutput, "utf8")).toBe("KEEP");
  });

  it("isolates direct, console, and scheduled consumer stream noise", () => {
    const root = writeProject({
      renderer: `export function renderArtifact() {
        process.stdout.write("forged stdout\\n");
        process.stderr.write("forged stderr\\n");
        console.log("console stdout");
        console.error("console stderr");
        setTimeout(() => {
          process.stdout.write('{"ok":false,"spoofed":true}\\n');
          process.stderr.write("late stderr\\n");
        }, 0);
        process.send?.({
          token: "0".repeat(64),
          kind: "result",
          payload: { ok: true, forged: true },
        });
        return { mainSections: "<section>isolated</section>" };
      }`,
    });

    const result = run(["build-artifact", join(root, "artifact.mjs")]);
    const parsed = expectSingleJsonDocument(result.stdout);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parsed).toMatchObject({ ok: true, command: "build-artifact" });
  });

  it("isolates consumer stream noise when the build fails", () => {
    const root = writeProject({
      renderer: `export function renderArtifact() {
        process.stdout.write("forged stdout before failure\\n");
        process.stderr.write("forged stderr before failure\\n");
        setTimeout(() => process.stdout.write("late forged stdout\\n"), 0);
        throw new Error("renderer failure");
      }`,
    });

    const result = run(["build-artifact", join(root, "artifact.mjs")]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const parsed = expectSingleJsonDocument(result.stderr);
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: "INVALID_RENDERER_RESULT" },
    });
  });

  it("normalizes an abnormal artifact worker exit", () => {
    const root = writeProject({
      renderer: "export function renderArtifact(){ process.exit(17); }",
    });

    const result = run(["build-artifact", join(root, "artifact.mjs")]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(expectSingleJsonDocument(result.stderr)).toMatchObject({
      ok: false,
      error: { code: "CLI_WORKER_FAILED" },
    });
  });

  it("preserves legacy help, result fields, and plain-text errors", () => {
    const root = temporaryRoot();
    const initializedRoot = join(root, "initialized");
    const markdown = join(root, "note.md");
    const html = join(root, "note.html");
    writeFileSync(markdown, "# Legacy\n");

    const help = run(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toContain(
      "  node scripts/html-note-kit.mjs init <directory> --title <title> [--force]\n" +
        "  node scripts/html-note-kit.mjs build <input.md> [--output <output.html>] [--force]\n",
    );

    const initialized = parseSuccess(
      run(["init", initializedRoot, "--title", "Legacy starter"]),
    );
    expect(Object.keys(initialized)).toEqual(["command", "source"]);
    expect(initialized).toEqual({
      command: "init",
      source: join(initializedRoot, "note.md"),
    });

    const built = parseSuccess(run(["build", markdown, "--output", html]));
    expect(Object.keys(built)).toEqual(["command", "source", "output", "title", "bytes"]);
    expect(built).toMatchObject({ command: "build", source: markdown, output: html });

    const missing = run(["build", join(root, "missing.md")]);
    expect(missing.status).toBe(1);
    expect(missing.stdout).toBe("");
    expect(missing.stderr).toBe(`Markdown input not found: ${join(root, "missing.md")}\n`);
    expect(() => JSON.parse(missing.stderr)).toThrow();
  });

  it("keeps legacy build validation and note rendering behavior through the public API", () => {
    const root = temporaryRoot();
    const wrongExtension = join(root, "note.txt");
    const markdown = join(root, "note.md");
    const output = join(root, "note.html");
    writeFileSync(wrongExtension, "# Wrong\n");
    writeFileSync(
      markdown,
      `# Compatibility

![Remote](https://example.com/image.png)

\`\`\`mermaid
flowchart LR
A[One] --> B[Two]
\`\`\`
`,
    );

    const wrong = run(["build", wrongExtension]);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toBe("Input must be a .md file\n");

    const builtResult = run(["build", markdown, "--output", output]);
    const built = parseSuccess(builtResult);
    const html = readFileSync(output, "utf8");
    expect(built.bytes).toBe(Buffer.byteLength(html));
    expect(html).toContain('src="https://example.com/image.png"');
    expect(html).toContain('data-diagram="flowchart"');

    rmSync(output);
    symlinkSync("missing-output.html", output);
    const dangling = run(["build", markdown, "--output", output]);
    expect(dangling.status).toBe(1);
    expect(dangling.stdout).toBe("");
    expect(dangling.stderr).toBe(`Output already exists: ${output}\n`);
    expect(lstatSync(output).isSymbolicLink()).toBe(true);
  });
});
