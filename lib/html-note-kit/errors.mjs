export class ArtifactBuildError extends Error {
  #artifactMessage;

  constructor(code, message, details = undefined, options = undefined) {
    super(`${code}: ${message}`, options);
    this.name = "ArtifactBuildError";
    this.code = code;
    this.details = details;
    this.#artifactMessage = message;
  }

  toJSON() {
    const error = {
      code: this.code,
      message: this.#artifactMessage,
    };

    if (this.details !== undefined) {
      error.details = this.details;
    }

    return { ok: false, error };
  }
}
