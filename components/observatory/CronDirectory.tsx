"use client";

import { useEffect, useMemo, useState } from "react";

import { CronAgentView } from "@/components/observatory/CronAgentView";
import { CronTimeView } from "@/components/observatory/CronTimeView";
import type {
  DashboardCronEntry,
  DashboardCronScheduleType,
} from "@/lib/observatory/dashboard-directory";
import { buildCronOperations } from "@/lib/observatory/cron-operations";

export type CronDirectoryView = "time" | "agents" | "all";

export type CronDirectoryFilters = {
  view: CronDirectoryView;
  q: string;
  owner: string;
  type: "all" | DashboardCronScheduleType;
  enabled: "all" | "enabled" | "disabled" | "unknown";
  health: string;
  sort: "next" | "name" | "owner" | "health";
};

const scheduleLabels: Record<DashboardCronScheduleType, string> = {
  cron: "Calendar expression",
  every: "Fixed interval",
  at: "One-time task",
  stream: "Event-driven",
  unknown: "Not reported",
};

const healthOrder: Record<DashboardCronEntry["health"], number> = {
  failed: 0,
  degraded: 1,
  unknown: 2,
  disabled: 3,
  healthy: 4,
};

function updateUrl(filters: CronDirectoryFilters) {
  const search = new URLSearchParams();
  if (filters.view !== "time") search.set("view", filters.view);
  if (filters.q) search.set("q", filters.q);
  if (filters.owner !== "all") search.set("owner", filters.owner);
  if (filters.type !== "all") search.set("type", filters.type);
  if (filters.enabled !== "all") search.set("enabled", filters.enabled);
  if (filters.health !== "all") search.set("health", filters.health);
  if (filters.sort !== "next") search.set("sort", filters.sort);
  const query = search.toString();
  window.history.replaceState(
    null,
    "",
    `/dashboard/automations${query ? `?${query}` : ""}`,
  );
}

function enabledState(cron: DashboardCronEntry): "enabled" | "disabled" | "unknown" {
  return cron.enabled === true
    ? "enabled"
    : cron.enabled === false
      ? "disabled"
      : "unknown";
}

function nextRunValue(cron: DashboardCronEntry): number {
  if (!cron.nextRunAt) return Number.POSITIVE_INFINITY;
  const value = new Date(cron.nextRunAt).getTime();
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function displayTimestamp(value: string | null, timezone?: string | null): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone ?? "UTC",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function scheduleValue(cron: DashboardCronEntry): string {
  if (!cron.scheduleValue) return "Not reported";
  if (cron.scheduleType !== "every") return cron.scheduleValue;
  const milliseconds = Number(cron.scheduleValue);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return cron.scheduleValue;
  }
  return `${cron.scheduleValue} ms`;
}

function needsAttention(cron: DashboardCronEntry): boolean {
  return (
    cron.health === "failed" ||
    cron.health === "degraded" ||
    (cron.consecutiveErrors ?? 0) > 0
  );
}

function matchesFilters(
  cron: DashboardCronEntry,
  filters: CronDirectoryFilters,
): boolean {
  if (filters.owner !== "all" && cron.owner !== filters.owner) return false;
  if (filters.type !== "all" && cron.scheduleType !== filters.type) return false;
  if (filters.enabled !== "all" && enabledState(cron) !== filters.enabled) {
    return false;
  }
  if (
    filters.health === "attention"
      ? !needsAttention(cron)
      : filters.health !== "all" && cron.health !== filters.health
  ) {
    return false;
  }
  const query = filters.q.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    cron.id,
    cron.name,
    cron.owner,
    cron.health,
    cron.scheduleType,
    cron.scheduleSummary,
    cron.scheduleValue,
    cron.timezone,
    cron.lastStatus,
    cron.runtimeTarget,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function sortCrons(
  crons: DashboardCronEntry[],
  sort: CronDirectoryFilters["sort"],
): DashboardCronEntry[] {
  return [...crons].sort((left, right) => {
    if (sort === "next") {
      return (
        nextRunValue(left) - nextRunValue(right) ||
        left.name.localeCompare(right.name)
      );
    }
    if (sort === "health") {
      return (
        healthOrder[left.health] - healthOrder[right.health] ||
        left.name.localeCompare(right.name)
      );
    }
    const leftValue = sort === "owner" ? left.owner : left.name;
    const rightValue = sort === "owner" ? right.owner : right.name;
    return leftValue.localeCompare(rightValue) || left.name.localeCompare(right.name);
  });
}

function FullCronDirectory({ crons }: { crons: DashboardCronEntry[] }) {
  if (!crons.length) {
    return <p className="empty-text">No Automations match the current filters.</p>;
  }
  return (
    <ul className="dashboard-directory-list dashboard-cron-list" aria-label="Automation directory results">
      {crons.map((cron) => (
        <li key={cron.assetId} data-health={cron.health}>
          <article>
            <div className="observatory-object-title">
              <h3 className="observatory-wrap">{cron.name}</h3>
              <span>{enabledState(cron) === "unknown" ? "Not reported" : enabledState(cron)}</span>
            </div>
            <p>{cron.scheduleSummary}</p>
            <dl>
              <div><dt>Owner</dt><dd>{cron.owner}</dd></div>
              <div><dt>Health</dt><dd>{cron.health}</dd></div>
              <div><dt>Schedule type</dt><dd>{scheduleLabels[cron.scheduleType]}</dd></div>
              <div><dt>Schedule value</dt><dd><code>{scheduleValue(cron)}</code></dd></div>
              <div><dt>Timezone</dt><dd>{cron.timezone ?? "Not reported"}</dd></div>
              <div><dt>Runtime target</dt><dd>{cron.runtimeTarget === "unknown" ? "Not reported" : cron.runtimeTarget}</dd></div>
              <div><dt>Last run</dt><dd>{displayTimestamp(cron.lastRunAt, cron.timezone)}</dd></div>
              <div><dt>Next run</dt><dd>{displayTimestamp(cron.nextRunAt, cron.timezone)}</dd></div>
              <div><dt>Last status</dt><dd>{cron.lastStatus ?? "Not reported"}</dd></div>
              <div><dt>Consecutive errors</dt><dd>{cron.consecutiveErrors ?? "Not reported"}</dd></div>
              <div className="dashboard-directory-wide"><dt>Job ID</dt><dd><code>{cron.id}</code></dd></div>
            </dl>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function CronDirectory({
  crons,
  initialFilters,
  projectionFrom,
  sourceStatus,
  sourceCollectedAt,
}: {
  crons: DashboardCronEntry[];
  initialFilters: CronDirectoryFilters;
  projectionFrom?: string;
  sourceStatus: "fresh" | "stale" | "failed" | "unknown";
  sourceCollectedAt: string | null;
}) {
  const [filters, setFilters] = useState<CronDirectoryFilters>(initialFilters);
  const options = useMemo(
    () => ({
      owners: [...new Set(crons.map((cron) => cron.owner))].sort(),
      health: [...new Set(crons.map((cron) => cron.health))].sort(),
    }),
    [crons],
  );
  const filtered = useMemo(
    () => sortCrons(crons.filter((cron) => matchesFilters(cron, filters)), filters.sort),
    [crons, filters],
  );
  const recurringInput = useMemo(
    () => filtered.filter((cron) => cron.enabled === true && (cron.scheduleType === "cron" || cron.scheduleType === "every")),
    [filtered],
  );
  const model = useMemo(
    () =>
      buildCronOperations(recurringInput, {
        from:
          projectionFrom ??
          sourceCollectedAt ??
          crons[0]?.collectedAt ??
          new Date(0).toISOString(),
      }),
    [crons, projectionFrom, recurringInput, sourceCollectedAt],
  );

  useEffect(() => updateUrl(filters), [filters]);

  function setFilter<Key extends keyof CronDirectoryFilters>(
    key: Key,
    value: CronDirectoryFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const enabledCount = crons.filter((cron) => cron.enabled === true).length;
  const attentionCount = crons.filter(needsAttention).length;
  const recurringAttentionCount = model.recurringJobs.filter(needsAttention).length;
  const scheduleCounts = Object.fromEntries(
    (["cron", "every", "at", "stream"] as const).map((type) => [
      type,
      crons.filter((cron) => cron.scheduleType === type).length,
    ]),
  ) as Record<"cron" | "every" | "at" | "stream", number>;

  return (
    <section className="dashboard-directory" aria-labelledby="cron-directory-heading">
      <div className="dashboard-directory-heading">
        <div>
          <p className="eyebrow">Read-only runtime schedule inventory</p>
          <h2 id="cron-directory-heading">Automations Operations Cockpit</h2>
        </div>
        <div className="dashboard-directory-counts" aria-label="Automation counts">
          <span>{crons.length} Automations</span>
          <span>{enabledCount} enabled</span>
          <span>{attentionCount} needs attention</span>
          <span>{filtered.length} matched</span>
        </div>
      </div>

      {sourceStatus !== "fresh" ? (
        <p className="dashboard-cron-source" role="status" data-status={sourceStatus}>
          Automation source status: {sourceStatus}. The directory is showing the latest
          validated Snapshot
          {sourceCollectedAt ? ` from ${displayTimestamp(sourceCollectedAt)}` : ""}.
        </p>
      ) : null}

      <div className="cron-view-tabs" aria-label="Automation directory view">
        <button type="button" aria-label="Time view" aria-pressed={filters.view === "time"} onClick={() => setFilter("view", "time")}>Time</button>
        <button type="button" aria-label="Agents view" aria-pressed={filters.view === "agents"} onClick={() => setFilter("view", "agents")}>Agents</button>
        <button type="button" aria-label="All Automations view" aria-pressed={filters.view === "all"} onClick={() => setFilter("view", "all")}>All Automations</button>
      </div>

      {filters.view === "all" ? (
        <div className="dashboard-cron-stats" aria-label="Automation directory statistics">
          <button
            type="button"
            aria-label={`All Automations, ${crons.length}`}
            aria-pressed={
              filters.q === "" && filters.owner === "all" && filters.type === "all" &&
              filters.enabled === "all" && filters.health === "all"
            }
            onClick={() =>
              setFilters((current) => ({
                ...current,
                view: "all",
                q: "",
                owner: "all",
                type: "all",
                enabled: "all",
                health: "all",
              }))
            }
          >
            <strong>All Automations</strong><span>{crons.length} total</span>
          </button>
          <button type="button" aria-label={`Enabled Automations, ${enabledCount}`} aria-pressed={filters.enabled === "enabled"} onClick={() => setFilter("enabled", filters.enabled === "enabled" ? "all" : "enabled")}>
            <strong>Enabled Automations</strong><span>{enabledCount} enabled</span>
          </button>
          <button type="button" aria-label={`Needs attention, ${attentionCount}`} aria-pressed={filters.health === "attention"} onClick={() => setFilter("health", filters.health === "attention" ? "all" : "attention")}>
            <strong>Needs attention</strong><span>{attentionCount} Job{attentionCount === 1 ? "" : "s"}</span>
          </button>
          {(["cron", "every", "at", "stream"] as const).map((type) => (
            <button key={type} type="button" aria-pressed={filters.type === type} onClick={() => setFilter("type", filters.type === type ? "all" : type)}>
              <strong>{scheduleLabels[type]}</strong>
              <span>{scheduleCounts[type]} Job{scheduleCounts[type] === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="cron-cockpit-stats" aria-label="Recurring schedule statistics">
          <div><strong>{model.recurringJobs.length}</strong><span>{model.recurringJobs.length} enabled recurring jobs</span></div>
          <div><strong>{model.agentSummaries.length}</strong><span>{model.agentSummaries.length} recurring Agents</span></div>
          <div data-risk="hard"><strong>{model.hardConflicts.length}</strong><span>Hard conflicts · {model.hardConflicts.length}</span></div>
          <div data-risk="crowded"><strong>{model.crowdedWindows.length}</strong><span>Crowded windows · {model.crowdedWindows.length}</span></div>
          <div><strong>{recurringAttentionCount}</strong><span>Recurring jobs needing attention</span></div>
          <div><strong>{model.issues.length}</strong><span>Unable to calculate</span></div>
        </div>
      )}

      <div className="dashboard-directory-controls">
        <label className="dashboard-directory-search">
          <span>Search Automations</span>
          <input type="search" value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="Name, Job ID, Owner, schedule, status…" />
        </label>
        <label>
          <span>Automation owner</span>
          <select value={filters.owner} onChange={(event) => setFilter("owner", event.target.value)}>
            <option value="all">All owners</option>
            {options.owners.map((owner) => <option key={owner}>{owner}</option>)}
          </select>
        </label>
        <label>
          <span>Schedule type</span>
          <select value={filters.type} onChange={(event) => setFilter("type", event.target.value as CronDirectoryFilters["type"])}>
            <option value="all">All schedule types</option>
            <option value="cron">Calendar expression</option>
            <option value="every">Fixed interval</option>
            {filters.view === "all" ? <option value="at">One-time task</option> : null}
            {filters.view === "all" ? <option value="stream">Event-driven</option> : null}
            {filters.view === "all" ? <option value="unknown">Not reported</option> : null}
          </select>
        </label>
        {filters.view === "all" ? (
          <label>
            <span>Enabled state</span>
            <select value={filters.enabled} onChange={(event) => setFilter("enabled", event.target.value as CronDirectoryFilters["enabled"])}>
              <option value="all">All states</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option><option value="unknown">Not reported</option>
            </select>
          </label>
        ) : null}
        <label>
          <span>Run health</span>
          <select value={filters.health} onChange={(event) => setFilter("health", event.target.value)}>
            <option value="all">All health</option><option value="attention">Needs attention</option>
            {options.health.map((health) => <option key={health}>{health}</option>)}
          </select>
        </label>
        {filters.view === "all" ? (
          <label>
            <span>Sort Automations</span>
            <select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value as CronDirectoryFilters["sort"])}>
              <option value="next">Next run</option><option value="name">Name</option><option value="owner">Owner</option><option value="health">Health</option>
            </select>
          </label>
        ) : null}
      </div>

      {filters.view === "time" ? (
        <CronTimeView model={model} />
      ) : filters.view === "agents" ? (
        <CronAgentView model={model} />
      ) : (
        <FullCronDirectory crons={filtered} />
      )}
    </section>
  );
}
