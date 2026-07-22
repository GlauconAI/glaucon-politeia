import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ObservatoryPublisherError,
  publishObservatorySnapshot,
} from "#observatory-publisher";

async function main(): Promise<void> {
  const snapshotArgument = process.argv[2];
  if (!snapshotArgument) {
    throw new ObservatoryPublisherError(
      "INVALID_SNAPSHOT",
      "Usage: npm run observatory:publish -- <snapshot-path>",
    );
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(await readFile(resolve(snapshotArgument), "utf8"));
  } catch {
    throw new ObservatoryPublisherError(
      "INVALID_SNAPSHOT",
      "The local Observatory snapshot file is missing or malformed.",
    );
  }
  const result = await publishObservatorySnapshot(candidate, {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    fetch,
  });
  process.stdout.write(
    result.idempotent
      ? "Observatory snapshot already exists.\n"
      : "Observatory snapshot published.\n",
  );
}

main().catch((error: unknown) => {
  if (error instanceof ObservatoryPublisherError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
  } else {
    process.stderr.write("OBSERVATORY_PUBLISH_FAILED: Publication failed.\n");
  }
  process.exitCode = 1;
});
