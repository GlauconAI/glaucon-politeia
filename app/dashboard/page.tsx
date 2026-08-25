import { redirect } from "next/navigation";

import { ObservatoryOverview } from "@/components/observatory/ObservatoryOverview";
import {
  DashboardSectionNav,
  type DashboardSectionLink,
} from "@/components/observatory/DashboardSectionNav";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";

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
  return sections;
}

export default async function DashboardPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard");
  }

  const overviewState = await loadObservatoryOverviewState();

  return (
    <section className="observatory-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /dashboard</p>
          <h1>Dashboard</h1>
          <p>&gt; inspect the validated system map</p>
        </div>
        <div className="shell-status-line" aria-label="Dashboard access">
          <span>mode: admin</span>
          <span>source: read-only</span>
          <span>authority: observatory projection</span>
        </div>
      </header>

      <DashboardSectionNav sections={dashboardSections(overviewState)} />

      <ObservatoryOverview state={overviewState} />
    </section>
  );
}
