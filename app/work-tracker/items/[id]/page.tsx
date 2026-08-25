import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { WorkItemDetail } from "@/components/observatory/WorkItemDetail";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import {
  createObservatoryRepository,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type WorkItemPageProps = {
  params: Promise<{ id: string }>;
};

function unavailableState() {
  return (
    <section className="work-item-detail work-tracker-error">
      <h1>Work item unavailable</h1>
      <p role="alert">The work item is temporarily unavailable. Try again.</p>
    </section>
  );
}

export default async function WorkItemPage({ params }: WorkItemPageProps) {
  const { id } = await params;
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
  try {
    [evidence, events, claims, overviewState] = await Promise.all([
      repository.listWorkItemEvidence(id),
      repository.listWorkItemEvents(id),
      repository.listWorkItemClaims(id),
      loadObservatoryOverviewState(),
    ]);
  } catch {
    return unavailableState();
  }

  return (
    <WorkItemDetail
      item={item}
      evidence={evidence}
      events={events}
      claims={claims}
      evaluatedAt={new Date().toISOString()}
      currentAdmin={currentAdmin}
      projectControls={
        overviewState.status === "ready" &&
        "project_controls" in overviewState.snapshot
          ? overviewState.snapshot.project_controls
          : null
      }
    />
  );
}
