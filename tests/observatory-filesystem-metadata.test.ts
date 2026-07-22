import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectSystemMetadataFromRoots } from "@/lib/observatory/filesystem-metadata";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("collectSystemMetadataFromRoots", () => {
  it("emits metadata-only rules, profiles, knowledge areas, agendas, and config", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-metadata-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const configPath = join(root, "openclaw.json");
    await mkdir(join(workspaceRoot, "plato", "browser-profiles", "podcast"), { recursive: true });
    await mkdir(join(vaultRoot, "plato-academy"), { recursive: true });
    await writeFile(join(workspaceRoot, "plato", "AGENTS.md"), "secret rule content");
    await writeFile(join(workspaceRoot, "plato", "USER.md"), "private user content");
    await writeFile(join(vaultRoot, "plato-academy", "agenda.md"), "private agenda content");
    await writeFile(configPath, '{"token":"secret-config"}');

    const result = await collectSystemMetadataFromRoots({
      workspaceRoot,
      vaultRoot,
      configPath,
    });

    expect(result.map((item) => [item.kind, item.id])).toEqual([
      ["agenda", "agenda:plato-academy"],
      ["config", "config:openclaw"],
      ["knowledge", "knowledge:plato-academy"],
      ["profile", "profile:plato:podcast"],
      ["rule", "rule:plato:agents"],
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /secret rule|private user|private agenda|secret-config|USER\.md|observatory-metadata-/u,
    );
    expect(result.every((item) => !item.source.startsWith("/"))).toBe(true);
  });

  it("ignores symlinked files and directories instead of following escapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-metadata-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const outside = join(root, "outside");
    await mkdir(join(workspaceRoot, "plato"), { recursive: true });
    await mkdir(vaultRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "AGENTS.md"), "private");
    await symlink(join(outside, "AGENTS.md"), join(workspaceRoot, "plato", "AGENTS.md"));
    await symlink(outside, join(workspaceRoot, "plato", "browser-profiles"));

    const result = await collectSystemMetadataFromRoots({ workspaceRoot, vaultRoot });

    expect(result).toEqual([]);
  });

  it("rejects a missing or non-directory explicit root", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-metadata-"));
    roots.push(root);
    const file = join(root, "not-a-directory");
    await writeFile(file, "x");

    await expect(
      collectSystemMetadataFromRoots({
        workspaceRoot: file,
        vaultRoot: join(root, "missing"),
      }),
    ).rejects.toThrow(/explicit root/u);
  });
});
