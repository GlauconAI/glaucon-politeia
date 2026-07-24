import "server-only";

import { ObservatoryCollectionEnvelopeSchema } from "@/lib/observatory/collection-schema";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";

export type ObservatoryOverviewState =
  | { status: "ready"; snapshot: ObservatoryCollectionEnvelope }
  | { status: "empty" }
  | { status: "error"; message: string };

export async function loadObservatoryOverviewState(): Promise<ObservatoryOverviewState> {
  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    const row = await repository.getLatestSuccessfulSnapshot();

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
