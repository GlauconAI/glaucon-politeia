"use client";

import { useMemo, useState } from "react";

import { ProjectExecutionLanes } from "@/components/observatory/ProjectExecutionLanes";
import type { DashboardProjectExecutionEntry } from "@/lib/observatory/dashboard-directory";

type Filters = {
  project: string;
  owner: string;
  status: string;
  transferMode: string;
  freshness: string;
};

const defaultFilters: Filters = {
  project: "all",
  owner: "all",
  status: "all",
  transferMode: "all",
  freshness: "all",
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function matchLabel(match: DashboardProjectExecutionEntry["match"]) {
  if (match === "catalog_only") return "Catalog only — runtime unmatched";
  if (match === "runtime_only") return "Runtime only — catalog unmatched";
  return "Catalog + runtime matched";
}

function formatCollected(value: string | null) {
  if (!value) return "Not collected";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ProjectExecutionPortfolio({
  projects,
  sourceAvailable,
  sourceStatus,
  collectedAt,
}: {
  projects: DashboardProjectExecutionEntry[];
  sourceAvailable: boolean;
  sourceStatus: "fresh" | "stale" | "unknown";
  collectedAt: string | null;
}) {
  const [filters, setFilters] = useState(defaultFilters);
  const options = useMemo(
    () => ({
      owners: [
        ...new Set(
          projects.flatMap((project) => [
            project.owner,
            ...project.executionLines.map((line) => line.owner_agent_id),
          ]),
        ),
      ].sort(),
      statuses: [
        ...new Set(
          projects.flatMap((project) =>
            project.executionLines.map((line) => line.status),
          ),
        ),
      ].sort(),
    }),
    [projects],
  );
  const filtered = useMemo(
    () =>
      projects
        .filter(
          (project) =>
            (filters.project === "all" || project.projectKey === filters.project) &&
            (filters.freshness === "all" || project.freshness === filters.freshness),
        )
        .map((project) => ({
          ...project,
          executionLines: project.executionLines.filter(
            (line) =>
              (filters.owner === "all" || line.owner_agent_id === filters.owner) &&
              (filters.status === "all" || line.status === filters.status) &&
              (filters.transferMode === "all" ||
                line.transfer_mode === filters.transferMode),
          ),
        }))
        .filter(
          (project) =>
            project.executionLines.length > 0 ||
            (filters.owner === "all" &&
              filters.status === "all" &&
              filters.transferMode === "all"),
        ),
    [filters, projects],
  );

  const summary = useMemo(
    () => ({
      activeProjects: projects.filter((project) => project.summary.activeCount > 0)
        .length,
      activeLines: projects.reduce(
        (total, project) => total + project.summary.activeCount,
        0,
      ),
      blocked: projects.reduce(
        (total, project) => total + project.summary.blockedCount,
        0,
      ),
      waiting: projects.reduce(
        (total, project) => total + project.summary.waitingCount,
        0,
      ),
      independent: projects.reduce(
        (total, project) => total + project.summary.independentOwnerLineCount,
        0,
      ),
      stale: projects.filter((project) => project.freshness === "stale").length,
    }),
    [projects],
  );

  function setFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="project-execution-portfolio" aria-labelledby="project-execution-heading">
      <div className="dashboard-directory-heading">
        <div>
          <p className="eyebrow">Project Flow observability</p>
          <h2 id="project-execution-heading">Project execution</h2>
        </div>
        <div className="project-execution-source" aria-live="polite">
          <span className={`project-execution-source-${sourceStatus}`}>
            {sourceStatus === "fresh"
              ? "Fresh source"
              : sourceStatus === "stale"
                ? "Stale source"
                : "Source unknown"}
          </span>
          <time dateTime={collectedAt ?? undefined}>
            {formatCollected(collectedAt)} UTC
          </time>
        </div>
      </div>

      {!sourceAvailable ? (
        <p className="project-execution-callout" role="status">
          Project execution data unavailable. Canonical Project directory data remains visible below.
        </p>
      ) : (
        <>
          <dl className="project-execution-summary" aria-label="Project execution portfolio summary">
            <div><dt>Active Projects</dt><dd>{countLabel(summary.activeProjects, "active Project")}</dd></div>
            <div><dt>Active Agent Lines</dt><dd>{countLabel(summary.activeLines, "active Agent line")}</dd></div>
            <div><dt>Blocked</dt><dd>{summary.blocked}</dd></div>
            <div><dt>Waiting</dt><dd>{summary.waiting}</dd></div>
            <div><dt>Independent Owner Lines</dt><dd>{countLabel(summary.independent, "independent Owner line")}</dd></div>
            <div><dt>Stale Sources</dt><dd>{summary.stale}</dd></div>
          </dl>

          {projects.length ? (
            <>
              <div
                className="project-execution-filters"
                role="group"
                aria-label="Project execution filters"
              >
                <label>
                  <span>Execution Project</span>
                  <select value={filters.project} onChange={(event) => setFilter("project", event.target.value)}>
                    <option value="all">All Projects</option>
                    {projects.map((project) => (
                      <option key={project.projectKey} value={project.projectKey}>{project.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Execution owner</span>
                  <select value={filters.owner} onChange={(event) => setFilter("owner", event.target.value)}>
                    <option value="all">All owners</option>
                    {options.owners.map((owner) => <option key={owner}>{owner}</option>)}
                  </select>
                </label>
                <label>
                  <span>Execution status</span>
                  <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
                    <option value="all">All statuses</option>
                    {options.statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
                <label>
                  <span>Transfer mode</span>
                  <select value={filters.transferMode} onChange={(event) => setFilter("transferMode", event.target.value)}>
                    <option value="all">All control modes</option>
                    <option value="project_executor">Returns to PM</option>
                    <option value="independent_owner_line">User + Owner line</option>
                  </select>
                </label>
                <label>
                  <span>Execution freshness</span>
                  <select value={filters.freshness} onChange={(event) => setFilter("freshness", event.target.value)}>
                    <option value="all">All freshness</option>
                    <option value="fresh">Fresh</option>
                    <option value="stale">Stale</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>

              {filtered.length ? (
                <ul className="project-execution-grid" aria-label="Project execution results">
                  {filtered.map((project) => (
                    <li key={project.projectKey}>
                      <article className="project-execution-project">
                        <header>
                          <div>
                            <p className="eyebrow">{project.projectKey}</p>
                            <h3>{project.title}</h3>
                          </div>
                          <span className={`project-execution-freshness freshness-${project.freshness}`}>
                            {project.freshness}
                          </span>
                        </header>
                        <p className="project-execution-match">{matchLabel(project.match)}</p>
                        <dl className="project-execution-project-meta">
                          <div><dt>Owner</dt><dd>{project.owner}</dd></div>
                          <div><dt>Status</dt><dd>{project.status}</dd></div>
                          <div><dt>Stage</dt><dd>{project.currentStage ?? "Not reported"}</dd></div>
                          <div><dt>Gate</dt><dd>{project.currentGate ?? "Not reported"}</dd></div>
                        </dl>
                        <ProjectExecutionLanes lines={project.executionLines} />
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-text">No execution lines match the current filters.</p>
              )}
            </>
          ) : (
            <p className="project-execution-callout">No Project execution lines published yet.</p>
          )}
        </>
      )}
    </section>
  );
}
