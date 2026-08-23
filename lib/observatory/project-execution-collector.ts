import { dirname, isAbsolute, relative } from "node:path";

import type { ObservatorySourceHealth } from "#observatory-asset-schema";
import {
  ProjectExecutionSnapshotSchema,
  computeProjectExecutionDigest,
  type ProjectExecutionSnapshot,
} from "#observatory-project-execution-schema";

export const OBSERVATORY_PROJECT_EXECUTION_MAX_BYTES = 5 * 1024 * 1024;

export type ObservatoryProjectExecutionCollectionErrorCode =
  | "PROJECT_EXECUTION_PATH_ESCAPE"
  | "PROJECT_EXECUTION_SOURCE_INVALID"
  | "PROJECT_EXECUTION_DIGEST_MISMATCH"
  | "PROJECT_EXECUTION_RESOURCE_LIMIT_EXCEEDED"
  | "PROJECT_EXECUTION_READ_FAILED";

export class ObservatoryProjectExecutionCollectionError extends Error {
  readonly code: ObservatoryProjectExecutionCollectionErrorCode;

  constructor(
    code: ObservatoryProjectExecutionCollectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ObservatoryProjectExecutionCollectionError";
    this.code = code;
  }
}

export interface ProjectExecutionCollectorDependencies {
  now(): Date;
  realpath(path: string): Promise<string>;
  readTextFile(path: string, maxBytes: number): Promise<string>;
}

export interface ProjectExecutionCollectionResult {
  snapshot: ProjectExecutionSnapshot | null;
  sourceHealth: ObservatorySourceHealth;
}

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function missingSource(collectedAt: string): ProjectExecutionCollectionResult {
  return {
    snapshot: null,
    sourceHealth: {
      domain: "project_executions",
      status: "unknown",
      health: "degraded",
      collected_at: collectedAt,
      last_success_at: null,
      asset_count: 0,
      error_code: "PROJECT_EXECUTION_SOURCE_MISSING",
    },
  };
}

export async function collectProjectExecutionSnapshot(
  input: { exportPath: string },
  dependencies: ProjectExecutionCollectorDependencies,
): Promise<ProjectExecutionCollectionResult> {
  const observedAt = dependencies.now().toISOString();
  let canonicalParent: string;
  let canonicalFile: string;
  try {
    [canonicalParent, canonicalFile] = await Promise.all([
      dependencies.realpath(dirname(input.exportPath)),
      dependencies.realpath(input.exportPath),
    ]);
  } catch (error) {
    if (isMissing(error)) return missingSource(observedAt);
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_READ_FAILED",
      "Unable to resolve the explicit Project execution export.",
    );
  }

  const relativePath = relative(canonicalParent, canonicalFile);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_PATH_ESCAPE",
      "The Project execution export resolves outside its configured directory.",
    );
  }

  let sourceText: string;
  try {
    sourceText = await dependencies.readTextFile(
      input.exportPath,
      OBSERVATORY_PROJECT_EXECUTION_MAX_BYTES,
    );
  } catch (error) {
    if (isMissing(error)) return missingSource(observedAt);
    if (error instanceof ObservatoryProjectExecutionCollectionError) {
      throw error;
    }
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_READ_FAILED",
      "Unable to read the explicit Project execution export.",
    );
  }
  if (
    Buffer.byteLength(sourceText, "utf8") >
    OBSERVATORY_PROJECT_EXECUTION_MAX_BYTES
  ) {
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_RESOURCE_LIMIT_EXCEEDED",
      "The Project execution export exceeded the bounded input limit.",
    );
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(sourceText);
  } catch {
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_SOURCE_INVALID",
      "The Project execution export is not valid JSON.",
    );
  }
  const parsed = ProjectExecutionSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_SOURCE_INVALID",
      "The Project execution export failed strict public schema validation.",
    );
  }
  if (computeProjectExecutionDigest(parsed.data) !== parsed.data.digest) {
    throw new ObservatoryProjectExecutionCollectionError(
      "PROJECT_EXECUTION_DIGEST_MISMATCH",
      "The Project execution export digest does not match its content.",
    );
  }

  const stale = parsed.data.projects.some(
    (project) => project.project.freshness === "stale",
  );
  return {
    snapshot: parsed.data,
    sourceHealth: {
      domain: "project_executions",
      status: stale ? "stale" : "fresh",
      health: stale ? "degraded" : "healthy",
      collected_at: parsed.data.collected_at,
      last_success_at: parsed.data.collected_at,
      asset_count: parsed.data.summary.project_count,
    },
  };
}
