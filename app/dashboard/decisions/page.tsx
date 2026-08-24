import Link from "next/link";
import { redirect } from "next/navigation";

import { DecisionCenter } from "@/components/observatory/DecisionCenter";
import { SourceStatus } from "@/components/observatory/SourceStatus";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { listProjectControlDecisions } from "@/lib/observatory/project-control";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) redirect("/auth?redirectTo=/dashboard/decisions");
  const state = await loadObservatoryOverviewState();
  const snapshot = state.status === "ready" && "project_controls" in state.snapshot
    ? state.snapshot.project_controls
    : null;
  const source = state.status === "ready" && "source_health" in state.snapshot
    ? state.snapshot.source_health.find((entry) => entry.domain === "project_controls")
    : undefined;

  return (
    <section className="observatory-page">
      <header className="observatory-hero">
        <div><p className="eyebrow shell-path">402v /dashboard/decisions</p><p>&gt; inspect evidence, options, downstream impact, and the audit trail</p></div>
        <Link className="operator-link" href="/dashboard/projects">← Projects</Link>
      </header>
      {state.status !== "ready" ? <SourceStatus {...state} /> : snapshot ? (
        <DecisionCenter
          decisions={listProjectControlDecisions(snapshot)}
          sourceStatus={source?.status === "fresh" || source?.status === "stale" ? source.status : "unknown"}
          collectedAt={snapshot.collected_at ?? source?.collected_at ?? null}
        />
      ) : <p className="project-execution-callout" role="status">Decision projection unavailable. No decision can be inferred from chat, Vault files, or private runtime state.</p>}
    </section>
  );
}
