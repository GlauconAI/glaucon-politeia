import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GOVERNANCE_FILE_MAX_BYTES,
  GovernanceCollectionError,
  collectDashboardGovernance,
} from "@/lib/observatory/governance-collector";

const fixtureRoot = join(
  process.cwd(),
  "tests/fixtures/observatory-governance",
);
const files = new Map([
  ["README.md", readFileSync(join(fixtureRoot, "README.md"), "utf8")],
  [
    "development-baseline.md",
    readFileSync(join(fixtureRoot, "development-baseline.md"), "utf8"),
  ],
  [
    "edad-tracker.md",
    readFileSync(join(fixtureRoot, "edad-tracker.md"), "utf8"),
  ],
  [
    "estimate-calibration.md",
    readFileSync(join(fixtureRoot, "estimate-calibration.md"), "utf8"),
  ],
]);

function adapter(overrides: Record<string, string> = {}) {
  const seen: string[] = [];
  return {
    seen,
    dependencies: {
      realpath: async (path: string) => path,
      readTextFile: async (path: string) => {
        seen.push(path);
        const name = path.split("/").at(-1) ?? "";
        return overrides[name] ?? files.get(name) ?? "";
      },
      now: () => new Date("2026-07-23T04:30:00.000Z"),
    },
  };
}

describe("collectDashboardGovernance", () => {
  it("reads only the four allowlisted files beneath the explicit Vault root", async () => {
    const test = adapter();
    const result = await collectDashboardGovernance(
      { vaultRoot: "/vault" },
      test.dependencies,
    );

    expect(test.seen).toEqual([
      "/vault/plato-academy/projects/dashboard/README.md",
      "/vault/plato-academy/projects/dashboard/development-baseline.md",
      "/vault/plato-academy/projects/dashboard/edad-tracker.md",
      "/vault/plato-academy/projects/dashboard/estimate-calibration.md",
    ]);
    expect(result.project.id).toBe("dashboard");
  });

  it("rejects realpath escape and oversized governance sources", async () => {
    const escaped = adapter();
    escaped.dependencies.realpath = async (path: string) =>
      path.endsWith("README.md") ? "/outside/private.md" : path;
    await expect(
      collectDashboardGovernance({ vaultRoot: "/vault" }, escaped.dependencies),
    ).rejects.toMatchObject({ code: "GOVERNANCE_SOURCE_ESCAPE" });

    const oversized = adapter({
      "README.md": "x".repeat(GOVERNANCE_FILE_MAX_BYTES + 1),
    });
    await expect(
      collectDashboardGovernance(
        { vaultRoot: "/vault" },
        oversized.dependencies,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT_EXCEEDED" });
  });

  it("sanitizes read and parser failures", async () => {
    const failure = adapter();
    failure.dependencies.readTextFile = async () => {
      throw new Error("token=secret /Users/private");
    };
    await expect(
      collectDashboardGovernance({ vaultRoot: "/vault" }, failure.dependencies),
    ).rejects.toEqual(
      new GovernanceCollectionError(
        "GOVERNANCE_READ_FAILED",
        "Unable to read an allowlisted Dashboard governance source.",
      ),
    );

    const drift = adapter({
      "development-baseline.md": "# missing tables",
    });
    await expect(
      collectDashboardGovernance({ vaultRoot: "/vault" }, drift.dependencies),
    ).rejects.toMatchObject({ code: "GOVERNANCE_INVALID" });
  });
});
