import Link from "next/link";
import { redirect } from "next/navigation";

import {
  SkillDirectory,
  type SkillDirectoryFilters,
} from "@/components/observatory/SkillDirectory";
import { SourceStatus } from "@/components/observatory/SourceStatus";
import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  buildSkillDirectory,
  dashboardSkillCategories,
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

function filtersFrom(params: SearchParams): SkillDirectoryFilters {
  return {
    q: value(params, "q") ?? "",
    category: oneOf(
      value(params, "category"),
      ["all", ...dashboardSkillCategories] as const,
      "all",
    ),
    health: value(params, "health") ?? "all",
    agent: value(params, "agent") ?? "all",
    source: value(params, "source") ?? "all",
    sort: oneOf(
      value(params, "sort"),
      ["name", "agents", "instances", "health"] as const,
      "name",
    ),
  };
}

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard/skills");
  }

  const [state, params] = await Promise.all([
    loadObservatoryOverviewState(),
    searchParams,
  ]);
  const skills =
    state.status === "ready" && "assets" in state.snapshot
      ? buildSkillDirectory(state.snapshot.assets)
      : [];

  return (
    <section className="observatory-page dashboard-directory-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /dashboard/skills</p>
          <h1>Skills Directory</h1>
          <p>&gt; browse unique Skills and their Agent-visible instances</p>
        </div>
        <Link className="operator-link" href="/dashboard">
          ← Back to Dashboard
        </Link>
      </header>
      {state.status === "ready" ? (
        <SkillDirectory
          skills={skills}
          initialFilters={filtersFrom(params)}
        />
      ) : (
        <SourceStatus {...state} />
      )}
    </section>
  );
}
