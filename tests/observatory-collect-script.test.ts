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

describe("Observatory collection script", () => {
  it("upgrades explicit-root collections to v4 with both approved repository roots", () => {
    expect(source).toContain("collectSourceRepositories");
    expect(source).toContain("upgradeObservatorySnapshotToV4");
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
  });

  it("keeps legacy no-root collection on the existing core path", () => {
    expect(source).toContain("collectAndWriteObservatorySnapshot");
    expect(source).toContain("if (options.systemRoots)");
  });
});

describe("Observatory Snapshot verifier", () => {
  it("accepts v4 and verifies the seventh source domain and repository count", () => {
    expect(verifierSource).toContain("ObservatoryCollectionEnvelopeV4Schema");
    expect(verifierSource).toContain("source_health.length === 7");
    expect(verifierSource).toContain(
      "source_repositories.repositories.length",
    );
  });
});
