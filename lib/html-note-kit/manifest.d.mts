import type { ArtifactManifest } from "./contracts.mjs";

export declare function getArtifactManifestInternals(
  manifest: unknown,
): unknown;
export declare function loadArtifactManifest(
  manifestInput: unknown,
): Promise<ArtifactManifest>;
