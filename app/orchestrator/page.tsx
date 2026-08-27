import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";

export const dynamic = "force-dynamic";

export default async function OrchestratorPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/orchestrator");
  }

  return (
    <section className="observatory-page orchestrator-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /orchestrator</p>
          <h1>Orchestrator</h1>
          <p>&gt; coordinate projects, plans, work, and delivery</p>
        </div>
        <div className="orchestrator-hero-actions">
          <div className="shell-status-line" aria-label="Orchestrator access">
            <span>mode: admin</span>
            <span>surface: operator</span>
            <span>artifact: published</span>
          </div>
          <Link
            className="orchestrator-direct-link"
            href="/orchestrator/artifact"
            target="_blank"
            rel="noreferrer"
          >
            Open Orchestrator directly
          </Link>
        </div>
      </header>

      <div className="orchestrator-artifact-shell">
        <iframe
          className="orchestrator-artifact-frame"
          src="/orchestrator/artifact"
          title="Orchestrator control surface"
        />
      </div>
    </section>
  );
}
