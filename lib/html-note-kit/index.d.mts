import type {
  ArtifactVerificationResult,
  InteractiveBuildResult,
  NoteBuildResult,
} from "./contracts.mjs";

export interface BuildInteractiveArtifactOptions {
  manifestPath: string;
  outputPath?: string;
  force?: boolean;
  preserveDataFrom?: string;
  verifyDeterminism?: boolean;
}

export interface UpdateArtifactDataOptions {
  artifactPath: string;
  manifestPath: string;
  id: string;
  value: unknown;
  outputPath?: string;
  force?: boolean;
  verifyDeterminism?: boolean;
}

export interface BuildNoteOptions {
  inputPath: string;
  outputPath?: string;
  force?: boolean;
}

interface VerifyArtifactSharedOptions {
  requiredDataBlocks?: string[];
  startupTimeoutMs?: number;
}

export type VerifyArtifactOptions = VerifyArtifactSharedOptions &
  (
    | { html: string; path?: never }
    | { path: string; html?: never }
  );

export declare function buildInteractiveArtifact(
  options: BuildInteractiveArtifactOptions,
): Promise<InteractiveBuildResult>;
export declare function updateArtifactData(
  options: UpdateArtifactDataOptions,
): Promise<InteractiveBuildResult>;
export declare function buildNote(
  options: BuildNoteOptions,
): Promise<NoteBuildResult>;
export declare function verifyArtifact(
  options: VerifyArtifactOptions,
): ArtifactVerificationResult;
export declare function extractDataBlocks(html: unknown): Map<string, unknown>;
