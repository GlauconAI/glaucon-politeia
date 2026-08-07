import type {
  VerifyArtifactOptions,
} from "../lib/html-note-kit/index.mjs";
import type {
  ArtifactManifest,
  ArtifactSlots,
} from "../lib/html-note-kit/contracts.mjs";

const verifyHtml: VerifyArtifactOptions = { html: "<!doctype html>" };
const verifyPath: VerifyArtifactOptions = { path: "artifact.html" };

// @ts-expect-error verifyArtifact requires one input source.
const verifyMissingSource: VerifyArtifactOptions = {};

// @ts-expect-error verifyArtifact accepts only one input source.
const verifyAmbiguousSource: VerifyArtifactOptions = {
  html: "<!doctype html>",
  path: "artifact.html",
};

const emptyRendererSlots: ArtifactSlots = {};

const manifestWithUnlabelledSvg: ArtifactManifest = {
  contractVersion: 1,
  mode: "interactive",
  rootDirectory: ".",
  metadata: {
    title: "Artifact",
    description: "Artifact description",
    eyebrow: "402v",
    lang: "en",
  },
  dataBlocks: [],
  renderer: "./renderer.mjs",
  styles: [],
  scripts: [],
  svgAssets: [{ id: "map", source: "./map.svg" }],
  requiredDataBlocks: [],
};

void verifyHtml;
void verifyPath;
void verifyMissingSource;
void verifyAmbiguousSource;
void emptyRendererSlots;
void manifestWithUnlabelledSvg;
