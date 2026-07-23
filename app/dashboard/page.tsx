import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import {
  ObservatoryOverview,
  type ObservatoryOverviewState,
} from "@/components/observatory/ObservatoryOverview";
import { QuickCapture } from "@/components/observatory/QuickCapture";
import {
  WorkTrackerBoard,
  type WorkTrackerBoardState,
} from "@/components/observatory/WorkTrackerBoard";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { ObservatoryCollectionEnvelopeSchema } from "@/lib/observatory/collection-schema";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadOverviewState(): Promise<ObservatoryOverviewState> {
  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    const row = await repository.getLatestSuccessfulSnapshot();

    if (!row) {
      return { status: "empty" };
    }

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

async function loadWorkTrackerState(): Promise<WorkTrackerBoardState> {
  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    return { status: "ready", items: await repository.listWorkItems() };
  } catch {
    return {
      status: "error",
      message: "Work Tracker is temporarily unavailable. Try again.",
    };
  }
}

export default async function DashboardPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard");
  }

  const [overviewState, workTrackerState] = await Promise.all([
    loadOverviewState(),
    loadWorkTrackerState(),
  ]);
  const initialIdempotencyKey = `observatory-capture-${randomUUID()}`;

  return (
    <section className="observatory-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /dashboard</p>
          <h1>Dashboard</h1>
          <p>&gt; inspect the validated system map and capture the next signal</p>
        </div>
        <div className="shell-status-line" aria-label="Dashboard access">
          <span>mode: admin</span>
          <span>source: read-only</span>
          <span>work tracker: audited write</span>
        </div>
      </header>

      <div className="observatory-layout">
        <ObservatoryOverview state={overviewState} />
        <aside className="observatory-capture" aria-label="Work item capture">
          <QuickCapture initialIdempotencyKey={initialIdempotencyKey} />
        </aside>
      </div>
      <WorkTrackerBoard state={workTrackerState} />
    </section>
  );
}
