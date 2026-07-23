import { isAbsolute, join, relative, resolve } from "node:path";

import {
  GovernanceProjectionError,
  projectDashboardGovernance,
} from "./governance-markdown";
import type { DeliveryGovernance } from "./governance-schema";

export const GOVERNANCE_FILE_MAX_BYTES = 2 * 1024 * 1024;
export const GOVERNANCE_TOTAL_MAX_BYTES = 6 * 1024 * 1024;
export const GOVERNANCE_RELATIVE_PATHS = [
  "plato-academy/projects/dashboard/README.md",
  "plato-academy/projects/dashboard/development-baseline.md",
  "plato-academy/projects/dashboard/edad-tracker.md",
  "plato-academy/projects/dashboard/estimate-calibration.md",
] as const;

export type GovernanceCollectionErrorCode =
  | "GOVERNANCE_READ_FAILED"
  | "GOVERNANCE_SOURCE_ESCAPE"
  | "GOVERNANCE_INVALID"
  | "RESOURCE_LIMIT_EXCEEDED";

export class GovernanceCollectionError extends Error {
  constructor(
    readonly code: GovernanceCollectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GovernanceCollectionError";
  }
}

type GovernanceCollectorDependencies = {
  realpath(path: string): Promise<string>;
  readTextFile(path: string): Promise<string>;
  now(): Date;
};

function isContained(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return (
    path !== ".." &&
    !path.startsWith("../") &&
    !path.startsWith("..\\") &&
    !isAbsolute(path)
  );
}

export async function collectDashboardGovernance(
  input: { vaultRoot: string },
  dependencies: GovernanceCollectorDependencies,
): Promise<DeliveryGovernance> {
  let root: string;
  try {
    root = await dependencies.realpath(resolve(input.vaultRoot));
  } catch {
    throw new GovernanceCollectionError(
      "GOVERNANCE_READ_FAILED",
      "Unable to resolve the explicit Vault root.",
    );
  }

  const values: string[] = [];
  let totalBytes = 0;
  for (const relativePath of GOVERNANCE_RELATIVE_PATHS) {
    const configuredPath = join(root, relativePath);
    let canonicalPath: string;
    let value: string;
    try {
      canonicalPath = await dependencies.realpath(configuredPath);
      if (!isContained(root, canonicalPath)) {
        throw new GovernanceCollectionError(
          "GOVERNANCE_SOURCE_ESCAPE",
          "An allowlisted Dashboard governance source escaped the explicit Vault root.",
        );
      }
      value = await dependencies.readTextFile(canonicalPath);
    } catch (error) {
      if (error instanceof GovernanceCollectionError) throw error;
      throw new GovernanceCollectionError(
        "GOVERNANCE_READ_FAILED",
        "Unable to read an allowlisted Dashboard governance source.",
      );
    }
    const bytes = Buffer.byteLength(value, "utf8");
    totalBytes += bytes;
    if (
      bytes > GOVERNANCE_FILE_MAX_BYTES ||
      totalBytes > GOVERNANCE_TOTAL_MAX_BYTES
    ) {
      throw new GovernanceCollectionError(
        "RESOURCE_LIMIT_EXCEEDED",
        "Dashboard governance sources exceeded the configured byte limit.",
      );
    }
    values.push(value);
  }

  try {
    return projectDashboardGovernance(
      {
        readme: values[0],
        baseline: values[1],
        tracker: values[2],
        calibration: values[3],
      },
      { collectedAt: dependencies.now().toISOString() },
    );
  } catch (error) {
    if (error instanceof GovernanceProjectionError) {
      throw new GovernanceCollectionError(
        "GOVERNANCE_INVALID",
        "Dashboard governance sources failed strict projection.",
      );
    }
    throw error;
  }
}
