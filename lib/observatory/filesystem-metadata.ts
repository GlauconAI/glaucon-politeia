import { lstat, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import type { SystemMetadataEntry } from "#observatory-system-collector";

const MAX_ROOT_ENTRIES = 256;
const MAX_PROFILE_ENTRIES = 256;
const RULE_FILES = [
  "AGENTS.md",
  "SOUL.md",
  "IDENTITY.md",
  "TOOLS.md",
  "HEARTBEAT.md",
] as const;

function token(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 160);
  return normalized || fallback;
}

async function assertDirectory(path: string): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new Error("The explicit root configured for System Observatory is unavailable.");
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("The explicit root configured for System Observatory must be a real directory.");
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const metadata = await lstat(path);
    return metadata.isFile() && !metadata.isSymbolicLink();
  } catch {
    return false;
  }
}

async function realDirectories(path: string, limit: number) {
  const entries = await readdir(path, { withFileTypes: true });
  if (entries.length > limit) {
    throw new Error("A System Observatory metadata root exceeded its entry limit.");
  }
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        !entry.name.startsWith("."),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

function entry(
  value: SystemMetadataEntry,
): SystemMetadataEntry {
  return value;
}

export async function collectSystemMetadataFromRoots(input: {
  workspaceRoot: string;
  vaultRoot: string;
  configPath?: string;
}): Promise<SystemMetadataEntry[]> {
  await Promise.all([
    assertDirectory(input.workspaceRoot),
    assertDirectory(input.vaultRoot),
  ]);
  const result: SystemMetadataEntry[] = [];
  const agentDirectories = await realDirectories(
    input.workspaceRoot,
    MAX_ROOT_ENTRIES,
  );

  for (const agentDirectory of agentDirectories) {
    const owner = token(agentDirectory.name, "unknown-agent");
    const agentRoot = join(input.workspaceRoot, agentDirectory.name);
    for (const filename of RULE_FILES) {
      if (!(await isRegularFile(join(agentRoot, filename)))) continue;
      result.push(
        entry({
          kind: "rule",
          id: `rule:${owner}:${token(filename.replace(/\.md$/iu, ""), "rule")}`,
          name: filename,
          owner,
          source: `workspace/${owner}/${filename}`,
          summary: "Present · metadata only",
          health: "healthy",
        }),
      );
    }

    for (const profileParent of ["browser-profiles", ".browser-profiles"]) {
      const profileRoot = join(agentRoot, profileParent);
      let metadata;
      try {
        metadata = await lstat(profileRoot);
      } catch {
        continue;
      }
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) continue;
      for (const profile of await realDirectories(
        profileRoot,
        MAX_PROFILE_ENTRIES,
      )) {
        const profileId = token(profile.name, "profile");
        result.push(
          entry({
            kind: "profile",
            id: `profile:${owner}:${profileId}`,
            name: profile.name,
            owner,
            source: `workspace/${owner}/profiles/${profileId}`,
            summary: "Profile directory present · metadata only",
            health: "healthy",
          }),
        );
      }
    }
  }

  const knowledgeDirectories = await realDirectories(
    input.vaultRoot,
    MAX_ROOT_ENTRIES,
  );
  for (const knowledgeDirectory of knowledgeDirectories) {
    if (
      knowledgeDirectory.name.startsWith("📥") ||
      knowledgeDirectory.name.startsWith("🧐")
    ) {
      continue;
    }
    const knowledgeId = token(knowledgeDirectory.name, "knowledge-area");
    const owner = knowledgeId;
    result.push(
      entry({
        kind: "knowledge",
        id: `knowledge:${knowledgeId}`,
        name: knowledgeDirectory.name,
        owner,
        source: `vault/${knowledgeId}`,
        summary: "Knowledge area present · metadata only",
        health: "healthy",
      }),
    );
    if (
      await isRegularFile(
        join(input.vaultRoot, knowledgeDirectory.name, "agenda.md"),
      )
    ) {
      result.push(
        entry({
          kind: "agenda",
          id: `agenda:${knowledgeId}`,
          name: `${knowledgeDirectory.name} agenda`,
          owner,
          source: `vault/${knowledgeId}/agenda.md`,
          summary: "Agenda present · metadata only",
          health: "healthy",
        }),
      );
    }
  }

  if (input.configPath && (await isRegularFile(input.configPath))) {
    result.push(
      entry({
        kind: "config",
        id: "config:openclaw",
        name: basename(input.configPath),
        owner: "OpenClaw",
        source: "openclaw/config",
        summary: "Configuration present · values excluded",
        health: "healthy",
      }),
    );
  }

  return result.sort((left, right) =>
    left.kind === right.kind
      ? left.id.localeCompare(right.id)
      : left.kind.localeCompare(right.kind),
  );
}
