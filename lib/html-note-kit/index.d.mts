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

export interface VerifyArtifactOptions {
  html?: string;
  path?: string;
  requiredDataBlocks?: string[];
  startupTimeoutMs?: number;
}

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
