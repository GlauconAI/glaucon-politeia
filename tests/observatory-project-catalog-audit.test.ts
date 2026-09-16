import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectProjectCatalogAudit,
  computeCanonicalRegistrySourceHash,
  PROJECT_CATALOG_PROJECTION_FILES,
} from "@/lib/observatory/project-catalog-audit";
import { parseOrchestrationRegistryHtml } from "@/lib/observatory/registry";

const fixtureHtml = readFileSync(
  join(process.cwd(), "tests/fixtures/observatory-registry.html"),
  "utf8",
);
const collectedAt = "2026-09-16T21:00:00.000Z";
const snapshot = parseOrchestrationRegistryHtml(fixtureHtml, {
  collected_at: collectedAt,
  digest: "a".repeat(64),
});
const privateRoot = "/Users/private/Glaucon Vault";
const projectionDirectory = "/safe/projections";
const mirrorPath = "/safe/mirror.html";

describe("collectProjectCatalogAudit", () => {
  it("reports physical, projection, mirror, and snapshot drift without paths", async () => {
    const tamperedSnapshot = {
      ...snapshot,
      registry_version: "tampered",
    };
    const audit = await collectProjectCatalogAudit(
      {
        registryHtml: fixtureHtml,
        registrySnapshot: tamperedSnapshot,
        projectionDirectory,
        mirrorPath,
      },
      {
        now: () => new Date(collectedAt),
        listDirectories: async (path) =>
          path.endsWith("socrates-agora/projects")
            ? ["governance", "nas-map"]
            : ["alpha"],
        listFiles: async () => ["project-registry.yaml", "scene-registry.yaml"],
        readTextFile: async (path) =>
          path === mirrorPath
            ? `${fixtureHtml}\n<!-- drift -->`
            : "source_hash: bad-hash\n",
      },
    );

    expect(audit).toEqual({
      schema_version: "1.0.0",
      collected_at: collectedAt,
      status: "drift",
      unregistered_surfaces: ["Socrates/nas-map"],
      registered_paths_missing: ["Owner Team/beta"],
      mapping_incomplete: ["Owner Team/beta"],
      projection_drift: true,
      mirror_drift: true,
      snapshot_drift: true,
      error_code: null,
    });
    expect(JSON.stringify(audit)).not.toContain(privateRoot);
  });

  it("returns clean when every read-only projection matches", async () => {
    const sourceHash = computeCanonicalRegistrySourceHash(fixtureHtml);
    const audit = await collectProjectCatalogAudit(
      {
        registryHtml: fixtureHtml,
        registrySnapshot: snapshot,
        projectionDirectory,
        mirrorPath,
      },
      {
        now: () => new Date(collectedAt),
        listDirectories: async (path) =>
          path.endsWith("socrates-agora/projects")
            ? ["governance"]
            : ["alpha", "beta"],
        listFiles: async () => PROJECT_CATALOG_PROJECTION_FILES,
        readTextFile: async (path) =>
          path === mirrorPath
            ? fixtureHtml
            : `schema_version: 4.0.0\nsource_hash: ${sourceHash}\n`,
      },
    );

    expect(audit.status).toBe("drift");
    expect(audit.mapping_incomplete).toEqual(["Owner Team/beta"]);
    expect(audit.projection_drift).toBe(false);
    expect(audit.mirror_drift).toBe(false);
    expect(audit.snapshot_drift).toBe(false);
  });

  it("returns a stable failed result instead of blocking refresh", async () => {
    const audit = await collectProjectCatalogAudit(
      {
        registryHtml: fixtureHtml,
        registrySnapshot: snapshot,
        projectionDirectory,
        mirrorPath,
      },
      {
        now: () => new Date(collectedAt),
        listDirectories: async () => {
          throw new Error(`read failed at ${privateRoot}`);
        },
        listFiles: async () => [],
        readTextFile: async () => "",
      },
    );

    expect(audit).toMatchObject({
      status: "failed",
      error_code: "AUDIT_READ_FAILED",
    });
    expect(JSON.stringify(audit)).not.toContain(privateRoot);
  });

  it("records unavailable optional audit inputs without blocking refresh", async () => {
    const audit = await collectProjectCatalogAudit(
      {
        registryHtml: fixtureHtml,
        registrySnapshot: snapshot,
      },
      {
        now: () => new Date(collectedAt),
        listDirectories: async () => {
          throw new Error("must not run");
        },
        listFiles: async () => {
          throw new Error("must not run");
        },
        readTextFile: async () => {
          throw new Error("must not run");
        },
      },
    );

    expect(audit).toMatchObject({
      status: "failed",
      error_code: "AUDIT_INPUT_UNAVAILABLE",
    });
  });
});
