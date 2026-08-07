import type {
  ArtifactManifest,
  InteractiveModel,
} from "./contracts.mjs";

export declare const INTERACTIVE_SLOTS: readonly [
  "navigation",
  "heroSupplementary",
  "mainSections",
  "rail",
  "footer",
];
export declare function renderInteractiveModel(
  manifest: ArtifactManifest | unknown,
  options?: unknown,
): Promise<InteractiveModel>;
