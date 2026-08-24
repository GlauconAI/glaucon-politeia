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
  collectObservatorySnapshot,
  upgradeObservatorySnapshotToV2,
  upgradeObservatorySnapshotToV3,
  upgradeObservatorySnapshotToV4,
  upgradeObservatorySnapshotToV5,
  upgradeObservatorySnapshotToV6,
  writeObservatorySnapshotWithSourceProtection,
  type AtomicFileAdapter,
  type FileIdentityAdapter,
} from "#observatory-collector";
import { runCommand } from "#observatory-command-runner";
import { parseObservatoryCollectOptions } from "#observatory-collect-options";
import { ObservatoryCollectionEnvelopeV6Schema } from "#observatory-collection-schema";
import { collectSystemMetadataFromRoots } from "#observatory-filesystem-metadata";
import { collectSystemInventory } from "#observatory-system-collector";
import { collectSourceRepositories } from "#observatory-source-repository-discovery";
import {
  GovernanceCollectionError,
  collectDashboardGovernance,
} from "#observatory-governance-collector";
import {
  ObservatoryProjectExecutionCollectionError,
  collectProjectExecutionSnapshot,
} from "#observatory-project-execution-collector";
import {
  ObservatoryProjectControlCollectionError,
  collectProjectControlSnapshot,
  retainProjectControlLastKnownGood,
  type ProjectControlCollectionResult,
} from "#observatory-project-control-collector";

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

async function readTextFileBounded(
  path: string,
  maxBytes = OBSERVATORY_REGISTRY_HTML_MAX_BYTES,
): Promise<string> {
  const handle = await open(path, "r");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const buffer = Buffer.alloc(
        Math.min(
          64 * 1024,
          maxBytes + 1 - totalBytes,
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
      if (totalBytes > maxBytes) {
        throw new ObservatoryCollectorError(
          "RESOURCE_LIMIT_EXCEEDED",
          `The configured source exceeded the ${maxBytes}-byte input limit.`,
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

async function readPreviousProjectControl(
  destinationPath: string,
): Promise<ProjectControlCollectionResult | undefined> {
  let text: string;
  try {
    text = await readTextFileBounded(destinationPath);
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return undefined;
  }
  const previous = ObservatoryCollectionEnvelopeV6Schema.safeParse(candidate);
  if (!previous.success || !previous.data.project_controls) return undefined;
  const sourceHealth = previous.data.source_health.find(
    (source) => source.domain === "project_controls",
  );
  if (!sourceHealth) return undefined;
  return { snapshot: previous.data.project_controls, sourceHealth };
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
  const options = parseObservatoryCollectOptions(process.argv.slice(2));
  const destinationPath = resolve(
    options.outputPath ?? ".observatory/observatory-snapshot.json",
  );
  await mkdir(dirname(destinationPath), { recursive: true });
  const commonDependencies = {
    runCommand,
    readTextFile: readTextFileBounded,
    now: () => new Date(),
  };
  const writeDependencies = {
    ...commonDependencies,
    files,
    identities,
    createTempPath: (destination: string) =>
      join(
        dirname(destination),
        `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
      ),
  };
  const registryPath = resolve(options.registryPath);
  let snapshot;
  if (options.systemRoots) {
    const coreSnapshot = await collectObservatorySnapshot(
      { registryPath },
      commonDependencies,
    );
    const systemSnapshot = upgradeObservatorySnapshotToV2(
      coreSnapshot,
      await collectSystemInventory(
          {
            agents: coreSnapshot.agents,
            metadata: await collectSystemMetadataFromRoots({
              workspaceRoot: resolve(options.systemRoots.workspaceRoot),
              vaultRoot: resolve(options.systemRoots.vaultRoot),
              ...(options.systemRoots.configPath
                ? { configPath: resolve(options.systemRoots.configPath) }
                : {}),
            }),
          },
          { runCommand, now: () => new Date() },
      ),
    );
    const governanceSnapshot = upgradeObservatorySnapshotToV3(
      systemSnapshot,
      await collectDashboardGovernance(
        { vaultRoot: resolve(options.systemRoots.vaultRoot) },
        {
          realpath,
          readTextFile: readTextFileBounded,
          now: () => new Date(),
        },
      ),
    );
    const repositorySnapshot = upgradeObservatorySnapshotToV4(
      governanceSnapshot,
      await collectSourceRepositories(
        {
          workspaceRoot: resolve(options.systemRoots.workspaceRoot),
          vaultRoot: resolve(options.systemRoots.vaultRoot),
          agents: governanceSnapshot.agents,
          projectGroups: governanceSnapshot.registry.project_groups,
        },
        { now: () => new Date() },
      ),
    );
    const executionSnapshot = upgradeObservatorySnapshotToV5(
      repositorySnapshot,
      await collectProjectExecutionSnapshot(
        {
          exportPath: resolve(options.systemRoots.projectExecutionPath),
        },
        {
          realpath,
          readTextFile: readTextFileBounded,
          now: () => new Date(),
        },
      ),
    );
    if (options.systemRoots.projectControlPath) {
      const previousProjectControl = await readPreviousProjectControl(
        destinationPath,
      );
      const candidateProjectControl = await collectProjectControlSnapshot(
            {
              exportPath: resolve(options.systemRoots.projectControlPath),
            },
            {
              realpath,
              readTextFile: readTextFileBounded,
              now: () => new Date(),
            },
          );
      snapshot = upgradeObservatorySnapshotToV6(
        executionSnapshot,
        retainProjectControlLastKnownGood(
          candidateProjectControl,
          previousProjectControl,
        ),
      );
    } else {
      snapshot = executionSnapshot;
    }
    await writeObservatorySnapshotWithSourceProtection(
      snapshot,
      { registryPath, destinationPath },
      writeDependencies,
    );
  } else {
    snapshot = await collectAndWriteObservatorySnapshot(
      {
        registryPath,
        destinationPath,
      },
      writeDependencies,
    );
  }
  process.stdout.write(
    `Collected Observatory snapshot ${snapshot.source_digest}.\n`,
  );
}

main().catch((error: unknown) => {
  if (
    error instanceof ObservatoryCollectorError ||
    error instanceof GovernanceCollectionError ||
    error instanceof ObservatoryProjectExecutionCollectionError ||
    error instanceof ObservatoryProjectControlCollectionError
  ) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
  } else {
    process.stderr.write("OBSERVATORY_COLLECT_FAILED: Collection failed.\n");
  }
  process.exitCode = 1;
});
