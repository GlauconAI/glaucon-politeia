import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { WorkTrackerCaptureDrawer } from "@/components/observatory/WorkTrackerCaptureDrawer";
import { ProjectVersionManager } from "@/components/observatory/ProjectVersionManager";
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
import {
  buildWorkTrackerProjectOptions,
  filterTrackedWorkTrackerProjects,
} from "@/lib/observatory/work-tracker-projects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadWorkTrackerState(): Promise<WorkTrackerBoardState> {
  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    const [items, activeClaims, versions] = await Promise.all([
      repository.listWorkItems(),
      repository.listActiveWorkItemClaims(),
      repository.listProjectVersions(),
    ]);
    return {
      status: "ready",
      items,
      activeClaims,
      versions,
      evaluatedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "error",
      message: "Work Tracker is temporarily unavailable. Try again.",
    };
  }
}

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string): string | undefined {
  const candidate = params[key];
  return Array.isArray(candidate) ? candidate[0] : candidate;
}

export default async function WorkTrackerPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<SearchParams>;
} = {}) {
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/work-tracker");
  }

  const [state, overviewState, params] = await Promise.all([
    loadWorkTrackerState(),
    loadObservatoryOverviewState(),
    searchParams,
  ]);
  if (overviewState.status !== "ready") {
    return (
      <section className="observatory-page work-tracker-page">
        <div className="work-tracker-error">
          <p role="alert">Work Tracker is temporarily unavailable. Try again.</p>
        </div>
      </section>
    );
  }
  const projects = buildWorkTrackerProjectOptions(overviewState.snapshot.registry);
  const agentIds = overviewState.snapshot.agents?.map((agent) => agent.id) ?? [];
  const trackedProjects =
    state.status === "ready"
      ? filterTrackedWorkTrackerProjects(projects, state.items)
      : [];
  const requestedProject = searchValue(params, "project");
  const initialProjectKey = trackedProjects.some(
    (project) => project.projectKey === requestedProject,
  )
    ? requestedProject!
    : "all";
  const initialIdempotencyKey = `observatory-capture-${randomUUID()}`;
  const requestedVersion = searchValue(params, "version");
  let versions = state.status === "ready" ? state.versions ?? [] : [];
  if (state.status === "ready" && projects.length > 0) {
    const missingBacklogs = projects
      .filter((project) => !versions.some((version) => version.project_key === project.projectKey && version.is_backlog))
      .map((project) => project.projectKey);
    if (missingBacklogs.length > 0) {
      try {
        const supabase = await createSupabaseServerClient();
        const repository = createObservatoryRepository(supabase as unknown as ObservatoryRepositoryClient);
        versions = await repository.ensureProjectBacklogs(projects.map((project) => project.projectKey));
      } catch {
        return (
          <section className="observatory-page work-tracker-page">
            <div className="work-tracker-error"><p role="alert">Work Tracker Project Versions are temporarily unavailable. Try again.</p></div>
          </section>
        );
      }
    }
  }
  const initialProjectVersionId = initialProjectKey !== "all" && versions.some(
    (version) => version.id === requestedVersion && version.project_key === initialProjectKey,
  ) ? requestedVersion! : "all";
  const initialView = searchValue(params, "view") === "completed" ? "completed" : "active";

  return (
    <section className="observatory-page work-tracker-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /work-tracker</p>
          <h1>Work Tracker</h1>
          <p>&gt; 管理、推进并审计真实工作事项</p>
        </div>
        <div className="work-tracker-hero-actions">
          <div className="shell-status-line" aria-label="Work Tracker access">
            <span>mode: admin</span>
            <span>workflow: audited write</span>
            <span>agent claim: bounded</span>
          </div>
          <WorkTrackerCaptureDrawer
            initialIdempotencyKey={initialIdempotencyKey}
            projects={projects}
            agentIds={agentIds}
            versions={versions}
          />
          <ProjectVersionManager projects={projects} versions={versions} />
        </div>
      </header>

      <div className="observatory-layout work-tracker-layout">
        <WorkTrackerBoard
          state={state}
          projects={projects}
          initialProjectKey={initialProjectKey}
          initialProjectVersionId={initialProjectVersionId}
          initialView={initialView}
          versions={versions}
          urlProjectKey={requestedProject}
        />
      </div>
    </section>
  );
}
