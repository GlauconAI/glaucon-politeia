import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ObservatoryCollectionEnvelopeSchema } from "#observatory-collection-schema";
import {
  markObservatorySnapshotReleaseEvidence,
  ObservatoryPublisherError,
} from "#observatory-publisher";

async function main(): Promise<void> {
  const snapshotPath = process.argv[2];
  if (!snapshotPath) {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "Usage: observatory:mark-release <snapshot-path>",
    );
  }
  let snapshot;
  try {
    snapshot = ObservatoryCollectionEnvelopeSchema.parse(
      JSON.parse(await readFile(resolve(snapshotPath), "utf8")),
    );
  } catch {
    throw new ObservatoryPublisherError(
      "INVALID_SNAPSHOT",
      "The release evidence snapshot is missing or invalid.",
    );
  }
  await markObservatorySnapshotReleaseEvidence(snapshot.source_digest, {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    fetch,
  });
  process.stdout.write("OBSERVATORY_RELEASE_EVIDENCE_MARKED\n");
}

main().catch((error: unknown) => {
  if (error instanceof ObservatoryPublisherError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
  } else {
    process.stderr.write("OBSERVATORY_RELEASE_MARK_FAILED: Marking failed.\n");
  }
  process.exitCode = 1;
});
