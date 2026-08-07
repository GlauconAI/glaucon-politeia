#!/usr/bin/env node

import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";
import {
  buildInteractiveArtifact,
  updateArtifactData,
  verifyArtifact,
} from "../lib/html-note-kit/index.mjs";
import { readUtf8File } from "../lib/html-note-kit/io.mjs";
import { ARTIFACT_RESOURCE_LIMITS } from "../lib/html-note-kit/resource-limits.mjs";

const sendMessage = process.send?.bind(process);
let handled = false;

process.once("message", async (request) => {
  if (handled || !isRequest(request) || sendMessage === undefined) return;
  handled = true;

  try {
    let result;
    if (request.command === "build-artifact") {
      result = await buildInteractiveArtifact(request.options);
    } else if (request.command === "update-data") {
      result = await runUpdate(request.options);
    } else if (request.command === "verify") {
      result = verifyArtifact(request.options);
    } else {
      throw new ArtifactBuildError(
        "INVALID_CLI_ARGUMENTS",
        "Artifact worker received an unsupported command",
      );
    }
    sendEnvelope({
      token: request.token,
      kind: "result",
      payload: result,
    });
  } catch (error) {
    const normalized =
      error instanceof ArtifactBuildError
        ? error.toJSON()
        : new ArtifactBuildError(
            "UNEXPECTED_CLI_ERROR",
            "HTML artifact command failed unexpectedly",
          ).toJSON();
    sendEnvelope({
      token: request.token,
      kind: "error",
      payload: normalized.error,
    });
  }
});

function isRequest(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.token === "string" &&
    value.token.length === 64 &&
    (value.command === "build-artifact" ||
      value.command === "update-data" ||
      value.command === "verify") &&
    value.options !== null &&
    typeof value.options === "object"
  );
}

async function runUpdate(options) {
  const loaded = readUtf8File(options.inputPath, {
    maximumBytes: ARTIFACT_RESOURCE_LIMITS.rawJsonBytes,
  });
  let value;
  try {
    value = JSON.parse(loaded.content);
  } catch (cause) {
    throw new ArtifactBuildError(
      "INVALID_DATA_BLOCK",
      "Update input must contain strict JSON",
      { input: loaded.path },
      { cause },
    );
  }
  return updateArtifactData({
    artifactPath: options.artifactPath,
    manifestPath: options.manifestPath,
    id: options.id,
    value,
    ...(options.outputPath === undefined
      ? {}
      : { outputPath: options.outputPath }),
    force: options.force,
  });
}

function sendEnvelope(envelope) {
  sendMessage(envelope, () => {
    try {
      process.disconnect();
    } catch {
      // The parent owns timeout and abnormal-exit normalization.
    }
  });
}
