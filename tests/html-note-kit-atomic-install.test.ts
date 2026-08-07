import { describe, expect, it } from "vitest";

import { installNoClobber } from "../lib/html-note-kit/atomic-install.mjs";
import { ArtifactBuildError } from "../lib/html-note-kit/errors.mjs";

describe("no-clobber atomic installation", () => {
  it("rolls back the destination, retries exact temp cleanup, and reports failure", () => {
    const temporaryPath = "/bounded/output.tmp";
    const destination = "/bounded/output.html";
    const paths = new Set([temporaryPath]);
    const calls: string[] = [];
    let temporaryUnlinkAttempts = 0;

    const operations = {
      link(source: string, target: string) {
        calls.push(`link:${source}:${target}`);
        paths.add(target);
      },
      unlink(path: string) {
        calls.push(`unlink:${path}`);
        if (path === temporaryPath && temporaryUnlinkAttempts === 0) {
          temporaryUnlinkAttempts += 1;
          const error = new Error("injected cleanup failure") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }
        paths.delete(path);
      },
    };

    expect(() =>
      installNoClobber(temporaryPath, destination, operations),
    ).toThrowError(
      expect.objectContaining({
        code: "ATOMIC_WRITE_FAILED",
        name: "ArtifactBuildError",
      }) as ArtifactBuildError,
    );
    expect(paths).toEqual(new Set());
    expect(calls).toEqual([
      `link:${temporaryPath}:${destination}`,
      `unlink:${temporaryPath}`,
      `unlink:${destination}`,
      `unlink:${temporaryPath}`,
    ]);
  });
});
