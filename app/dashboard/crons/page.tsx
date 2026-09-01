import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CronDirectory,
  type CronDirectoryFilters,
} from "@/components/observatory/CronDirectory";
import { SourceStatus } from "@/components/observatory/SourceStatus";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  buildCronDirectory,
  type DashboardCronScheduleType,
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
  return allowed.includes(candidate as Value) ? (candidate as Value) : fallback;
}

function filtersFrom(params: SearchParams): CronDirectoryFilters {
  return {
    q: value(params, "q") ?? "",
    owner: value(params, "owner") ?? "all",
    type: oneOf(
      value(params, "type"),
      ["all", "cron", "every", "at", "unknown"] as const satisfies readonly (
        | "all"
        | DashboardCronScheduleType
      )[],
      "all",
    ),
    enabled: oneOf(
      value(params, "enabled"),
      ["all", "enabled", "disabled", "unknown"] as const,
      "all",
    ),
    health: value(params, "health") ?? "all",
    sort: oneOf(
      value(params, "sort"),
      ["next", "name", "owner", "health"] as const,
      "next",
    ),
  };
}

export default async function CronsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard/crons");
  }

  const [state, params] = await Promise.all([
    loadObservatoryOverviewState(),
    searchParams,
  ]);
  const crons =
    state.status === "ready" && "assets" in state.snapshot
      ? buildCronDirectory(state.snapshot.assets)
      : [];
  const source =
    state.status === "ready" && "source_health" in state.snapshot
      ? state.snapshot.source_health.find(
          (candidate) => candidate.domain === "operations",
        )
      : undefined;
  const sourceStatus =
    source?.status === "fresh" ||
    source?.status === "stale" ||
    source?.status === "failed"
      ? source.status
      : "unknown";

  return (
    <section className="observatory-page dashboard-directory-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /dashboard/crons</p>
          <h1>Cron Jobs Directory</h1>
          <p>&gt; inspect every collected schedule without changing Runtime state</p>
        </div>
        <Link className="operator-link" href="/dashboard">
          ← Back to Dashboard
        </Link>
      </header>
      {state.status === "ready" ? (
        <CronDirectory
          crons={crons}
          initialFilters={filtersFrom(params)}
          sourceStatus={sourceStatus}
          sourceCollectedAt={source?.collected_at ?? null}
        />
      ) : (
        <SourceStatus {...state} />
      )}
    </section>
  );
}
