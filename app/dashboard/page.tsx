import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { ObservatoryOverview } from "@/components/observatory/ObservatoryOverview";
import {
  DashboardSectionNav,
  type DashboardSectionLink,
} from "@/components/observatory/DashboardSectionNav";
import { QuickCapture } from "@/components/observatory/QuickCapture";
import {
  WorkTrackerBoard,
  type WorkTrackerBoardState,
} from "@/components/observatory/WorkTrackerBoard";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function dashboardSections(
  state: Awaited<ReturnType<typeof loadObservatoryOverviewState>>,
): DashboardSectionLink[] {
  const sections: DashboardSectionLink[] = [
    { id: "dashboard-snapshot", label: "Snapshot" },
  ];
  if (state.status === "ready") {
    sections.push({ id: "dashboard-index", label: "Index" });
    if ("assets" in state.snapshot) {
      sections.push({ id: "dashboard-sources", label: "Sources" });
      if ("source_repositories" in state.snapshot) {
        sections.push({
          id: "dashboard-repositories",
          label: "Repositories",
        });
      }
      sections.push(
        { id: "dashboard-inventory", label: "Inventory" },
        { id: "dashboard-topology", label: "Topology" },
      );
    }
    sections.push({ id: "dashboard-objects", label: "Objects" });
    if ("delivery_governance" in state.snapshot) {
      sections.push(
        { id: "dashboard-projects", label: "Projects" },
        { id: "dashboard-roadmap", label: "Roadmap" },
        { id: "dashboard-analytics", label: "Analytics" },
        { id: "dashboard-review", label: "Review" },
      );
    }
  }
  sections.push(
    { id: "dashboard-capture", label: "Capture" },
    { id: "dashboard-work", label: "Work" },
  );
  return sections;
}

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

export default async function DashboardPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard");
  }

  const [overviewState, workTrackerState] = await Promise.all([
    loadObservatoryOverviewState(),
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

      <DashboardSectionNav sections={dashboardSections(overviewState)} />

      <div className="observatory-layout">
        <ObservatoryOverview state={overviewState} />
        <aside
          id="dashboard-capture"
          className="observatory-capture dashboard-section-anchor"
          aria-label="Work item capture"
          data-dashboard-section
        >
          <QuickCapture initialIdempotencyKey={initialIdempotencyKey} />
        </aside>
      </div>
      <div
        id="dashboard-work"
        className="dashboard-section-anchor"
        data-dashboard-section
      >
        <WorkTrackerBoard state={workTrackerState} />
      </div>
    </section>
  );
}
