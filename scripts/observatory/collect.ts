import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  OBSERVATORY_REGISTRY_HTML_MAX_BYTES,
  ObservatoryCollectorError,
  collectAndWriteObservatorySnapshot,
  type AtomicFileAdapter,
  type FileIdentityAdapter,
} from "#observatory-collector";
import { runCommand } from "#observatory-command-runner";

const files: AtomicFileAdapter = {
  openExclusive: async (path) => {
    const handle = await open(path, "wx", 0o600);
    return {
      write: async (content) => {
        await handle.writeFile(content, "utf8");
      },
      sync: async () => {
        await handle.sync();
      },
      close: async () => {
        await handle.close();
      },
    };
  },
  rename,
  remove: async (path) => {
    await unlink(path);
  },
  syncDirectory: async (path) => {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
};

async function readTextFileBounded(path: string): Promise<string> {
  const handle = await open(path, "r");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const buffer = Buffer.alloc(
        Math.min(
          64 * 1024,
          OBSERVATORY_REGISTRY_HTML_MAX_BYTES + 1 - totalBytes,
        ),
      );
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        null,
      );
      if (bytesRead === 0) break;
      totalBytes += bytesRead;
      if (totalBytes > OBSERVATORY_REGISTRY_HTML_MAX_BYTES) {
        throw new ObservatoryCollectorError(
          "RESOURCE_LIMIT_EXCEEDED",
          `The canonical registry source exceeded the ${OBSERVATORY_REGISTRY_HTML_MAX_BYTES}-byte input limit.`,
        );
      }
      chunks.push(buffer.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, totalBytes).toString("utf8");
  } finally {
    await handle.close();
  }
}

function isMissing(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

const identities: FileIdentityAdapter = {
  realpathIfExists: async (path) => {
    try {
      return await realpath(path);
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
  statIfExists: async (path) => {
    try {
      const identity = await stat(path);
      return { device: identity.dev, inode: identity.ino };
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  },
};

async function main(): Promise<void> {
  const registryArgument = process.argv[2];
  if (!registryArgument) {
    throw new ObservatoryCollectorError(
      "REGISTRY_READ_FAILED",
      "Usage: npm run observatory:collect -- <canonical-registry-path> [output-path]",
    );
  }
  const destinationPath = resolve(
    process.argv[3] ?? ".observatory/observatory-snapshot.json",
  );
  await mkdir(dirname(destinationPath), { recursive: true });
  const snapshot = await collectAndWriteObservatorySnapshot(
    {
      registryPath: resolve(registryArgument),
      destinationPath,
    },
    {
      runCommand,
      readTextFile: readTextFileBounded,
      now: () => new Date(),
      files,
      identities,
      createTempPath: (destination) =>
        join(
          dirname(destination),
          `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
        ),
    },
  );
  process.stdout.write(
    `Collected Observatory snapshot ${snapshot.source_digest}.\n`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof ObservatoryCollectorError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
  } else {
    process.stderr.write("OBSERVATORY_COLLECT_FAILED: Collection failed.\n");
  }
  process.exitCode = 1;
});
