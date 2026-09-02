import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { WorkItemDetail } from "@/components/observatory/WorkItemDetail";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { buildWorkTrackerProjectOptions } from "@/lib/observatory/work-tracker-projects";
import { buildWorkTrackerHref } from "@/lib/observatory/work-tracker-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type WorkItemPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function unavailableState() {
  return (
    <section className="work-item-detail work-tracker-error">
      <h1>Work item unavailable</h1>
      <p role="alert">The work item is temporarily unavailable. Try again.</p>
    </section>
  );
}

export default async function WorkItemPage({ params, searchParams = Promise.resolve({}) }: WorkItemPageProps) {
  const { id } = await params;
  const requestedContext = await searchParams;
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect(`/auth?redirectTo=/work-tracker/items/${id}`);
  }
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  let repository;
  try {
    const supabase = await createSupabaseServerClient();
    repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
  } catch {
    return unavailableState();
  }

  let item;
  try {
    item = await repository.getWorkItem(id);
  } catch {
    return unavailableState();
  }
  if (!item) {
    notFound();
  }

  let evidence;
  let events;
  let claims;
  let overviewState;
  let versions;
  try {
    [evidence, events, claims, overviewState, versions] = await Promise.all([
      repository.listWorkItemEvidence(id),
      repository.listWorkItemEvents(id),
      repository.listWorkItemClaims(id),
      loadObservatoryOverviewState(),
      repository.listProjectVersions(),
    ]);
  } catch {
    return unavailableState();
  }

  const projects = overviewState.status === "ready"
    ? buildWorkTrackerProjectOptions(overviewState.snapshot.registry)
    : [];
  const value = (key: string) => {
    const entry = requestedContext[key];
    return Array.isArray(entry) ? entry[0] : entry;
  };
  const requestedProject = value("project");
  const projectKey = projects.some((project) => project.projectKey === requestedProject)
    ? requestedProject
    : undefined;
  const requestedVersion = value("version");
  const projectVersionId = projectKey && versions.some(
    (version) => version.id === requestedVersion && version.project_key === projectKey,
  ) ? requestedVersion : undefined;
  const view = value("view") === "completed" ? "completed" : "active";

  return (
    <WorkItemDetail
      item={item}
      evidence={evidence}
      events={events}
      claims={claims}
      evaluatedAt={new Date().toISOString()}
      currentAdmin={currentAdmin}
      projects={projects}
      versions={versions}
      backHref={buildWorkTrackerHref({ projectKey, projectVersionId, view })}
      agentIds={
        overviewState.status === "ready"
          ? (overviewState.snapshot.agents ?? []).map((agent) => agent.id)
          : []
      }
      projectControls={
        overviewState.status === "ready" &&
        "project_controls" in overviewState.snapshot
          ? overviewState.snapshot.project_controls
          : null
      }
    />
  );
}
