import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_PROJECT_EXECUTION_MAX_BYTES,
  ObservatoryProjectExecutionCollectionError,
  collectProjectExecutionSnapshot,
} from "@/lib/observatory/project-execution-collector";
import { projectExecutionFixture } from "./observatory-project-execution-schema.test";

const exportPath = "/safe/exports/project-execution-snapshot.json";
const collectedAt = "2026-08-23T20:10:00.000Z";

function dependencies(text = JSON.stringify(projectExecutionFixture())) {
  return {
    now: () => new Date(collectedAt),
    realpath: async (path: string) =>
      path === "/safe/exports" ? "/safe/exports" : exportPath,
    readTextFile: async (_path: string, maxBytes: number) => {
      expect(maxBytes).toBe(OBSERVATORY_PROJECT_EXECUTION_MAX_BYTES);
      return text;
    },
  };
}

describe("collectProjectExecutionSnapshot", () => {
  it("reads only the explicit contained export and returns fresh source health", async () => {
    const seen: string[] = [];
    const result = await collectProjectExecutionSnapshot(
      { exportPath },
      {
        ...dependencies(),
        readTextFile: async (path, maxBytes) => {
          seen.push(path);
          return dependencies().readTextFile(path, maxBytes);
        },
      },
    );

    expect(seen).toEqual([exportPath]);
    expect(result.snapshot?.summary.project_count).toBe(1);
    expect(result.sourceHealth).toEqual({
      domain: "project_executions",
      status: "fresh",
      health: "healthy",
      collected_at: "2026-08-23T20:00:00Z",
      last_success_at: "2026-08-23T20:00:00Z",
      asset_count: 1,
    });
  });

  it("degrades a missing export without inventing runtime data", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const result = await collectProjectExecutionSnapshot(
      { exportPath },
      {
        ...dependencies(),
        realpath: async () => {
          throw missing;
        },
      },
    );

    expect(result.snapshot).toBeNull();
    expect(result.sourceHealth).toMatchObject({
      domain: "project_executions",
      status: "unknown",
      health: "degraded",
      collected_at: collectedAt,
      last_success_at: null,
      asset_count: 0,
      error_code: "PROJECT_EXECUTION_SOURCE_MISSING",
    });
  });

  it("fails closed for invalid JSON, digest mismatch, oversized input, and symlink escape", async () => {
    await expect(
      collectProjectExecutionSnapshot({ exportPath }, dependencies("{")),
    ).rejects.toMatchObject({ code: "PROJECT_EXECUTION_SOURCE_INVALID" });

    const badDigest = projectExecutionFixture();
    badDigest.digest = "f".repeat(64);
    await expect(
      collectProjectExecutionSnapshot(
        { exportPath },
        dependencies(JSON.stringify(badDigest)),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_EXECUTION_DIGEST_MISMATCH" });

    await expect(
      collectProjectExecutionSnapshot(
        { exportPath },
        dependencies("x".repeat(OBSERVATORY_PROJECT_EXECUTION_MAX_BYTES + 1)),
      ),
    ).rejects.toBeInstanceOf(ObservatoryProjectExecutionCollectionError);

    await expect(
      collectProjectExecutionSnapshot(
        { exportPath },
        {
          ...dependencies(),
          realpath: async (path) =>
            path === "/safe/exports" ? "/safe/exports" : "/private/escape.json",
        },
      ),
    ).rejects.toMatchObject({ code: "PROJECT_EXECUTION_PATH_ESCAPE" });
  });

  it("fails closed before digest verification when public text contains a private path", async () => {
    const privatePath = projectExecutionFixture();
    privatePath.projects[0].project.title = "C:\\Users\\private\\secret.md";

    await expect(
      collectProjectExecutionSnapshot(
        { exportPath },
        dependencies(JSON.stringify(privatePath)),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_EXECUTION_SOURCE_INVALID" });
  });
});
