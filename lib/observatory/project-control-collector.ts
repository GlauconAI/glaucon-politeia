import { basename, dirname, isAbsolute, relative } from "node:path";

import type { ObservatorySourceHealth } from "#observatory-asset-schema";
import {
  ProjectControlSnapshotSchema,
  computeProjectControlDigest,
  type ProjectControlSnapshot,
} from "#observatory-project-control-schema";
import { scanObservatoryPrivacy } from "#observatory-privacy-scan";

export const OBSERVATORY_PROJECT_CONTROL_MAX_BYTES = 10 * 1024 * 1024;

export type ObservatoryProjectControlCollectionErrorCode =
  | "PROJECT_CONTROL_PATH_INVALID"
  | "PROJECT_CONTROL_PATH_ESCAPE"
  | "PROJECT_CONTROL_SOURCE_INVALID"
  | "PROJECT_CONTROL_PRIVACY_VIOLATION"
  | "PROJECT_CONTROL_DIGEST_MISMATCH"
  | "PROJECT_CONTROL_RESOURCE_LIMIT_EXCEEDED"
  | "PROJECT_CONTROL_READ_FAILED";

export class ObservatoryProjectControlCollectionError extends Error {
  readonly code: ObservatoryProjectControlCollectionErrorCode;

  constructor(
    code: ObservatoryProjectControlCollectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ObservatoryProjectControlCollectionError";
    this.code = code;
  }
}

export interface ProjectControlCollectorDependencies {
  now(): Date;
  realpath(path: string): Promise<string>;
  readTextFile(path: string, maxBytes: number): Promise<string>;
}

export interface ProjectControlCollectionResult {
  snapshot: ProjectControlSnapshot | null;
  sourceHealth: ObservatorySourceHealth;
}

export function retainProjectControlLastKnownGood(
  candidate: ProjectControlCollectionResult,
  previous?: ProjectControlCollectionResult,
): ProjectControlCollectionResult {
  if (
    candidate.snapshot ||
    !previous?.snapshot ||
    computeProjectControlDigest(previous.snapshot) !== previous.snapshot.digest
  ) return candidate;
  return {
    snapshot: previous.snapshot,
    sourceHealth: {
      domain: "project_controls",
      status: "stale",
      health: "degraded",
      collected_at: candidate.sourceHealth.collected_at,
      last_success_at:
        previous.sourceHealth.last_success_at ?? previous.snapshot.collected_at,
      asset_count: previous.snapshot.summary.project_count,
      error_code:
        candidate.sourceHealth.error_code ?? "PROJECT_CONTROL_REFRESH_FAILED",
    },
  };
}

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export async function collectProjectControlSnapshot(
  input: { exportPath: string },
  dependencies: ProjectControlCollectorDependencies,
): Promise<ProjectControlCollectionResult> {
  const observedAt = dependencies.now().toISOString();
  if (basename(input.exportPath) !== "project-control-snapshot.json") {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_PATH_INVALID",
      "Expected the exact Project Control export filename.",
    );
  }
  let canonicalParent: string;
  let canonicalFile: string;
  try {
    [canonicalParent, canonicalFile] = await Promise.all([
      dependencies.realpath(dirname(input.exportPath)),
      dependencies.realpath(input.exportPath),
    ]);
  } catch (error) {
    if (isMissing(error)) {
      return {
        snapshot: null,
        sourceHealth: {
          domain: "project_controls",
          status: "unknown",
          health: "degraded",
          collected_at: observedAt,
          last_success_at: null,
          asset_count: 0,
          error_code: "PROJECT_CONTROL_SOURCE_MISSING",
        },
      };
    }
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_READ_FAILED",
      "Unable to resolve the explicit Project Control export.",
    );
  }

  const relativePath = relative(canonicalParent, canonicalFile);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) ||
    isAbsolute(relativePath)
  ) {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_PATH_ESCAPE",
      "The Project Control export resolves outside its configured directory.",
    );
  }

  let text: string;
  try {
    text = await dependencies.readTextFile(
      canonicalFile,
      OBSERVATORY_PROJECT_CONTROL_MAX_BYTES,
    );
  } catch (error) {
    if (error instanceof ObservatoryProjectControlCollectionError) throw error;
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_READ_FAILED",
      "Unable to read the explicit Project Control export.",
    );
  }
  if (Buffer.byteLength(text, "utf8") > OBSERVATORY_PROJECT_CONTROL_MAX_BYTES) {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_RESOURCE_LIMIT_EXCEEDED",
      "The Project Control export exceeded the bounded input limit.",
    );
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_SOURCE_INVALID",
      "The Project Control export is not valid JSON.",
    );
  }
  const privacyCounts = scanObservatoryPrivacy(candidate);
  if (Object.values(privacyCounts).some((count) => count > 0)) {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_PRIVACY_VIOLATION",
      "The Project Control export failed the aggregate privacy scan.",
    );
  }
  const parsed = ProjectControlSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_SOURCE_INVALID",
      "The Project Control export failed strict public schema validation.",
    );
  }
  if (computeProjectControlDigest(parsed.data) !== parsed.data.digest) {
    throw new ObservatoryProjectControlCollectionError(
      "PROJECT_CONTROL_DIGEST_MISMATCH",
      "The Project Control export digest does not match its content.",
    );
  }
  const stale = parsed.data.projects.some(
    (project) => project.project.freshness === "stale",
  );
  return {
    snapshot: parsed.data,
    sourceHealth: {
      domain: "project_controls",
      status: stale ? "stale" : "fresh",
      health: stale ? "degraded" : "healthy",
      collected_at: parsed.data.collected_at,
      last_success_at: parsed.data.collected_at,
      asset_count: parsed.data.summary.project_count,
    },
  };
}
