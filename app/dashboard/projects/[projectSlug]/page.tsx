import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ProjectControlView } from "@/components/observatory/ProjectControlView";
import { SourceStatus } from "@/components/observatory/SourceStatus";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { findProjectControlProject } from "@/lib/observatory/project-control";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
  type ObservatoryWorkItemRow,
} from "@/lib/observatory/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadBoundWorkItems(projectKey: string, planRevision: number): Promise<{
  items: ObservatoryWorkItemRow[];
  available: boolean;
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    const items = await repository.listWorkItems();
    return {
      items: items.filter(
        (item) =>
          item.project_key === projectKey &&
          item.plan_revision === planRevision &&
          item.stage_id !== null &&
          item.work_package_id !== null,
      ),
      available: true,
    };
  } catch {
    return { items: [], available: false };
  }
}

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
  const projectControlSource = "source_health" in state.snapshot
    ? state.snapshot.source_health.find((source) => source.domain === "project_controls")
    : undefined;
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
  const boundWork = await loadBoundWorkItems(
    project.project.project_key,
    project.project.approved_plan_revision,
  );

  return (
    <section className="observatory-page">
      <div className="project-control-back"><Link className="operator-link" href="/dashboard/projects">← Projects</Link></div>
      <ProjectControlView
        project={project}
        boundWorkItems={boundWork.items}
        workTrackerAvailable={boundWork.available}
        sourceStatus={
          projectControlSource?.status === "fresh" ||
          projectControlSource?.status === "stale"
            ? projectControlSource.status
            : "unknown"
        }
      />
    </section>
  );
}
