import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { QuickCapture } from "@/components/observatory/QuickCapture";
import {
  WorkTrackerBoard,
  type WorkTrackerBoardState,
} from "@/components/observatory/WorkTrackerBoard";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadWorkTrackerState(): Promise<WorkTrackerBoardState> {
  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    const [items, activeClaims] = await Promise.all([
      repository.listWorkItems(),
      repository.listActiveWorkItemClaims(),
    ]);
    return {
      status: "ready",
      items,
      activeClaims,
      evaluatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "error",
      message: "Work Tracker is temporarily unavailable. Try again.",
    };
  }
}

export default async function WorkTrackerPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/work-tracker");
  }

  const state = await loadWorkTrackerState();
  const initialIdempotencyKey = `observatory-capture-${randomUUID()}`;

  return (
    <section className="observatory-page work-tracker-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /work-tracker</p>
          <h1>Work Tracker</h1>
          <p>&gt; 管理、推进并审计真实工作事项</p>
        </div>
        <div className="shell-status-line" aria-label="Work Tracker access">
          <span>mode: admin</span>
          <span>workflow: audited write</span>
          <span>agent claim: bounded</span>
        </div>
      </header>

      <div className="observatory-layout work-tracker-layout">
        <aside className="observatory-capture" aria-label="Work item capture">
          <QuickCapture initialIdempotencyKey={initialIdempotencyKey} />
        </aside>
        <WorkTrackerBoard state={state} />
      </div>
    </section>
  );
}
