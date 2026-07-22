import { isIP } from "node:net";

import { ObservatoryCollectionEnvelopeSchema } from "#observatory-collection-schema";
import { computeObservatorySnapshotDigest } from "#observatory-collector";

export type ObservatoryPublisherErrorCode =
  | "INVALID_SNAPSHOT"
  | "DIGEST_MISMATCH"
  | "CONFIG_MISSING"
  | "PUBLISH_FAILED"
  | "DUPLICATE_CONFIRM_FAILED"
  | "RETENTION_FAILED"
  | "RELEASE_MARK_FAILED";

export class ObservatoryPublisherError extends Error {
  readonly code: ObservatoryPublisherErrorCode;

  constructor(code: ObservatoryPublisherErrorCode, message: string) {
    super(message);
    this.name = "ObservatoryPublisherError";
    this.code = code;
  }
}

export interface ObservatoryPublisherDependencies {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: typeof fetch;
}

export interface ObservatoryPublishResult {
  published: boolean;
  idempotent: boolean;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (normalized === "localhost" || normalized === "::1") return true;
  return isIP(normalized) === 4 && normalized.split(".")[0] === "127";
}

function endpointFor(supabaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "SUPABASE_URL is missing or invalid.",
    );
  }
  if (
    url.protocol !== "https:" &&
    (url.protocol !== "http:" || !isLoopbackHostname(url.hostname))
  ) {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "SUPABASE_URL must use HTTPS; HTTP is allowed only for loopback development endpoints.",
    );
  }
  return `${url.toString().replace(/\/$/u, "")}/rest/v1/observatory_snapshots`;
}

function rpcEndpointFor(supabaseUrl: string, rpcName: string): string {
  const snapshotsEndpoint = endpointFor(supabaseUrl);
  return snapshotsEndpoint.replace(
    /\/rest\/v1\/observatory_snapshots$/u,
    `/rest/v1/rpc/${rpcName}`,
  );
}

function serviceRoleHeaders(serviceRoleKey: string) {
  if (!serviceRoleKey) {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
  }
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

async function request(
  fetchAdapter: typeof fetch,
  input: string,
  init: RequestInit,
  failureCode: "PUBLISH_FAILED" | "DUPLICATE_CONFIRM_FAILED",
): Promise<Response> {
  try {
    return await fetchAdapter(input, { ...init, redirect: "error" });
  } catch {
    throw new ObservatoryPublisherError(
      failureCode,
      failureCode === "PUBLISH_FAILED"
        ? "Supabase snapshot publication failed. Verify connectivity and server configuration."
        : "The duplicate digest could not be confirmed in Supabase.",
    );
  }
}

export async function publishObservatorySnapshot(
  input: unknown,
  dependencies: ObservatoryPublisherDependencies,
): Promise<ObservatoryPublishResult> {
  if (!dependencies.serviceRoleKey) {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
  }
  const endpoint = endpointFor(dependencies.supabaseUrl);
  const parsed = ObservatoryCollectionEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ObservatoryPublisherError(
      "INVALID_SNAPSHOT",
      "Only schema-valid successful Observatory snapshots can be published.",
    );
  }
  const snapshot = parsed.data;
  const digest = computeObservatorySnapshotDigest(snapshot);
  if (
    snapshot.source_digest !== digest ||
    snapshot.registry.source.digest !== digest
  ) {
    throw new ObservatoryPublisherError(
      "DIGEST_MISMATCH",
      "The Observatory snapshot digest does not match its validated content.",
    );
  }

  const headers = {
    apikey: dependencies.serviceRoleKey,
    Authorization: `Bearer ${dependencies.serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  const response = await request(
    dependencies.fetch,
    endpoint,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        schema_version: snapshot.schema_version,
        generated_at: snapshot.generated_at,
        source_digest: snapshot.source_digest,
        payload: snapshot,
        summary: snapshot.summary,
        collector_version: snapshot.collector_version,
        status: snapshot.status,
      }),
    },
    "PUBLISH_FAILED",
  );
  if (response.ok) return { published: true, idempotent: false };
  if (response.status !== 409) {
    throw new ObservatoryPublisherError(
      "PUBLISH_FAILED",
      `Supabase rejected the Observatory snapshot with HTTP ${response.status}.`,
    );
  }

  const query = new URLSearchParams({
    source_digest: `eq.${snapshot.source_digest}`,
    select: "source_digest",
    limit: "1",
  });
  const confirmation = await request(
    dependencies.fetch,
    `${endpoint}?${query.toString()}`,
    {
      method: "GET",
      headers: {
        apikey: dependencies.serviceRoleKey,
        Authorization: `Bearer ${dependencies.serviceRoleKey}`,
        Accept: "application/json",
      },
    },
    "DUPLICATE_CONFIRM_FAILED",
  );
  if (!confirmation.ok) {
    throw new ObservatoryPublisherError(
      "DUPLICATE_CONFIRM_FAILED",
      "The duplicate digest could not be confirmed in Supabase.",
    );
  }
  let matches: unknown;
  try {
    matches = await confirmation.json();
  } catch {
    throw new ObservatoryPublisherError(
      "DUPLICATE_CONFIRM_FAILED",
      "The duplicate digest confirmation response was invalid.",
    );
  }
  const exists =
    Array.isArray(matches) &&
    matches.some(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        "source_digest" in value &&
        value.source_digest === snapshot.source_digest,
    );
  if (!exists) {
    throw new ObservatoryPublisherError(
      "DUPLICATE_CONFIRM_FAILED",
      "Supabase did not confirm the duplicate Observatory snapshot digest.",
    );
  }
  return { published: false, idempotent: true };
}

export async function pruneObservatorySnapshots(
  keep: number,
  dependencies: ObservatoryPublisherDependencies,
): Promise<number> {
  if (!Number.isSafeInteger(keep) || keep < 1 || keep > 365) {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "The Observatory retention count must be an integer from 1 to 365.",
    );
  }
  const response = await request(
    dependencies.fetch,
    rpcEndpointFor(dependencies.supabaseUrl, "prune_observatory_snapshots"),
    {
      method: "POST",
      headers: serviceRoleHeaders(dependencies.serviceRoleKey),
      body: JSON.stringify({ p_keep: keep }),
    },
    "PUBLISH_FAILED",
  );
  if (!response.ok) {
    throw new ObservatoryPublisherError(
      "RETENTION_FAILED",
      `Supabase rejected Observatory retention with HTTP ${response.status}.`,
    );
  }
  try {
    const deleted = await response.json();
    if (!Number.isSafeInteger(deleted) || deleted < 0) throw new TypeError();
    return deleted;
  } catch {
    throw new ObservatoryPublisherError(
      "RETENTION_FAILED",
      "Supabase returned an invalid Observatory retention result.",
    );
  }
}

export async function markObservatorySnapshotReleaseEvidence(
  digest: string,
  dependencies: ObservatoryPublisherDependencies,
): Promise<void> {
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new ObservatoryPublisherError(
      "CONFIG_MISSING",
      "The release evidence digest must be a lowercase SHA-256 digest.",
    );
  }
  const response = await request(
    dependencies.fetch,
    rpcEndpointFor(
      dependencies.supabaseUrl,
      "mark_observatory_snapshot_release",
    ),
    {
      method: "POST",
      headers: serviceRoleHeaders(dependencies.serviceRoleKey),
      body: JSON.stringify({ p_digest: digest }),
    },
    "PUBLISH_FAILED",
  );
  if (!response.ok) {
    throw new ObservatoryPublisherError(
      "RELEASE_MARK_FAILED",
      `Supabase rejected the release evidence marker with HTTP ${response.status}.`,
    );
  }
}
