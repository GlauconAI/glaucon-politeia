import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "scripts/observatory/collect.ts"),
  "utf8",
);
const verifierSource = readFileSync(
  join(process.cwd(), "scripts/observatory/verify-snapshot.ts"),
  "utf8",
);
const refreshSource = readFileSync(
  join(process.cwd(), "scripts/observatory/refresh.ts"),
  "utf8",
);
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
    expect(cronSource).toContain("OBSERVATORY_PROJECT_EXECUTION_PATH");
    expect(cronSource).toContain("OBSERVATORY_PROJECT_CONTROL_PATH");
    expect(cronSource).not.toContain("/Users/");
  });

  it("retains a validated Project Control last-known-good when the source disappears", () => {
    expect(source).toContain("readPreviousProjectControl");
    expect(source).toContain("retainProjectControlLastKnownGood");
    expect(source).toContain("ObservatoryCollectionEnvelopeV6Schema.safeParse");
    expect(source).toContain("computeObservatorySnapshotDigest(previous.data)");
    expect(source).toContain("computeProjectControlDigest(previous.data.project_controls)");
  });
});

describe("Observatory Snapshot verifier", () => {
  it("accepts v5/v6 and verifies the versioned source domains and Project counts", () => {
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV5Schema");
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV6Schema");
    expect(verifierSource).toContain('snapshot.schema_version === "6.0.0" ? 9 : 8');
    expect(verifierSource).toContain(
      "source_repositories.repositories.length",
    );
    expect(verifierSource).toContain(
      "project_executions?.summary.project_count",
    );
    expect(verifierSource).toContain(
      "project_controls?.summary.project_count",
    );
  });
});
