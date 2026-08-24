import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectControlView } from "@/components/observatory/ProjectControlView";
import { SourceStatus } from "@/components/observatory/SourceStatus";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { findProjectControlProject } from "@/lib/observatory/project-control";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";

export const dynamic = "force-dynamic";

export default async function ProjectControlPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) redirect(`/auth?redirectTo=/dashboard/projects/${encodeURIComponent(projectSlug)}`);

  const state = await loadObservatoryOverviewState();
  if (state.status !== "ready") {
    return (
      <section className="observatory-page">
        <header className="observatory-hero"><div><p className="eyebrow shell-path">402v /dashboard/projects/{projectSlug}</p><h1>Project Control</h1></div></header>
        <SourceStatus {...state} />
      </section>
    );
  }
  const snapshot = "project_controls" in state.snapshot ? state.snapshot.project_controls : null;
  if (!snapshot) {
    return (
      <section className="observatory-page">
        <header className="observatory-hero">
          <div><p className="eyebrow shell-path">402v /dashboard/projects/{projectSlug}</p><h1>Project Control</h1><p>&gt; canonical control projection is not available</p></div>
          <Link className="operator-link" href="/dashboard/projects">← Projects</Link>
        </header>
        <p className="project-execution-callout" role="status">Project Control data unavailable. No Vault or private runtime state was scanned.</p>
      </section>
    );
  }
  const project = findProjectControlProject(snapshot, projectSlug);
  if (!project) notFound();

  return (
    <section className="observatory-page">
      <div className="project-control-back"><Link className="operator-link" href="/dashboard/projects">← Projects</Link></div>
      <ProjectControlView project={project} />
    </section>
  );
}
