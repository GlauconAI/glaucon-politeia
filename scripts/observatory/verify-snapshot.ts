import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ObservatoryCollectionEnvelopeV5Schema,
  ObservatoryCollectionEnvelopeV6Schema,
} from "#observatory-collection-schema";
import { computeObservatorySnapshotDigest } from "#observatory-collector";
import { scanObservatoryPrivacy } from "#observatory-privacy-scan";

async function main(): Promise<void> {
  const snapshotPath = resolve(
    process.argv[2] ?? ".observatory/observatory-snapshot.json",
  );
  const metadata = await stat(snapshotPath);
  const snapshot = ObservatoryCollectionEnvelopeV5Schema.or(
    ObservatoryCollectionEnvelopeV6Schema,
  ).parse(
    JSON.parse(await readFile(snapshotPath, "utf8")),
  );
  const expectedSourceDomains = snapshot.schema_version === "6.0.0" ? 9 : 8;
  const privacyCategoryCounts = scanObservatoryPrivacy(snapshot);
  const checks = {
    mode_0600: (metadata.mode & 0o777) === 0o600,
    digest_matches:
      snapshot.source_digest === computeObservatorySnapshotDigest(snapshot) &&
      snapshot.registry.source.digest === snapshot.source_digest,
    successful: snapshot.status === "success",
    all_domains_present: snapshot.source_health.length === expectedSourceDomains,
    no_dangling_relationships: snapshot.relationships.every(
      (relationship) =>
        snapshot.core_endpoint_ids.includes(relationship.from) ||
        snapshot.assets.some((asset) => asset.id === relationship.from),
    ) && snapshot.relationships.every(
      (relationship) =>
        snapshot.core_endpoint_ids.includes(relationship.to) ||
        snapshot.assets.some((asset) => asset.id === relationship.to),
    ),
    privacy_clean: Object.values(privacyCategoryCounts).every(
      (count) => count === 0,
    ),
  };
  process.stdout.write(
    `${JSON.stringify(
      {
        schema_version: snapshot.schema_version,
        counts: {
          assets: snapshot.assets.length,
          relationships: snapshot.relationships.length,
          source_health: snapshot.source_health.length,
          source_repositories:
            snapshot.source_repositories.repositories.length,
          project_executions:
            snapshot.project_executions?.summary.project_count ?? 0,
          project_controls:
            snapshot.schema_version === "6.0.0"
              ? snapshot.project_controls?.summary.project_count ?? 0
              : 0,
          milestones: snapshot.delivery_governance.summary.milestone_count,
          features: snapshot.delivery_governance.summary.feature_count,
          tasks: snapshot.delivery_governance.summary.task_count,
          executor_runs: snapshot.delivery_governance.summary.run_count,
          gates: snapshot.delivery_governance.summary.gate_count,
        },
        checks,
        privacy_category_counts: privacyCategoryCounts,
      },
      null,
      2,
    )}\n`,
  );
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write("OBSERVATORY_VERIFY_FAILED: Snapshot verification failed.\n");
  process.exitCode = 1;
});
