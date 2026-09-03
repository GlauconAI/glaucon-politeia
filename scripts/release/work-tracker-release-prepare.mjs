#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const EXPECTED_GIT_COMMON_DIR =
  "/Users/glaucon/.openclaw/workspace/.git/modules/plato/projects/glaucon-politeia";
export const EXPECTED_REMOTE_URL = "git@github.com:GlauconAI/glaucon-politeia.git";
export const GITHUB_REPOSITORY = "GlauconAI/glaucon-politeia";
export const RELEASE_BASELINE_REF = "refs/work-tracker-release/origin-main";
export const ALLOWED_BRANCH_PATTERN =
  /^(?:feat|fix|chore|ci|docs|refactor|test|perf)\/[a-z0-9][a-z0-9._/-]{0,100}$/u;

const FIXED_PR_BODY = [
  "## Summary",
  "",
  "Prepared by the Work Tracker host-owned release channel.",
  "",
  "## Verification",
  "",
  "- `npm run release:verify`",
].join("\n");
const GIT_EXECUTABLE = "/usr/bin/git";
const GH_EXECUTABLE = "/usr/local/bin/gh";
const SSH_COMMAND =
  "/usr/bin/ssh -F /dev/null -o BatchMode=yes -o ClearAllForwardings=yes -o PermitLocalCommand=no -o ProxyCommand=none";
export const GIT_HARDENING_ARGS = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  `core.sshCommand=${SSH_COMMAND}`,
  "-c",
  "protocol.allow=never",
  "-c",
  "protocol.ssh.allow=always",
];

function isSafeBranch(branch) {
  return (
    ALLOWED_BRANCH_PATTERN.test(branch) &&
    !branch.includes("..") &&
    !branch.includes("//") &&
    !branch.includes("@{") &&
    !branch.endsWith(".") &&
    !branch.endsWith("/")
  );
}

function validateReleaseTarget(context) {
  if (context.argv.length !== 0) {
    throw new Error("release prepare does not accept arguments");
  }
  if (context.gitCommonDir !== EXPECTED_GIT_COMMON_DIR) {
    throw new Error("current worktree is not the fixed Work Tracker repository");
  }
  if (context.remoteUrl !== EXPECTED_REMOTE_URL) {
    throw new Error("origin does not match the fixed Work Tracker remote");
  }
  if (context.pushRemoteUrl !== EXPECTED_REMOTE_URL) {
    throw new Error("origin push URL does not match the fixed Work Tracker remote");
  }
  if (!isSafeBranch(context.branch) || ["main", "master"].includes(context.branch)) {
    throw new Error("current branch is not an allowed release branch");
  }
  if (context.porcelain.trim() !== "") {
    throw new Error("worktree must be clean before release prepare");
  }
}

export function validateLocalGitConfig(configNames) {
  const blocked = String(configNames ?? "")
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => {
      const normalized = name.toLowerCase();
      return (
        /^url\..*\.(insteadof|pushinsteadof)$/u.test(normalized) ||
        /^remote\..*\.(uploadpack|receivepack|proxy)$/u.test(normalized) ||
        /^core\.(sshcommand|gitproxy)$/u.test(normalized) ||
        normalized === "ssh.variant" ||
        /^include(if)?\./u.test(normalized)
      );
    });
  if (blocked.length > 0) {
    throw new Error(`unsafe local git configuration: ${blocked.join(", ")}`);
  }
}

export function validateReleaseContext(context) {
  validateReleaseTarget(context);
  if (!context.originMainIsAncestor) {
    throw new Error("release branch must contain origin/main without divergence");
  }
  if (context.behind !== 0) {
    throw new Error("release branch must not be behind origin/main");
  }
  if (!Number.isInteger(context.ahead) || context.ahead < 1) {
    throw new Error("release branch must contain at least one commit beyond origin/main");
  }
  return { branch: context.branch, ahead: context.ahead };
}

export function buildPushArgs(branch) {
  if (!isSafeBranch(branch)) throw new Error("unsafe release branch");
  return [
    ...GIT_HARDENING_ARGS,
    "push",
    EXPECTED_REMOTE_URL,
    `HEAD:refs/heads/${branch}`,
  ];
}

export function safeEnvironmentForRelease() {
  return {
    HOME: "/Users/glaucon",
    PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    TMPDIR: "/private/tmp",
    LANG: "C",
    LC_ALL: "C",
    GH_CONFIG_DIR: "/Users/glaucon/.config/gh",
    GH_HOST: "github.com",
    GH_PAGER: "cat",
    GH_PROMPT_DISABLED: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_PAGER: "cat",
    GIT_SSH_COMMAND: SSH_COMMAND,
    GIT_TERMINAL_PROMPT: "0",
    PAGER: "cat",
    SSH_ASKPASS: "/usr/bin/false",
  };
}

function execute(command, args, { cwd, allowFailure = false, timeoutMs = 120_000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: safeEnvironmentForRelease(),
    maxBuffer: 2 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function absoluteGitCommonDir(cwd, git, canonicalize) {
  const output = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd }).stdout;
  return canonicalize(output);
}

function parseAheadBehind(value) {
  const [behindText, aheadText] = value.trim().split(/\s+/u);
  const behind = Number(behindText);
  const ahead = Number(aheadText);
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    throw new Error("could not determine branch distance from origin/main");
  }
  return { behind, ahead };
}

const PR_JSON_FIELDS = "url,state,baseRefName,headRefName,isCrossRepository";

export function validatePullRequest(pullRequest, branch) {
  if (pullRequest?.state !== "OPEN") throw new Error("pull request is not open");
  if (pullRequest?.baseRefName !== "main") {
    throw new Error("pull request base must be main");
  }
  if (pullRequest?.headRefName !== branch) {
    throw new Error("pull request head does not match the release branch");
  }
  if (pullRequest?.isCrossRepository !== false) {
    throw new Error("pull request must originate from the fixed repository");
  }
  if (
    typeof pullRequest?.url !== "string" ||
    !/^https:\/\/github\.com\/GlauconAI\/glaucon-politeia\/pull\/[1-9][0-9]*$/u.test(
      pullRequest.url,
    )
  ) {
    throw new Error("pull request URL does not match the fixed repository");
  }
  return pullRequest.url;
}

function readOpenPullRequest(reference, branch, cwd, gh, { allowMissing = true } = {}) {
  const result = gh(
    ["pr", "view", reference, "--repo", GITHUB_REPOSITORY, "--json", PR_JSON_FIELDS],
    { cwd, allowFailure: true },
  );
  if (result.exitCode !== 0) {
    if (allowMissing) return null;
    throw new Error("created pull request could not be verified");
  }
  const parsed = JSON.parse(result.stdout);
  return validatePullRequest(parsed, branch);
}

export function runReleasePrepare({
  cwd = process.cwd(),
  argv = process.argv.slice(2),
  runner = execute,
  canonicalize = realpathSync,
} = {}) {
  const canonicalCwd = canonicalize(cwd);
  const git = (args, options) =>
    runner(GIT_EXECUTABLE, [...GIT_HARDENING_ARGS, ...args], options);
  const gh = (args, options) => runner(GH_EXECUTABLE, args, options);
  const gitCommonDir = absoluteGitCommonDir(canonicalCwd, git, canonicalize);
  const remoteUrl = git(["remote", "get-url", "origin"], { cwd: canonicalCwd }).stdout;
  const pushRemoteUrl = git(["remote", "get-url", "--push", "origin"], {
    cwd: canonicalCwd,
  }).stdout;
  const branch = git(["branch", "--show-current"], { cwd: canonicalCwd }).stdout;
  const porcelain = git(["status", "--porcelain"], { cwd: canonicalCwd }).stdout;

  validateReleaseTarget({ argv, gitCommonDir, remoteUrl, pushRemoteUrl, branch, porcelain });

  const blockedLocalConfig = git(
    ["config", "--local", "--name-only", "--list"],
    { cwd: canonicalCwd, allowFailure: true },
  );
  validateLocalGitConfig(blockedLocalConfig.stdout);

  git(
    [
      "fetch",
      "--no-tags",
      "--no-recurse-submodules",
      EXPECTED_REMOTE_URL,
      `refs/heads/main:${RELEASE_BASELINE_REF}`,
    ],
    { cwd: canonicalCwd },
  );
  const ancestor = git(["merge-base", "--is-ancestor", RELEASE_BASELINE_REF, "HEAD"], {
    cwd: canonicalCwd,
    allowFailure: true,
  });
  const { behind, ahead } = parseAheadBehind(
    git(["rev-list", "--left-right", "--count", `${RELEASE_BASELINE_REF}...HEAD`], {
      cwd: canonicalCwd,
    }).stdout,
  );

  validateReleaseContext({
    argv,
    gitCommonDir,
    remoteUrl,
    pushRemoteUrl,
    branch,
    porcelain,
    originMainIsAncestor: ancestor.exitCode === 0,
    behind,
    ahead,
  });

  const title = git(["log", "-1", "--pretty=%s"], { cwd: canonicalCwd }).stdout.slice(0, 120);
  runner(GIT_EXECUTABLE, buildPushArgs(branch), {
    cwd: canonicalCwd,
    timeoutMs: 180_000,
  });

  let pullRequestUrl = readOpenPullRequest(branch, branch, canonicalCwd, gh);
  let created = false;
  if (!pullRequestUrl) {
    const createdPullRequestUrl = gh(
      [
        "pr",
        "create",
        "--repo",
        GITHUB_REPOSITORY,
        "--base",
        "main",
        "--head",
        branch,
        "--title",
        title,
        "--body",
        FIXED_PR_BODY,
      ],
      { cwd: canonicalCwd, timeoutMs: 180_000 },
    ).stdout.trim();
    if (
      !/^https:\/\/github\.com\/GlauconAI\/glaucon-politeia\/pull\/[1-9][0-9]*$/u.test(
        createdPullRequestUrl,
      )
    ) {
      throw new Error("created pull request URL does not match the fixed repository");
    }
    pullRequestUrl = readOpenPullRequest(
      createdPullRequestUrl,
      branch,
      canonicalCwd,
      gh,
      { allowMissing: false },
    );
    created = true;
  }

  return { ok: true, branch, ahead, created, pullRequestUrl };
}

async function main() {
  const result = runReleasePrepare();
  process.stdout.write(`WORK_TRACKER_RELEASE_PREPARE_RESULT=${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `WORK_TRACKER_RELEASE_PREPARE_ERROR=${JSON.stringify({ message: error.message })}\n`,
    );
    process.exitCode = 1;
  }
}
