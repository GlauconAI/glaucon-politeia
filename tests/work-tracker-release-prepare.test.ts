import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ALLOWED_BRANCH_PATTERN,
  EXPECTED_GIT_COMMON_DIR,
  EXPECTED_REMOTE_URL,
  GITHUB_REPOSITORY,
  GIT_HARDENING_ARGS,
  RELEASE_BASELINE_REF,
  buildPushArgs,
  safeEnvironmentForRelease,
  validateLocalGitConfig,
  validatePullRequest,
  runReleasePrepare,
  validateReleaseContext,
} from "@/scripts/release/work-tracker-release-prepare.mjs";

const validContext = {
  argv: [] as string[],
  gitCommonDir: EXPECTED_GIT_COMMON_DIR,
  remoteUrl: EXPECTED_REMOTE_URL,
  pushRemoteUrl: EXPECTED_REMOTE_URL,
  branch: "fix/release-approval-v2",
  porcelain: "",
  originMainIsAncestor: true,
  behind: 0,
  ahead: 2,
};

describe("Work Tracker host-owned release prepare contract", () => {
  it("accepts only a clean, linear, non-default release branch in the fixed repo", () => {
    expect(validateReleaseContext(validContext)).toEqual({
      branch: "fix/release-approval-v2",
      ahead: 2,
    });
    expect(ALLOWED_BRANCH_PATTERN.test("feat/version-filter")).toBe(true);
    expect(ALLOWED_BRANCH_PATTERN.test("main")).toBe(false);
  });

  it.each([
    ["free arguments", { argv: ["--repo", "attacker/repo"] }],
    ["wrong git common directory", { gitCommonDir: "/tmp/other/.git" }],
    ["wrong remote", { remoteUrl: "git@github.com:attacker/repo.git" }],
    ["wrong push remote", { pushRemoteUrl: "git@github.com:attacker/repo.git" }],
    ["default branch", { branch: "main" }],
    ["unsafe branch", { branch: "fix/ok;touch-pwned" }],
    ["dirty worktree", { porcelain: " M app/page.tsx" }],
    ["diverged history", { originMainIsAncestor: false }],
    ["behind origin main", { behind: 1 }],
    ["no release commit", { ahead: 0 }],
  ])("rejects %s before push", (_label, override) => {
    expect(() => validateReleaseContext({ ...validContext, ...override })).toThrow();
  });

  it("builds a fixed non-force push and fixed GitHub repository target", () => {
    const args = buildPushArgs(validContext.branch);
    expect(args).toEqual([
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.sshCommand=/usr/bin/ssh -F /dev/null -o BatchMode=yes -o ClearAllForwardings=yes -o PermitLocalCommand=no -o ProxyCommand=none",
      "-c",
      "protocol.allow=never",
      "-c",
      "protocol.ssh.allow=always",
      "push",
      EXPECTED_REMOTE_URL,
      "HEAD:refs/heads/fix/release-approval-v2",
    ]);
    expect(args.join(" ")).not.toMatch(/force/i);
    expect(GITHUB_REPOSITORY).toBe("GlauconAI/glaucon-politeia");
  });

  it("starts through a fixed clean-environment launcher", () => {
    const launcher = readFileSync("scripts/release/work-tracker-release-prepare.sh", "utf8");
    expect(launcher).toMatch(/^#!\/bin\/sh/u);
    expect(launcher).toContain("/usr/bin/env -i");
    expect(launcher).toContain("/usr/local/bin/node");
    expect(launcher).not.toContain("$PATH");
    expect(launcher).not.toContain("NODE_OPTIONS");

    const environment = safeEnvironmentForRelease();
    expect(environment).not.toHaveProperty("NODE_OPTIONS");
    expect(environment).not.toHaveProperty("NODE_PATH");
    expect(environment).not.toHaveProperty("BASH_ENV");
    expect(environment).not.toHaveProperty("ENV");
    expect(environment.PATH).toBe("/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    expect(environment.GIT_SSH_COMMAND).toContain("-F /dev/null");
  });

  it("accepts only an open same-repository PR targeting main", () => {
    const validPullRequest = {
      url: "https://github.com/GlauconAI/glaucon-politeia/pull/8",
      state: "OPEN",
      baseRefName: "main",
      headRefName: validContext.branch,
      isCrossRepository: false,
    };
    expect(validatePullRequest(validPullRequest, validContext.branch)).toBe(validPullRequest.url);
    expect(() =>
      validatePullRequest({ ...validPullRequest, baseRefName: "release" }, validContext.branch),
    ).toThrow(/base/i);
    expect(() =>
      validatePullRequest({ ...validPullRequest, headRefName: "fix/other" }, validContext.branch),
    ).toThrow(/head/i);
    expect(() =>
      validatePullRequest({ ...validPullRequest, isCrossRepository: true }, validContext.branch),
    ).toThrow(/repository/i);
  });

  it("rejects local Git configuration that can rewrite transport execution", () => {
    expect(() => validateLocalGitConfig("url.ssh://evil/.insteadof\n")).toThrow(/unsafe/i);
    expect(() => validateLocalGitConfig("core.sshcommand\n")).toThrow(/unsafe/i);
    expect(validateLocalGitConfig("core.repositoryformatversion\nremote.origin.url\n"))
      .toBeUndefined();
  });

  it("pushes once and reuses an existing open PR", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner = (command: string, args: string[]) => {
      calls.push({ command, args });
      const semanticArgs =
        command === "/usr/bin/git" ? args.slice(GIT_HARDENING_ARGS.length) : args;
      const signature = semanticArgs.join(" ");
      if (signature === "rev-parse --path-format=absolute --git-common-dir") {
        return { exitCode: 0, stdout: EXPECTED_GIT_COMMON_DIR, stderr: "" };
      }
      if (signature === "remote get-url origin" || signature === "remote get-url --push origin") {
        return { exitCode: 0, stdout: EXPECTED_REMOTE_URL, stderr: "" };
      }
      if (signature === "branch --show-current") {
        return { exitCode: 0, stdout: validContext.branch, stderr: "" };
      }
      if (signature === "status --porcelain") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (signature === `rev-list --left-right --count ${RELEASE_BASELINE_REF}...HEAD`) {
        return { exitCode: 0, stdout: "0 2", stderr: "" };
      }
      if (signature === "log -1 --pretty=%s") {
        return { exitCode: 0, stdout: "fix: approval lane", stderr: "" };
      }
      if (
        command === "/usr/local/bin/gh" &&
        semanticArgs[0] === "pr" &&
        semanticArgs[1] === "view"
      ) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            url: "https://github.com/GlauconAI/glaucon-politeia/pull/8",
            state: "OPEN",
            baseRefName: "main",
            headRefName: validContext.branch,
            isCrossRepository: false,
          }),
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    expect(
      runReleasePrepare({
        cwd: "/Users/glaucon/.openclaw/workspace/plato/projects/glaucon-politeia/.worktrees/work-tracker-release-approvals-v2",
        argv: [],
        runner,
        canonicalize: (path) => path,
      }),
    ).toMatchObject({ created: false, branch: validContext.branch, ahead: 2 });
    expect(calls.filter(({ args }) => args.includes("push"))).toHaveLength(1);
    expect(
      calls.some(
        ({ args }) =>
          args.includes("fetch") &&
          args.includes(`refs/heads/main:${RELEASE_BASELINE_REF}`) &&
          !args.includes("origin"),
      ),
    ).toBe(true);
    expect(calls.some(({ args }) => args[0] === "pr" && args[1] === "create")).toBe(false);
  });

  it("creates a fixed PR and verifies its base/head before returning", () => {
    let viewCount = 0;
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner = (command: string, args: string[]) => {
      calls.push({ command, args });
      const semanticArgs =
        command === "/usr/bin/git" ? args.slice(GIT_HARDENING_ARGS.length) : args;
      const signature = semanticArgs.join(" ");
      if (signature === "rev-parse --path-format=absolute --git-common-dir") {
        return { exitCode: 0, stdout: EXPECTED_GIT_COMMON_DIR, stderr: "" };
      }
      if (signature === "remote get-url origin" || signature === "remote get-url --push origin") {
        return { exitCode: 0, stdout: EXPECTED_REMOTE_URL, stderr: "" };
      }
      if (signature === "branch --show-current") {
        return { exitCode: 0, stdout: validContext.branch, stderr: "" };
      }
      if (signature === "status --porcelain") return { exitCode: 0, stdout: "", stderr: "" };
      if (signature === `rev-list --left-right --count ${RELEASE_BASELINE_REF}...HEAD`) {
        return { exitCode: 0, stdout: "0 1", stderr: "" };
      }
      if (signature === "log -1 --pretty=%s") {
        return { exitCode: 0, stdout: "ci: harden release", stderr: "" };
      }
      if (command === "/usr/local/bin/gh" && semanticArgs[0] === "pr" && semanticArgs[1] === "view") {
        viewCount += 1;
        if (viewCount === 1) return { exitCode: 1, stdout: "", stderr: "not found" };
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            url: "https://github.com/GlauconAI/glaucon-politeia/pull/9",
            state: "OPEN",
            baseRefName: "main",
            headRefName: validContext.branch,
            isCrossRepository: false,
          }),
          stderr: "",
        };
      }
      if (command === "/usr/local/bin/gh" && semanticArgs[0] === "pr" && semanticArgs[1] === "create") {
        return {
          exitCode: 0,
          stdout: "https://github.com/GlauconAI/glaucon-politeia/pull/9",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    expect(
      runReleasePrepare({
        cwd: process.cwd(),
        argv: [],
        runner,
        canonicalize: (path) => path,
      }),
    ).toMatchObject({
      created: true,
      pullRequestUrl: "https://github.com/GlauconAI/glaucon-politeia/pull/9",
    });
    expect(viewCount).toBe(2);
  });
});
