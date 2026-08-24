import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_PROJECT_CONTROL_MAX_BYTES,
  collectProjectControlSnapshot,
} from "@/lib/observatory/project-control-collector";
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
});
