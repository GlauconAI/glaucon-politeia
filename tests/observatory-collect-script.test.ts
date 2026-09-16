import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "scripts/observatory/collect.ts"),
  "utf8",
);
const verifierSource = readFileSync(
  join(process.cwd(), "scripts/observatory/verify-snapshot.ts"),
  "utf8",
);
const refreshScriptPath = join(process.cwd(), "scripts/observatory/refresh.ts");
const refreshSource = readFileSync(refreshScriptPath, "utf8");
const cronSource = readFileSync(
  join(process.cwd(), "scripts/observatory/cron-refresh.zsh"),
  "utf8",
);

describe("Observatory collection script", () => {
  it("upgrades explicit-root collections to v5 with the bounded Project execution export", () => {
    expect(source).toContain("collectSourceRepositories");
    expect(source).toContain("upgradeObservatorySnapshotToV4");
    expect(source).toContain("collectProjectExecutionSnapshot");
    expect(source).toContain("upgradeObservatorySnapshotToV5");
    expect(source).toContain(
      "workspaceRoot: resolve(options.systemRoots.workspaceRoot)",
    );
    expect(source).toContain(
      "vaultRoot: resolve(options.systemRoots.vaultRoot)",
    );
    expect(source).toContain("agents: governanceSnapshot.agents");
    expect(source).toContain(
      "projectGroups: governanceSnapshot.registry.project_groups",
    );
    expect(source).toContain(
      "exportPath: resolve(options.systemRoots.projectExecutionPath)",
    );
  });

  it("keeps legacy no-root collection on the existing core path", () => {
    expect(source).toContain("collectAndWriteObservatorySnapshot");
    expect(source).toContain("if (options.systemRoots)");
  });

  it("threads the explicit sanitized export through refresh without hard-coded host paths", () => {
    expect(refreshSource).toContain('"--project-execution-path"');
    expect(refreshSource).toContain("resolve(projectExecutionPath)");
    expect(refreshSource).toContain('"--project-control-path"');
    expect(refreshSource).toContain("resolve(projectControlPath)");
    expect(refreshSource).toContain('"--catalog-projection-dir"');
    expect(refreshSource).toContain("resolve(catalogProjectionDirectory)");
    expect(refreshSource).toContain('"--catalog-mirror-path"');
    expect(refreshSource).toContain("resolve(catalogMirrorPath)");
    expect(cronSource).toContain("OBSERVATORY_PROJECT_EXECUTION_PATH");
    expect(cronSource).toContain("OBSERVATORY_PROJECT_CONTROL_PATH");
    expect(cronSource).toContain("OBSERVATORY_CATALOG_PROJECTION_DIR");
    expect(cronSource).toContain("OBSERVATORY_CATALOG_MIRROR_PATH");
    expect(cronSource).not.toContain("/Users/");
  });

  it("fails closed instead of writing v5 when Project Control configuration is omitted", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        refreshScriptPath,
        "registry.html",
        "workspace",
        "vault",
        "config.json",
        "project-execution-snapshot.json",
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("OBSERVATORY_REFRESH_CONFIG_INVALID");
  });

  it("retains a validated Project Control last-known-good when the source disappears", () => {
    expect(source).toContain("readPreviousProjectControl");
    expect(source).toContain("retainProjectControlLastKnownGood");
    expect(source).toContain("ObservatoryCollectionEnvelopeSchema.safeParse");
    expect(source).toContain("computeObservatorySnapshotDigest(previous.data)");
    expect(source).toContain("computeProjectControlDigest(previous.data.project_controls)");
  });

  it("upgrades v6 with the fail-soft Agent activity projection", () => {
    expect(source).toContain("collectAgentActivity");
    expect(source).toContain("upgradeObservatorySnapshotToV7");
  });

  it("upgrades v7 with a fail-soft read-only Project Catalog audit", () => {
    expect(source).toContain("collectProjectCatalogAudit");
    expect(source).toContain("upgradeObservatorySnapshotToV8");
  });
});

describe("Observatory Snapshot verifier", () => {
  it("accepts v5/v6/v7/v8 and verifies the versioned source domains and Project counts", () => {
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV5Schema");
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV6Schema");
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV7Schema");
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV8Schema");
    expect(verifierSource).toContain('"project_controls" in snapshot ? 9 : 8');
    expect(verifierSource).toContain(
      "source_repositories.repositories.length",
    );
    expect(verifierSource).toContain(
      "project_executions?.summary.project_count",
    );
    expect(verifierSource).toContain(
      "project_controls?.summary.project_count",
    );
    expect(verifierSource).toContain("agent_activity.agents.length");
  });
});
