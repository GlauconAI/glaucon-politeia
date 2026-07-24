import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import {
  OBSERVATORY_SOURCE_REPOSITORY_MAX_ITEMS,
  ObservatoryGitHubRepositorySchema,
  ObservatorySourceRepositoryInventorySchema,
  ObservatorySourceRepositorySchema,
  type ObservatoryGitHubRepository,
  type ObservatorySourceRepository,
  type ObservatorySourceRepositoryInventory,
} from "#observatory-source-repository-schema";

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_DIRECTORIES = 50_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_COMMAND_OUTPUT_BYTES = 5 * 1024 * 1024;
const ACTIVE_WINDOW_MS = 180 * 24 * 60 * 60 * 1_000;
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".cache",
  ".worktrees",
  "worktrees",
  "__pycache__",
]);

type RepositoryScope = "workspace" | "vault";

interface RepositoryAgent {
  id: string;
}

interface RepositoryProject {
  project_key: string;
  name: string;
  title?: string;
}

interface RepositoryProjectGroup {
  owner?: string;
  focus?: string;
  projects: readonly RepositoryProject[];
}

interface GitResult {
  exitCode: number;
  stdout: string;
  timedOut?: boolean;
  outputLimitExceeded?: boolean;
}

type GitRunner = (
  repositoryPath: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<GitResult>;

interface SourceRepositoryDependencies {
  now(): Date;
  runGit?: GitRunner;
  maxDepth?: number;
  maxDirectories?: number;
  maxRepositories?: number;
  commandTimeoutMs?: number;
  maxCommandOutputBytes?: number;
}

interface SourceRepositoryInput {
  workspaceRoot: string;
  vaultRoot: string;
  agents: readonly RepositoryAgent[];
  projectGroups: readonly RepositoryProjectGroup[];
}

interface TrustedRoot {
  scope: RepositoryScope;
  path: string;
}

interface TraversalCandidate {
  scope: RepositoryScope;
  repositoryPath: string;
  relativeSegments: string[];
}

class SourceRepositoryCollectionError extends Error {
  readonly code:
    | "SOURCE_ROOT_UNAVAILABLE"
    | "SOURCE_LIMIT_EXCEEDED"
    | "SOURCE_OUTPUT_INVALID";

  constructor(code: SourceRepositoryCollectionError["code"]) {
    super(code);
    this.code = code;
  }
}

function logicalToken(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 160);
  return normalized || fallback;
}

function mappingToken(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function safeLine(value: string): string | null {
  const line = value.split(/\r?\n/u, 1)[0]?.trim();
  if (!line || /[\u0000-\u001f\u007f]/u.test(line)) return null;
  return line.slice(0, 512);
}

function isInside(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return (
    difference === "" ||
    (!difference.startsWith("..") && !isAbsolute(difference))
  );
}

async function assertTrustedRoot(
  scope: RepositoryScope,
  path: string,
): Promise<TrustedRoot> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new SourceRepositoryCollectionError("SOURCE_ROOT_UNAVAILABLE");
    }
    return { scope, path: await realpath(path) };
  } catch (error) {
    if (error instanceof SourceRepositoryCollectionError) throw error;
    throw new SourceRepositoryCollectionError("SOURCE_ROOT_UNAVAILABLE");
  }
}

function defaultGitRunner(
  repositoryPath: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<GitResult> {
  return new Promise((resolveResult) => {
    execFile(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-C",
        repositoryPath,
        ...args,
      ],
      {
        env: {
          ...process.env,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
        },
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout) => {
        const failure = error as
          | (Error & { code?: number | string; killed?: boolean })
          | null;
        resolveResult({
          exitCode:
            failure === null
              ? 0
              : typeof failure.code === "number"
                ? failure.code
                : 1,
          stdout: String(stdout),
          timedOut: failure?.killed === true,
          outputLimitExceeded:
            failure?.message.includes("maxBuffer") === true,
        });
      },
    );
  });
}

async function hasGitMarker(path: string): Promise<boolean> {
  try {
    const marker = await lstat(join(path, ".git"));
    return (
      !marker.isSymbolicLink() && (marker.isDirectory() || marker.isFile())
    );
  } catch {
    return false;
  }
}

function shouldSkipDirectory(name: string): boolean {
  return (
    name.startsWith(".") ||
    SKIPPED_DIRECTORIES.has(name) ||
    name.endsWith(".app")
  );
}

async function discoverCandidates(
  roots: readonly TrustedRoot[],
  limits: {
    maxDepth: number;
    maxDirectories: number;
    maxRepositories: number;
  },
): Promise<TraversalCandidate[]> {
  const candidates: TraversalCandidate[] = [];
  let visitedDirectories = 0;

  for (const root of roots) {
    const queue = [{ path: root.path, depth: 0, relativeSegments: [] as string[] }];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (!current) continue;
      visitedDirectories += 1;
      if (visitedDirectories > limits.maxDirectories) {
        throw new SourceRepositoryCollectionError("SOURCE_LIMIT_EXCEEDED");
      }
      if (await hasGitMarker(current.path)) {
        candidates.push({
          scope: root.scope,
          repositoryPath: current.path,
          relativeSegments: current.relativeSegments,
        });
        if (candidates.length > limits.maxRepositories) {
          throw new SourceRepositoryCollectionError("SOURCE_LIMIT_EXCEEDED");
        }
      }
      if (current.depth >= limits.maxDepth) continue;

      let entries;
      try {
        entries = await readdir(current.path, { withFileTypes: true });
      } catch {
        continue;
      }
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            !shouldSkipDirectory(entry.name),
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .forEach((entry) => {
          queue.push({
            path: join(current.path, entry.name),
            depth: current.depth + 1,
            relativeSegments: [...current.relativeSegments, entry.name],
          });
        });
    }
  }

  return candidates;
}

function parseGitHubRemote(value: string | null): ObservatoryGitHubRepository | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/[?#].*$/u, "");
  let owner: string | undefined;
  let repo: string | undefined;

  const scpMatch = trimmed.match(
    /^(?:[^@/]+@)?github\.com[:/]([^/]+)\/([^/]+)$/iu,
  );
  if (scpMatch) {
    [, owner, repo] = scpMatch;
  } else {
    try {
      const url = new URL(trimmed);
      if (url.hostname.toLocaleLowerCase() !== "github.com") return null;
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length !== 2) return null;
      [owner, repo] = segments;
    } catch {
      return null;
    }
  }

  if (!owner || !repo) return null;
  repo = repo.replace(/\.git$/iu, "");
  const candidate = {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
  const result = ObservatoryGitHubRepositorySchema.safeParse(candidate);
  return result.success ? result.data : null;
}

function projectKeysFor(
  repositoryName: string,
  projectGroups: readonly RepositoryProjectGroup[],
): string[] {
  const repositoryToken = mappingToken(repositoryName);
  const matches = projectGroups.flatMap((group) =>
    group.projects.filter((project) => {
      const keySuffix = project.project_key.split("/").at(-1) ?? "";
      return [keySuffix, project.name, project.title ?? ""]
        .map(mappingToken)
        .some((candidate) => candidate.length > 0 && candidate === repositoryToken);
    }),
  );
  return matches.length === 1 ? [matches[0]!.project_key] : [];
}

function activityFor(
  lastCommitAt: string | null,
  now: Date,
): ObservatorySourceRepository["activity"] {
  if (!lastCommitAt) return "unknown";
  const timestamp = Date.parse(lastCommitAt);
  if (!Number.isFinite(timestamp)) return "unknown";
  return now.getTime() - timestamp <= ACTIVE_WINDOW_MS ? "active" : "stale";
}

function timestamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function localReference(
  scope: RepositoryScope,
  relativeSegments: readonly string[],
  repositoryName: string,
): string {
  const owner =
    logicalToken(relativeSegments[0] ?? "unknown", "unknown") ||
    "unknown";
  const repository = logicalToken(repositoryName, "repository");
  return `${scope}/${owner}/${repository}`;
}

function disambiguateLocalReferences(
  repositories: readonly ObservatorySourceRepository[],
): ObservatorySourceRepository[] {
  const counts = new Map<string, number>();
  repositories.forEach((repository) => {
    counts.set(
      repository.local_ref,
      (counts.get(repository.local_ref) ?? 0) + 1,
    );
  });
  return repositories.map((repository) =>
    (counts.get(repository.local_ref) ?? 0) > 1
      ? ObservatorySourceRepositorySchema.parse({
          ...repository,
          local_ref: `${repository.local_ref}-${repository.id
            .slice("repository:".length)
            .slice(0, 10)}`,
        })
      : repository,
  );
}

async function collectCandidate(
  candidate: TraversalCandidate,
  roots: readonly TrustedRoot[],
  agents: ReadonlySet<string>,
  projectGroups: readonly RepositoryProjectGroup[],
  runGit: GitRunner,
  timeoutMs: number,
  consumeOutput: (value: string) => void,
  now: Date,
): Promise<{ repository: ObservatorySourceRepository; commonDirectory: string } | null> {
  const command = async (args: readonly string[], allowEmpty = false) => {
    const result = await runGit(candidate.repositoryPath, args, timeoutMs);
    consumeOutput(result.stdout);
    if (
      result.exitCode !== 0 ||
      result.timedOut ||
      result.outputLimitExceeded
    ) {
      return null;
    }
    if (allowEmpty && result.stdout.trim().length === 0) return "";
    return result.exitCode === 0 &&
      !result.timedOut &&
      !result.outputLimitExceeded
      ? safeLine(result.stdout)
      : null;
  };

  const gitDirectoryOutput = await command(["rev-parse", "--absolute-git-dir"]);
  if (!gitDirectoryOutput || !isAbsolute(gitDirectoryOutput)) return null;
  let gitDirectory: string;
  try {
    gitDirectory = await realpath(gitDirectoryOutput);
  } catch {
    return null;
  }
  if (!roots.some((root) => isInside(root.path, gitDirectory))) return null;

  const commonDirectoryOutput = await command([
    "rev-parse",
    "--git-common-dir",
  ]);
  if (!commonDirectoryOutput) return null;
  let commonDirectory: string;
  try {
    commonDirectory = await realpath(
      isAbsolute(commonDirectoryOutput)
        ? commonDirectoryOutput
        : resolve(candidate.repositoryPath, commonDirectoryOutput),
    );
  } catch {
    return null;
  }
  if (!roots.some((root) => isInside(root.path, commonDirectory))) return null;

  const [
    headCandidate,
    branchCandidate,
    defaultBranchCandidate,
    lastCommitCandidate,
    statusCandidate,
    remoteCandidate,
  ] = await Promise.all([
    command(["rev-parse", "--verify", "HEAD"]),
    command(["symbolic-ref", "--quiet", "--short", "HEAD"]),
    command([
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD",
    ]),
    command(["log", "-1", "--format=%cI"]),
    command(["status", "--porcelain=v1", "--untracked-files=normal"], true),
    command(["remote", "get-url", "origin"]),
  ]);
  const head =
    headCandidate && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(headCandidate)
      ? headCandidate
      : null;
  const currentBranch = branchCandidate
    ? branchCandidate.slice(0, 512)
    : null;
  const defaultBranch = defaultBranchCandidate
    ? defaultBranchCandidate.replace(/^origin\//u, "").slice(0, 512)
    : null;
  const lastCommitAt = timestamp(lastCommitCandidate);
  const github = parseGitHubRemote(remoteCandidate);
  const repositoryName = github?.repo ?? basename(candidate.repositoryPath);
  const scopeOwner = candidate.relativeSegments[0] ?? "";
  const maintainerAgentId =
    candidate.scope === "workspace" && agents.has(scopeOwner)
      ? scopeOwner
      : null;
  const knowledgeArea =
    candidate.scope === "vault" && scopeOwner ? scopeOwner.slice(0, 512) : null;
  const workingTree =
    statusCandidate === null
      ? "unknown"
      : statusCandidate.length === 0
        ? "clean"
        : "dirty";
  const collectedAt = now.toISOString();
  const repository = ObservatorySourceRepositorySchema.parse({
    id: `repository:${createHash("sha256")
      .update(`${candidate.scope}:${commonDirectory}`)
      .digest("hex")
      .slice(0, 24)}`,
    name: repositoryName.slice(0, 512),
    scope: candidate.scope,
    local_ref: localReference(
      candidate.scope,
      candidate.relativeSegments,
      repositoryName,
    ),
    maintainer_agent_id: maintainerAgentId,
    knowledge_area: knowledgeArea,
    github,
    current_branch: currentBranch,
    detached: head !== null && currentBranch === null,
    head,
    default_branch: defaultBranch,
    last_commit_at: lastCommitAt,
    working_tree: workingTree,
    activity: activityFor(lastCommitAt, now),
    archive_state: "unknown",
    registry_project_keys: projectKeysFor(repositoryName, projectGroups),
    authority: "observed",
    source:
      candidate.scope === "workspace"
        ? "local-git/workspace"
        : "local-git/vault",
    collected_at: collectedAt,
    health:
      head !== null && workingTree !== "unknown" ? "healthy" : "degraded",
  });
  return { repository, commonDirectory };
}

function failedInventory(
  collectedAt: string,
  code: SourceRepositoryCollectionError["code"],
): ObservatorySourceRepositoryInventory {
  return ObservatorySourceRepositoryInventorySchema.parse({
    repositories: [],
    source_health: {
      status: "failed",
      health: "failed",
      collected_at: collectedAt,
      last_success_at: null,
      repository_count: 0,
      omitted_count: 0,
      error_code: code,
    },
  });
}

export async function collectSourceRepositories(
  input: SourceRepositoryInput,
  dependencies: SourceRepositoryDependencies,
): Promise<ObservatorySourceRepositoryInventory> {
  const now = dependencies.now();
  const collectedAt = now.toISOString();
  try {
    const roots = await Promise.all([
      assertTrustedRoot("workspace", input.workspaceRoot),
      assertTrustedRoot("vault", input.vaultRoot),
    ]);
    const candidates = await discoverCandidates(roots, {
      maxDepth: dependencies.maxDepth ?? DEFAULT_MAX_DEPTH,
      maxDirectories:
        dependencies.maxDirectories ?? DEFAULT_MAX_DIRECTORIES,
      maxRepositories:
        dependencies.maxRepositories ?? OBSERVATORY_SOURCE_REPOSITORY_MAX_ITEMS,
    });
    const runGit = dependencies.runGit ?? defaultGitRunner;
    const timeoutMs =
      dependencies.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
    const maxOutput =
      dependencies.maxCommandOutputBytes ??
      DEFAULT_MAX_COMMAND_OUTPUT_BYTES;
    let outputBytes = 0;
    const consumeOutput = (value: string) => {
      outputBytes += Buffer.byteLength(value, "utf8");
      if (outputBytes > maxOutput) {
        throw new SourceRepositoryCollectionError("SOURCE_OUTPUT_INVALID");
      }
    };
    const agentIds = new Set(input.agents.map((agent) => agent.id));
    const repositories: ObservatorySourceRepository[] = [];
    const commonDirectories = new Set<string>();
    let omittedCount = 0;

    for (const candidate of candidates) {
      try {
        const collected = await collectCandidate(
          candidate,
          roots,
          agentIds,
          input.projectGroups,
          runGit,
          timeoutMs,
          consumeOutput,
          now,
        );
        if (!collected || commonDirectories.has(collected.commonDirectory)) {
          omittedCount += 1;
          continue;
        }
        commonDirectories.add(collected.commonDirectory);
        repositories.push(collected.repository);
      } catch (error) {
        if (error instanceof SourceRepositoryCollectionError) throw error;
        omittedCount += 1;
      }
    }

    const disambiguatedRepositories =
      disambiguateLocalReferences(repositories);
    disambiguatedRepositories.sort((left, right) =>
      left.scope === right.scope
        ? left.local_ref.localeCompare(right.local_ref)
        : left.scope.localeCompare(right.scope),
    );
    return ObservatorySourceRepositoryInventorySchema.parse({
      repositories: disambiguatedRepositories,
      source_health: {
        status: "fresh",
        health: omittedCount > 0 ? "degraded" : "healthy",
        collected_at: collectedAt,
        last_success_at: collectedAt,
        repository_count: disambiguatedRepositories.length,
        omitted_count: omittedCount,
      },
    });
  } catch (error) {
    return failedInventory(
      collectedAt,
      error instanceof SourceRepositoryCollectionError
        ? error.code
        : "SOURCE_OUTPUT_INVALID",
    );
  }
}
