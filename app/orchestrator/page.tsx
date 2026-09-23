import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrchestratorArtifactFrame } from "@/components/orchestrator/OrchestratorArtifactFrame";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Maestro — Multi-Agent Orchestrator",
};

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
          <h1>Maestro — Multi-Agent Orchestrator</h1>
          <p>从请求到可信交付</p>
        </div>
        <div className="orchestrator-hero-actions">
          <div className="shell-status-line" aria-label="Maestro access">
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
            Open Maestro directly
          </Link>
        </div>
      </header>

      <div className="orchestrator-artifact-shell">
        <OrchestratorArtifactFrame />
      </div>
    </section>
  );
}
