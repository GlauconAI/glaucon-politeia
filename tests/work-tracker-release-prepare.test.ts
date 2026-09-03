import { describe, expect, it } from "vitest";

import {
  ALLOWED_BRANCH_PATTERN,
  EXPECTED_GIT_COMMON_DIR,
  EXPECTED_REMOTE_URL,
  GITHUB_REPOSITORY,
  buildPushArgs,
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
      "core.sshCommand=/usr/bin/ssh",
      "push",
      "--set-upstream",
      "origin",
      "HEAD:refs/heads/fix/release-approval-v2",
    ]);
    expect(args.join(" ")).not.toMatch(/force/i);
    expect(GITHUB_REPOSITORY).toBe("GlauconAI/glaucon-politeia");
  });

  it("pushes once and reuses an existing open PR", () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner = (command: string, args: string[]) => {
      calls.push({ command, args });
      const semanticArgs = command === "/usr/bin/git" ? args.slice(6) : args;
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
      if (signature === "rev-list --left-right --count origin/main...HEAD") {
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
      }),
    ).toMatchObject({ created: false, branch: validContext.branch, ahead: 2 });
    expect(calls.filter(({ args }) => args.includes("push"))).toHaveLength(1);
    expect(calls.some(({ args }) => args[0] === "pr" && args[1] === "create")).toBe(false);
  });
});
