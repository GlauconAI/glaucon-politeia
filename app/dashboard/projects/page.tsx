import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ProjectDirectory,
  type ProjectDirectoryFilters,
} from "@/components/observatory/ProjectDirectory";
import { ProjectExecutionPortfolio } from "@/components/observatory/ProjectExecutionPortfolio";
import { ProjectControlPortfolio } from "@/components/observatory/ProjectControlPortfolio";
import { SourceStatus } from "@/components/observatory/SourceStatus";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  buildProjectDirectory,
  buildProjectExecutionDirectory,
} from "@/lib/observatory/dashboard-directory";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function value(params: SearchParams, key: string): string | undefined {
  const candidate = params[key];
  return Array.isArray(candidate) ? candidate[0] : candidate;
}

function oneOf<Value extends string>(
  candidate: string | undefined,
  allowed: readonly Value[],
  fallback: Value,
): Value {
  return allowed.includes(candidate as Value)
    ? (candidate as Value)
    : fallback;
}

function filtersFrom(params: SearchParams): ProjectDirectoryFilters {
  return {
    q: value(params, "q") ?? "",
    owner: value(params, "owner") ?? "all",
    status: value(params, "status") ?? "all",
    scene: value(params, "scene") ?? "all",
    repository: oneOf(
      value(params, "repository"),
      ["all", "linked", "unlinked"] as const,
      "all",
    ),
    sort: oneOf(
      value(params, "sort"),
      ["recent", "name", "owner", "status"] as const,
      "recent",
    ),
  };
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard/projects");
  }

  const [state, params] = await Promise.all([
    loadObservatoryOverviewState(),
    searchParams,
  ]);
  const projects =
    state.status === "ready"
      ? buildProjectDirectory(
          state.snapshot.registry,
          "source_repositories" in state.snapshot
            ? state.snapshot.source_repositories.repositories
            : [],
        )
      : [];
  const projectExecutionSnapshot =
    state.status === "ready" && "project_executions" in state.snapshot
      ? state.snapshot.project_executions
      : null;
  const projectExecutionSource =
    state.status === "ready" && "source_health" in state.snapshot
      ? state.snapshot.source_health.find(
          (source) => source.domain === "project_executions",
        )
      : undefined;
  const projectControlSource =
    state.status === "ready" && "source_health" in state.snapshot
      ? state.snapshot.source_health.find(
          (source) => source.domain === "project_controls",
        )
      : undefined;
  const projectControlSnapshot =
    state.status === "ready" && "project_controls" in state.snapshot
      ? state.snapshot.project_controls
      : null;
  const projectExecutionEntries =
    state.status === "ready"
      ? buildProjectExecutionDirectory(
          state.snapshot.registry,
          projectExecutionSnapshot,
        )
      : [];

  return (
    <section className="observatory-page dashboard-directory-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /dashboard/projects</p>
          <h1>Projects Directory</h1>
          <p>&gt; scan the canonical Project registry without the long page</p>
        </div>
        <Link className="operator-link" href="/dashboard">
          ← Back to Dashboard
        </Link>
      </header>
      {state.status === "ready" ? (
        <>
          <ProjectControlPortfolio
            snapshot={projectControlSnapshot}
            sourceStatus={
              projectControlSource?.status === "fresh" ||
              projectControlSource?.status === "stale"
                ? projectControlSource.status
                : "unknown"
            }
            collectedAt={
              projectControlSnapshot?.collected_at ??
              projectControlSource?.collected_at ??
              null
            }
            registryProjects={projects.map((project) => ({
              projectKey: project.projectKey,
              title: project.title,
            }))}
          />
          <ProjectExecutionPortfolio
            projects={projectExecutionEntries}
            sourceAvailable={
              "project_executions" in state.snapshot &&
              state.snapshot.project_executions !== null
            }
            sourceStatus={
              projectExecutionSource?.status === "fresh" ||
              projectExecutionSource?.status === "stale"
                ? projectExecutionSource.status
                : "unknown"
            }
            collectedAt={
              projectExecutionSnapshot?.collected_at ??
              projectExecutionSource?.collected_at ??
              null
            }
          />
          <ProjectDirectory
            projects={projects}
            initialFilters={filtersFrom(params)}
          />
        </>
      ) : (
        <SourceStatus {...state} />
      )}
    </section>
  );
}
