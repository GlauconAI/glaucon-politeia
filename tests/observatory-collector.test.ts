import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ObservatoryCollectorError,
  collectAndWriteObservatorySnapshot,
  collectObservatorySnapshot,
  writeObservatorySnapshotAtomically,
  type AtomicFileAdapter,
  type CommandInvocation,
  type CommandResult,
  type FileIdentityAdapter,
} from "@/lib/observatory/collector";
import { ObservatoryCollectionEnvelopeSchema } from "@/lib/observatory/collection-schema";

const registryHtml = readFileSync(
  join(process.cwd(), "tests/fixtures/observatory-registry.html"),
  "utf8",
);
const fixedNow = new Date("2026-07-21T23:00:00.000Z");

const agentsOutput = JSON.stringify({
  agents: [
    {
      id: "plato",
      name: "Configured Plato",
      identityName: "Plato",
      identityEmoji: "🏛️",
      model: "openai/gpt-5",
      workspace: "/Users/private/.openclaw/workspace/plato",
      bindings: 1,
      isDefault: true,
      sessionKey: "agent:plato:private-session",
      email: "private@example.com",
      token: "openclaw-secret-token",
    },
  ],
  configPath: "/Users/private/.openclaw/openclaw.json",
});

const statusOutput = JSON.stringify({
  runtimeVersion: "2026.7.21",
  gateway: {
    running: false,
    reachable: true,
    url: "ws://127.0.0.1:18789?token=private",
  },
  agents: {
    defaultId: "plato",
    agents: [{ id: "plato" }],
    sessionKeys: ["agent:plato:private"],
  },
  tasks: {
    total: 9,
    active: 2,
    terminal: 7,
    failures: 1,
    byStatus: {
      queued: 1,
      running: 1,
      succeeded: 5,
      failed: 1,
      timed_out: 0,
      cancelled: 1,
      lost: 0,
    },
    byUser: { "private@example.com": 9 },
  },
  sessions: [{ key: "agent:plato:private", path: "/Users/private/session" }],
});

function successfulRunner(
  seen: CommandInvocation[] = [],
  outputs = { agents: agentsOutput, status: statusOutput },
) {
  return async (invocation: CommandInvocation): Promise<CommandResult> => {
    seen.push(invocation);
    if (invocation.args[0] === "agents") {
      return { exitCode: 0, stdout: outputs.agents };
    }
    return { exitCode: 0, stdout: outputs.status };
  };
}

describe("collectObservatorySnapshot", () => {
  it("uses read-only argv commands and emits only the approved agent and runtime whitelist", async () => {
    const seen: CommandInvocation[] = [];
    const snapshot = await collectObservatorySnapshot(
      { registryPath: "/canonical/orchestration-system-design.html" },
      {
        runCommand: successfulRunner(seen),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
      },
    );

    expect(seen).toEqual([
      {
        command: "openclaw",
        args: ["agents", "list", "--json"],
        timeoutMs: 10_000,
      },
      {
        command: "openclaw",
        args: ["status", "--json"],
        timeoutMs: 10_000,
      },
    ]);
    expect(snapshot.status).toBe("success");
    expect(snapshot.generated_at).toBe("2026-07-21T23:00:00.000Z");
    expect(snapshot.registry.source.freshness).toBe("fresh");
    expect(snapshot.agents).toEqual([
      {
        id: "plato",
        display_name: "Plato",
        emoji: "🏛️",
        model_label: "openai/gpt-5",
        workspace_label: "plato",
        binding_count: 1,
        default: true,
      },
    ]);
    expect(snapshot.runtime).toEqual({
      runtime_version: "2026.7.21",
      gateway_running: false,
      gateway_reachable: true,
      configured_agent_count: 1,
      task_totals: {
        total: 9,
        active: 2,
        queued: 1,
        completed: 5,
        failed: 1,
      },
    });
    expect(snapshot.summary).toEqual({
      freshness: "fresh",
      project_count: 3,
      primary_scene_count: 2,
      secondary_scene_count: 1,
      execution_flow_count: 2,
      agent_count: 1,
      binding_count: 1,
      configured_agent_count: 1,
      gateway_running: false,
      gateway_reachable: true,
      task_totals: snapshot.runtime.task_totals,
    });
    expect(ObservatoryCollectionEnvelopeSchema.parse(snapshot)).toEqual(
      snapshot,
    );

    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      "/Users/private",
      "private@example.com",
      "private-session",
      "service-role-secret",
      "openclaw-secret-token",
      "telegram:private-user",
      "configPath",
      "byUser",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("computes a deterministic SHA-256 digest from canonical validated content", async () => {
    const first = await collectObservatorySnapshot(
      { registryPath: "/canonical/registry.html" },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
      },
    );
    const second = await collectObservatorySnapshot(
      { registryPath: "/different/private/source/path.html" },
      {
        runCommand: successfulRunner([], {
          agents: JSON.stringify(JSON.parse(agentsOutput), null, 2),
          status: JSON.stringify({
            tasks: JSON.parse(statusOutput).tasks,
            agents: JSON.parse(statusOutput).agents,
            gateway: JSON.parse(statusOutput).gateway,
            runtimeVersion: JSON.parse(statusOutput).runtimeVersion,
          }),
        }),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
      },
    );

    expect(first.source_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(first.source_digest).toBe(second.source_digest);
    expect(first.registry.source.digest).toBe(first.source_digest);
    expect(JSON.stringify(first)).not.toContain("/canonical/registry.html");
  });

  it("emits only safe logical workspace labels from path and token inputs", async () => {
    const snapshot = await collectObservatorySnapshot(
      { registryPath: "/canonical/registry.html" },
      {
        runCommand: successfulRunner([], {
          agents: JSON.stringify([
            {
              id: "nested",
              workspace:
                "/Users/private/.openclaw/workspace/plato/private-tail",
            },
            {
              id: "windows",
              workspace:
                "C:\\Users\\private\\.openclaw\\workspaces\\athena\\private-tail",
            },
            {
              id: "unc",
              workspace:
                "\\\\private-server\\share\\workspace\\socrates\\private-tail",
            },
            { id: "missing", workspace: "/Users/private-user/private-tail" },
            { id: "logical", workspaceLabel: "plato-prod" },
            { id: "invalid", workspaceLabel: "private/path" },
          ]),
          status: statusOutput,
        }),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
      },
    );

    expect(snapshot.agents.map((agent) => agent.workspace_label)).toEqual([
      "plato",
      "athena",
      "socrates",
      "unknown",
      "plato-prod",
      "unknown",
    ]);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("private-tail");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("private-server");
  });

  it("reports command failures without exposing stderr secrets", async () => {
    const secret = "token=do-not-leak";
    const action = collectObservatorySnapshot(
      { registryPath: "/canonical/registry.html" },
      {
        runCommand: async (invocation) =>
          invocation.args[0] === "agents"
            ? { exitCode: 17, stdout: "", stderr: secret }
            : { exitCode: 0, stdout: statusOutput },
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
      },
    );

    await expect(action).rejects.toMatchObject({
      code: "COMMAND_FAILED",
    });
    await expect(action).rejects.not.toHaveProperty(
      "message",
      expect.stringContaining(secret),
    );
  });

  it("reports explicit timeouts", async () => {
    const action = collectObservatorySnapshot(
      { registryPath: "/canonical/registry.html" },
      {
        runCommand: async () => ({
          exitCode: 1,
          stdout: "",
          timedOut: true,
        }),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
        commandTimeoutMs: 25,
      },
    );

    await expect(action).rejects.toMatchObject({
      code: "COMMAND_TIMEOUT",
      message: expect.stringContaining("25ms"),
    });
  });

  it("reports malformed Agents and status CLI JSON with an actionable typed error", async () => {
    for (const malformedCommand of ["agents", "status"] as const) {
      const action = collectObservatorySnapshot(
        { registryPath: "/canonical/registry.html" },
        {
          runCommand: async (invocation) => ({
            exitCode: 0,
            stdout:
              invocation.args[0] === malformedCommand
                ? "{malformed"
                : invocation.args[0] === "agents"
                  ? agentsOutput
                  : statusOutput,
          }),
          readTextFile: async () => registryHtml,
          now: () => fixedNow,
        },
      );

      await expect(action).rejects.toMatchObject({
        code: "CLI_JSON_MALFORMED",
        message: expect.stringContaining(malformedCommand),
      });
    }
  });
});

describe("collectAndWriteObservatorySnapshot", () => {
  it("refuses to overwrite the explicitly configured canonical source", async () => {
    const sourcePath = "/canonical/orchestration-system-design.html";
    let opened = false;
    const action = collectAndWriteObservatorySnapshot(
      { registryPath: sourcePath, destinationPath: sourcePath },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
        files: {
          openExclusive: async () => {
            opened = true;
            throw new Error("must not open");
          },
          rename: async () => undefined,
          remove: async () => undefined,
        },
        identities: {
          realpathIfExists: async () => sourcePath,
          statIfExists: async () => ({ device: 1, inode: 2 }),
        },
      },
    );

    await expect(action).rejects.toMatchObject({
      code: "SOURCE_WRITE_FORBIDDEN",
    });
    expect(opened).toBe(false);
  });

  it("rejects an existing destination symlink alias before opening a temp file", async () => {
    const sourcePath = "/canonical/orchestration-system-design.html";
    const destinationPath = "/safe/output/source-alias.html";
    let opened = false;
    let renamed = false;
    let sourceContent = "canonical-source-content";
    const identities: FileIdentityAdapter = {
      realpathIfExists: async (path) =>
        path === sourcePath || path === destinationPath
          ? "/real/canonical/source.html"
          : undefined,
      statIfExists: async (path) =>
        path === sourcePath || path === destinationPath
          ? { device: 7, inode: 11 }
          : undefined,
    };

    const action = collectAndWriteObservatorySnapshot(
      { registryPath: sourcePath, destinationPath },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
        identities,
        files: {
          openExclusive: async () => {
            opened = true;
            return {
              write: async () => undefined,
              close: async () => undefined,
            };
          },
          rename: async () => {
            renamed = true;
            sourceContent = "overwritten";
          },
          remove: async () => undefined,
        },
      },
    );

    await expect(action).rejects.toMatchObject({
      code: "SOURCE_WRITE_FORBIDDEN",
    });
    expect(opened).toBe(false);
    expect(renamed).toBe(false);
    expect(sourceContent).toBe("canonical-source-content");
  });

  it("resolves a missing destination through its real parent before comparing source identity", async () => {
    const sourcePath = "/canonical/source.html";
    const destinationPath = "/symlinked-parent/source.html";
    let opened = false;
    const identities: FileIdentityAdapter = {
      realpathIfExists: async (path) => {
        if (path === sourcePath) return "/real/canonical/source.html";
        if (path === destinationPath) return undefined;
        if (path === "/symlinked-parent") return "/real/canonical";
        return undefined;
      },
      statIfExists: async (path) =>
        path === sourcePath ? { device: 7, inode: 11 } : undefined,
    };

    const action = collectAndWriteObservatorySnapshot(
      { registryPath: sourcePath, destinationPath },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
        identities,
        files: {
          openExclusive: async () => {
            opened = true;
            throw new Error("must not open");
          },
          rename: async () => undefined,
          remove: async () => undefined,
        },
      },
    );

    await expect(action).rejects.toMatchObject({
      code: "SOURCE_WRITE_FORBIDDEN",
    });
    expect(opened).toBe(false);
  });

  it("rejects distinct canonical paths that share the same device and inode", async () => {
    const sourcePath = "/canonical/source.html";
    const destinationPath = "/safe/output/hard-link.html";
    let opened = false;
    const identities: FileIdentityAdapter = {
      realpathIfExists: async (path) =>
        path === sourcePath
          ? "/real/source.html"
          : path === destinationPath
            ? "/real/hard-link.html"
            : undefined,
      statIfExists: async (path) =>
        path === sourcePath || path === destinationPath
          ? { device: 7, inode: 11 }
          : undefined,
    };

    const action = collectAndWriteObservatorySnapshot(
      { registryPath: sourcePath, destinationPath },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
        identities,
        files: {
          openExclusive: async () => {
            opened = true;
            throw new Error("must not open");
          },
          rename: async () => undefined,
          remove: async () => undefined,
        },
      },
    );

    await expect(action).rejects.toMatchObject({
      code: "SOURCE_WRITE_FORBIDDEN",
    });
    expect(opened).toBe(false);
  });

  it("preserves the last-known-good file and removes only its owned temp file on rename failure", async () => {
    const destination = "/safe/output/observatory-snapshot.json";
    const temp = "/safe/output/.observatory-snapshot.json.task-owned.tmp";
    const files = new Map([[destination, "last-known-good"]]);
    const removed: string[] = [];
    const adapter: AtomicFileAdapter = {
      openExclusive: async (path) => {
        expect(path).toBe(temp);
        return {
          write: async (content) => {
            files.set(path, content);
          },
          sync: async () => undefined,
          close: async () => undefined,
        };
      },
      rename: async () => {
        throw new Error("disk unavailable at /private/path");
      },
      remove: async (path) => {
        removed.push(path);
        files.delete(path);
      },
    };

    const action = collectAndWriteObservatorySnapshot(
      {
        registryPath: "/canonical/registry.html",
        destinationPath: destination,
      },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
        files: adapter,
        identities: {
          realpathIfExists: async (path) => path,
          statIfExists: async () => undefined,
        },
        createTempPath: () => temp,
      },
    );

    await expect(action).rejects.toBeInstanceOf(ObservatoryCollectorError);
    await expect(action).rejects.toMatchObject({ code: "ATOMIC_WRITE_FAILED" });
    expect(files.get(destination)).toBe("last-known-good");
    expect(files.has(temp)).toBe(false);
    expect(removed).toEqual([temp]);
  });

  it("does not remove or follow a pre-existing untrusted temp symlink", async () => {
    const snapshot = await collectObservatorySnapshot(
      { registryPath: "/canonical/registry.html" },
      {
        runCommand: successfulRunner(),
        readTextFile: async () => registryHtml,
        now: () => fixedNow,
      },
    );
    const temp = "/safe/output/.snapshot.untrusted.tmp";
    const removed: string[] = [];

    await expect(
      writeObservatorySnapshotAtomically(
        snapshot,
        "/safe/output/snapshot.json",
        {
          openExclusive: async () => {
            throw Object.assign(new Error("already exists"), {
              code: "EEXIST",
            });
          },
          rename: async () => undefined,
          remove: async (path) => {
            removed.push(path);
          },
        },
        () => temp,
      ),
    ).rejects.toMatchObject({ code: "ATOMIC_WRITE_FAILED" });
    expect(removed).toEqual([]);
  });
});
