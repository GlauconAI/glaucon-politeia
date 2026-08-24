import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_PROJECT_CONTROL_MAX_BYTES,
  collectProjectControlSnapshot,
  retainProjectControlLastKnownGood,
} from "@/lib/observatory/project-control-collector";
import {
  ProjectControlSnapshotSchema,
  computeProjectControlDigest,
} from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

const exportPath = "/safe/exports/project-control-snapshot.json";

function dependencies(text = JSON.stringify(asgardProjectControlFixture())) {
  return {
    now: () => new Date("2026-08-23T20:10:00Z"),
    realpath: async (path: string) =>
      path === "/safe/exports" ? "/safe/exports" : exportPath,
    readTextFile: async (_path: string, maxBytes: number) => {
      expect(maxBytes).toBe(OBSERVATORY_PROJECT_CONTROL_MAX_BYTES);
      return text;
    },
  };
}

describe("collectProjectControlSnapshot", () => {
  it("reads only the explicit contained export", async () => {
    const seen: string[] = [];
    const result = await collectProjectControlSnapshot(
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
    expect(result.snapshot?.projects[0].project.project_slug).toBe(
      "asgard-archaea-gacha-game",
    );
    expect(result.sourceHealth.domain).toBe("project_controls");
  });

  it("requires the exact export basename and reads the pinned canonical file", async () => {
    await expect(
      collectProjectControlSnapshot(
        { exportPath: "/safe/exports/renamed.json" },
        dependencies(),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_CONTROL_PATH_INVALID" });

    const seen: string[] = [];
    const aliasPath = "/safe/exports/project-control-snapshot.json";
    const canonicalPath = "/safe/exports/canonical-project-control-snapshot.json";
    await collectProjectControlSnapshot(
      { exportPath: aliasPath },
      {
        ...dependencies(),
        realpath: async (path) =>
          path === "/safe/exports" ? "/safe/exports" : canonicalPath,
        readTextFile: async (path, maxBytes) => {
          seen.push(path);
          return dependencies().readTextFile(path, maxBytes);
        },
      },
    );
    expect(seen).toEqual([canonicalPath]);
  });

  it("rejects aggregate privacy violations before accepting a digest-valid export", async () => {
    const secret = asgardProjectControlFixture();
    secret.projects[0].project.objective =
      "Use Bearer abcdefghijklmnopqrstuvwxyz for the integration.";
    secret.digest = computeProjectControlDigest(secret);

    await expect(
      collectProjectControlSnapshot(
        { exportPath },
        dependencies(JSON.stringify(secret)),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_CONTROL_PRIVACY_VIOLATION" });
  });

  it("fails closed for invalid JSON, digest mismatch, resource overflow, and escape", async () => {
    await expect(
      collectProjectControlSnapshot({ exportPath }, dependencies("{")),
    ).rejects.toMatchObject({ code: "PROJECT_CONTROL_SOURCE_INVALID" });
    const badDigest = asgardProjectControlFixture();
    badDigest.digest = "f".repeat(64);
    await expect(
      collectProjectControlSnapshot(
        { exportPath },
        dependencies(JSON.stringify(badDigest)),
      ),
    ).rejects.toMatchObject({ code: "PROJECT_CONTROL_DIGEST_MISMATCH" });
    await expect(
      collectProjectControlSnapshot(
        { exportPath },
        dependencies("x".repeat(OBSERVATORY_PROJECT_CONTROL_MAX_BYTES + 1)),
      ),
    ).rejects.toMatchObject({
      code: "PROJECT_CONTROL_RESOURCE_LIMIT_EXCEEDED",
    });
    await expect(
      collectProjectControlSnapshot(
        { exportPath },
        {
          ...dependencies(),
          realpath: async (path) =>
            path === "/safe/exports" ? "/safe/exports" : "/private/escape.json",
        },
      ),
    ).rejects.toMatchObject({ code: "PROJECT_CONTROL_PATH_ESCAPE" });
  });

  it("returns a bounded unavailable state for a missing export", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const result = await collectProjectControlSnapshot(
      { exportPath },
      { ...dependencies(), realpath: async () => { throw missing; } },
    );
    expect(result).toMatchObject({
      snapshot: null,
      sourceHealth: {
        domain: "project_controls",
        status: "unknown",
        error_code: "PROJECT_CONTROL_SOURCE_MISSING",
      },
    });
  });

  it("retains a prior valid projection as stale when a later export is missing", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const candidate = await collectProjectControlSnapshot(
      { exportPath },
      { ...dependencies(), realpath: async () => { throw missing; } },
    );
    const previousSnapshot = ProjectControlSnapshotSchema.parse(
      asgardProjectControlFixture(),
    );
    const retained = retainProjectControlLastKnownGood(candidate, {
      snapshot: previousSnapshot,
      sourceHealth: {
        domain: "project_controls",
        status: "fresh",
        health: "healthy",
        collected_at: previousSnapshot.collected_at,
        last_success_at: previousSnapshot.collected_at,
        asset_count: 1,
      },
    });

    expect(retained.snapshot).toEqual(previousSnapshot);
    expect(retained.sourceHealth).toEqual({
      domain: "project_controls",
      status: "stale",
      health: "degraded",
      collected_at: "2026-08-23T20:10:00.000Z",
      last_success_at: previousSnapshot.collected_at,
      asset_count: 1,
      error_code: "PROJECT_CONTROL_SOURCE_MISSING",
    });
  });

  it("does not retain a digest-invalid prior Project Control projection", async () => {
    const previousSnapshot = ProjectControlSnapshotSchema.parse(
      asgardProjectControlFixture(),
    );
    previousSnapshot.digest = "f".repeat(64);
    const candidate = {
      snapshot: null,
      sourceHealth: {
        domain: "project_controls" as const,
        status: "unknown" as const,
        health: "degraded" as const,
        collected_at: "2026-08-23T20:10:00.000Z",
        last_success_at: null,
        asset_count: 0,
        error_code: "PROJECT_CONTROL_SOURCE_MISSING",
      },
    };

    expect(
      retainProjectControlLastKnownGood(candidate, {
        snapshot: previousSnapshot,
        sourceHealth: {
          domain: "project_controls",
          status: "fresh",
          health: "healthy",
          collected_at: previousSnapshot.collected_at,
          last_success_at: previousSnapshot.collected_at,
          asset_count: 1,
        },
      }),
    ).toEqual(candidate);
  });
});
