import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ObservatoryPublisherError,
  publishObservatorySnapshot,
} from "#observatory-publisher";

interface LocalSupabaseConfig {
  API_URL?: string;
  SERVICE_ROLE_KEY?: string;
}

function readLocalConfig(): Promise<LocalSupabaseConfig> {
  return new Promise((resolveConfig, rejectConfig) => {
    const child = spawn("supabase", ["status", "-o", "json"], {
      cwd: process.cwd(),
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024) child.kill("SIGTERM");
      else chunks.push(chunk);
    });
    child.once("error", rejectConfig);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || bytes > 64 * 1024) {
        rejectConfig(new Error("Local Supabase status unavailable."));
        return;
      }
      try {
        resolveConfig(
          JSON.parse(Buffer.concat(chunks).toString("utf8")) as LocalSupabaseConfig,
        );
      } catch {
        rejectConfig(new Error("Local Supabase status was malformed."));
      }
    });
  });
}

async function main(): Promise<void> {
  const snapshot = JSON.parse(
    await readFile(
      resolve(process.argv[2] ?? ".observatory/observatory-snapshot.json"),
      "utf8",
    ),
  ) as { source_digest?: unknown };
  const local = await readLocalConfig();
  if (
    local.API_URL !== "http://127.0.0.1:54321" ||
    typeof local.SERVICE_ROLE_KEY !== "string" ||
    local.SERVICE_ROLE_KEY.length < 32
  ) {
    throw new Error("Refusing a non-loopback or incomplete Supabase target.");
  }
  const dependencies = {
    supabaseUrl: local.API_URL,
    serviceRoleKey: local.SERVICE_ROLE_KEY,
    fetch,
  };
  const first = await publishObservatorySnapshot(snapshot, dependencies);
  const second = await publishObservatorySnapshot(snapshot, dependencies);
  let invalidRejected = false;
  try {
    await publishObservatorySnapshot(
      { status: "failed", error: "must-not-publish" },
      dependencies,
    );
  } catch (error) {
    invalidRejected =
      error instanceof ObservatoryPublisherError &&
      error.code === "INVALID_SNAPSHOT";
  }
  const digest = String(snapshot.source_digest ?? "");
  const query = new URLSearchParams({
    source_digest: `eq.${digest}`,
    select: "source_digest",
  });
  const confirmation = await fetch(
    `${local.API_URL}/rest/v1/observatory_snapshots?${query.toString()}`,
    {
      headers: {
        apikey: local.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`,
      },
      redirect: "error",
    },
  );
  const rows = confirmation.ok ? await confirmation.json() : null;
  const checks = {
    first_publish: first.published && !first.idempotent,
    duplicate_idempotent: !second.published && second.idempotent,
    invalid_rejected: invalidRejected,
    one_digest_row: Array.isArray(rows) && rows.length === 1,
  };
  process.stdout.write(`${JSON.stringify({ status: "pass", checks }, null, 2)}\n`);
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write(
    "OBSERVATORY_LOCAL_PUBLISH_VERIFY_FAILED: Local publication verification failed.\n",
  );
  process.exitCode = 1;
});
