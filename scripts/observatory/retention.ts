import {
  ObservatoryPublisherError,
  pruneObservatorySnapshots,
} from "#observatory-publisher";

async function main(): Promise<void> {
  const keep = Number.parseInt(process.argv[2] ?? "30", 10);
  const deleted = await pruneObservatorySnapshots(keep, {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    fetch,
  });
  process.stdout.write(`OBSERVATORY_RETENTION_OK deleted=${deleted}\n`);
}

main().catch((error: unknown) => {
  if (error instanceof ObservatoryPublisherError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
  } else {
    process.stderr.write("OBSERVATORY_RETENTION_FAILED: Retention failed.\n");
  }
  process.exitCode = 1;
});
