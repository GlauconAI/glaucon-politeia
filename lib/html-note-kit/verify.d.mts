import type {
  ArtifactStartupResult,
  ArtifactVerificationResult,
} from "./contracts.mjs";

export declare function verifyArtifactStartup(
  html: unknown,
  options?: unknown,
): ArtifactStartupResult;
export declare function verifyArtifactHtml(
  html: unknown,
  options?: unknown,
): ArtifactVerificationResult;
export declare function verifyArtifactFile(
  path: unknown,
  options?: unknown,
): ArtifactVerificationResult;
