import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import {
  ObservatoryCollectorError,
  collectAndWriteObservatorySnapshot,
  type AtomicFileAdapter,
  type CommandInvocation,
  type CommandResult,
  type FileIdentityAdapter,
} from "#observatory-collector";

function runCommand(invocation: CommandInvocation): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(invocation.command, [...invocation.args], {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, invocation.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.resume();
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolveResult({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        timedOut,
      });
    });
  });
}

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
};

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
      readTextFile: async (path) => readFile(path, "utf8"),
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
