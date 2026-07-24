import "server-only";

import { unstable_cache } from "next/cache";

import { ObservatoryCollectionEnvelopeSchema } from "@/lib/observatory/collection-schema";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
  type ObservatorySnapshotRow,
} from "@/lib/observatory/repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";

export type ObservatoryOverviewState =
  | { status: "ready"; snapshot: ObservatoryCollectionEnvelope }
  | { status: "empty" }
  | { status: "error"; message: string };

export interface ObservatoryOverviewDependencies {
  getLatestSuccessfulSnapshot(): Promise<ObservatorySnapshotRow | null>;
}

export async function readObservatoryOverviewState(
  dependencies: ObservatoryOverviewDependencies,
): Promise<ObservatoryOverviewState> {
  try {
    const row = await dependencies.getLatestSuccessfulSnapshot();

    if (!row) return { status: "empty" };

    const parsed = ObservatoryCollectionEnvelopeSchema.safeParse(row.payload);
    if (!parsed.success) {
      return {
        status: "error",
        message: "The latest snapshot failed validation and was not rendered.",
      };
    }

    return { status: "ready", snapshot: parsed.data };
  } catch {
    return {
      status: "error",
      message: "The latest snapshot could not be loaded. Try again later.",
    };
  }
}

async function readDefaultObservatoryOverviewState() {
  const repository = createObservatoryRepository(
    createSupabaseAdminClient() as unknown as ObservatoryRepositoryClient,
  );
  return readObservatoryOverviewState(repository);
}

const readCachedObservatoryOverviewState = unstable_cache(
  readDefaultObservatoryOverviewState,
  ["observatory-overview-v1"],
  {
    revalidate: 60,
    tags: ["observatory-overview"],
  },
);

export async function loadObservatoryOverviewState(): Promise<ObservatoryOverviewState> {
  return readCachedObservatoryOverviewState();
}
