import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { collectSourceRepositories } from "@/lib/observatory/source-repository-discovery";

const execute = promisify(execFile);
const roots: string[] = [];
const collectedAt = "2026-07-23T12:00:00.000Z";

async function gitWithDate(path: string, date: string, ...args: string[]) {
  await execute("git", ["-C", path, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
}

async function git(path: string, ...args: string[]) {
  await gitWithDate(path, "2026-07-22T12:00:00.000Z", ...args);
}

async function createRepository(
  path: string,
  remote: string,
  commitDate = "2026-07-22T12:00:00.000Z",
) {
  await mkdir(path, { recursive: true });
  await git(path, "init", "-b", "main");
  await writeFile(join(path, "README.md"), "private repository content");
  await git(path, "add", "README.md");
  await gitWithDate(path, commitDate, "commit", "-m", "private commit message");
  await git(path, "remote", "add", "origin", remote);
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("collectSourceRepositories", () => {
  it("continues below a trusted root repository to find nested Agent repositories", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    await createRepository(
      workspaceRoot,
      "git@github.com:GlauconAI/workspace-control.git",
    );
    await createRepository(
      join(workspaceRoot, "plato", "projects", "nested-app"),
      "git@github.com:GlauconAI/nested-app.git",
    );
    await mkdir(vaultRoot, { recursive: true });

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories.map((repository) => repository.name)).toEqual(
      expect.arrayContaining(["workspace-control", "nested-app"]),
    );
    expect(result.repositories).toHaveLength(2);
  });

  it("adds a non-reversible suffix only when safe logical references collide", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    await mkdir(vaultRoot, { recursive: true });
    await createRepository(
      join(workspaceRoot, "plato", "projects", "first"),
      "git@github.com:GlauconAI/shared-name.git",
    );
    await createRepository(
      join(workspaceRoot, "plato", "experiments", "second"),
      "git@github.com:GlauconAI/shared-name.git",
    );

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      { now: () => new Date(collectedAt) },
    );

    const references = result.repositories.map(
      (repository) => repository.local_ref,
    );
    expect(new Set(references)).toHaveLength(2);
    expect(references).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^workspace\/plato\/shared-name-[a-f0-9]{10}$/u),
        expect.stringMatching(/^workspace\/plato\/shared-name-[a-f0-9]{10}$/u),
      ]),
    );
  });

  it("discovers repositories under both trusted roots and emits safe Git metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const workspaceRepository = join(
      workspaceRoot,
      "plato",
      "projects",
      "app",
    );
    const vaultRepository = join(
      vaultRoot,
      "plato-academy",
      "projects",
      "tool",
    );
    await createRepository(
      workspaceRepository,
      "https://user:token@github.com/GlauconAI/app.git?secret=1",
    );
    await createRepository(
      vaultRepository,
      "git@github.com:GlauconAI/tool.git",
    );
    await writeFile(join(workspaceRepository, "secret-untracked.txt"), "secret");

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [
          {
            owner: "Plato",
            projects: [
              {
                project_key: "plato/app",
                name: "app",
                title: "Application",
              },
            ],
          },
        ],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories.map((item) => item.scope)).toEqual([
      "vault",
      "workspace",
    ]);
    expect(result.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "app",
          maintainer_agent_id: "plato",
          knowledge_area: null,
          github: {
            owner: "GlauconAI",
            repo: "app",
            url: "https://github.com/GlauconAI/app",
          },
          working_tree: "dirty",
          activity: "active",
          registry_project_keys: ["plato/app"],
        }),
        expect.objectContaining({
          name: "tool",
          maintainer_agent_id: null,
          knowledge_area: "plato-academy",
          github: {
            owner: "GlauconAI",
            repo: "tool",
            url: "https://github.com/GlauconAI/tool",
          },
          working_tree: "clean",
          activity: "active",
          registry_project_keys: [],
        }),
      ]),
    );
    expect(result.source_health).toMatchObject({
      status: "fresh",
      health: "healthy",
      repository_count: 2,
      omitted_count: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /user:token|secret=1|observatory-repositories-|private commit|fixture@example|secret-untracked/u,
    );
  });

  it("does not follow symlinked directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const outside = join(root, "outside");
    await mkdir(join(workspaceRoot, "plato"), { recursive: true });
    await mkdir(vaultRoot, { recursive: true });
    await createRepository(outside, "git@github.com:Private/escaped.git");
    await symlink(outside, join(workspaceRoot, "plato", "escaped"));

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories).toEqual([]);
  });

  it("disables repository-configured filesystem monitor commands", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const repository = join(workspaceRoot, "plato", "projects", "app");
    const marker = join(root, "fsmonitor-ran");
    const monitor = join(root, "fsmonitor.sh");
    await mkdir(vaultRoot, { recursive: true });
    await createRepository(
      repository,
      "git@github.com:GlauconAI/app.git",
    );
    await writeFile(monitor, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`);
    await chmod(monitor, 0o755);
    await git(repository, "config", "core.fsmonitor", monitor);

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories).toHaveLength(1);
    await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a .git file whose Git directory escapes both trusted roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const outside = join(root, "outside");
    const linked = join(workspaceRoot, "plato", "linked");
    await mkdir(linked, { recursive: true });
    await mkdir(vaultRoot, { recursive: true });
    await createRepository(outside, "git@github.com:Private/escaped.git");
    await writeFile(join(linked, ".git"), `gitdir: ${join(outside, ".git")}\n`);

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories).toEqual([]);
    expect(result.source_health).toMatchObject({
      health: "degraded",
      omitted_count: 1,
    });
  });

  it("deduplicates linked worktrees by their common Git directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const original = join(workspaceRoot, "plato", "original");
    const linked = join(workspaceRoot, "plato", "linked");
    await mkdir(vaultRoot, { recursive: true });
    await createRepository(original, "git@github.com:GlauconAI/original.git");
    await git(original, "worktree", "add", "-b", "linked", linked);

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories).toHaveLength(1);
    expect(result.source_health.omitted_count).toBe(1);
  });

  it("reports detached, stale, local-only repositories without guessing mappings", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    const repository = join(workspaceRoot, "plato", "projects", "app");
    await mkdir(vaultRoot, { recursive: true });
    await createRepository(
      repository,
      "https://gitlab.example.invalid/Private/app.git",
      "2025-01-01T12:00:00.000Z",
    );
    await git(repository, "checkout", "--detach");

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [
          {
            projects: [
              {
                project_key: "plato/application",
                name: "application",
                title: "Application service",
              },
            ],
          },
        ],
      },
      { now: () => new Date(collectedAt) },
    );

    expect(result.repositories[0]).toMatchObject({
      github: null,
      current_branch: null,
      detached: true,
      activity: "stale",
      archive_state: "unknown",
      registry_project_keys: [],
    });
  });

  it("fails with a sanitized diagnostic when traversal exceeds its bound", async () => {
    const root = await mkdtemp(join(tmpdir(), "observatory-repositories-"));
    roots.push(root);
    const workspaceRoot = join(root, "workspace");
    const vaultRoot = join(root, "vault");
    await mkdir(join(workspaceRoot, "plato"), { recursive: true });
    await mkdir(vaultRoot, { recursive: true });

    const result = await collectSourceRepositories(
      {
        workspaceRoot,
        vaultRoot,
        agents: [{ id: "plato" }],
        projectGroups: [],
      },
      {
        now: () => new Date(collectedAt),
        maxDirectories: 1,
      },
    );

    expect(result).toEqual({
      repositories: [],
      source_health: {
        status: "failed",
        health: "failed",
        collected_at: collectedAt,
        last_success_at: null,
        repository_count: 0,
        omitted_count: 0,
        error_code: "SOURCE_LIMIT_EXCEEDED",
      },
    });
  });
});
