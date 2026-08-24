"use client";

import { useMemo, useState } from "react";

import type {
  ObservatorySourceRepository,
  ObservatorySourceRepositoryInventory,
} from "@/lib/observatory/source-repository-schema";

type RepositoryScopeFilter = "all" | ObservatorySourceRepository["scope"];
type WorkingTreeFilter =
  | "all"
  | ObservatorySourceRepository["working_tree"];
type ActivityFilter = "all" | ObservatorySourceRepository["activity"];

function displayDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat("en-CA", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date);
}

function archiveLabel(
  state: ObservatorySourceRepository["archive_state"],
): string {
  if (state === "archived") return "Archived";
  if (state === "active") return "Not archived";
  return "Archive status unknown";
}

function searchableText(repository: ObservatorySourceRepository): string {
  return [
    repository.id,
    repository.name,
    repository.scope,
    repository.local_ref,
    repository.maintainer_agent_id,
    repository.knowledge_area,
    repository.github?.owner,
    repository.github?.repo,
    repository.current_branch,
    repository.default_branch,
    repository.head,
    repository.working_tree,
    repository.activity,
    repository.archive_state,
    ...repository.registry_project_keys,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function SourceRepositoryInventory({
  inventory,
}: {
  inventory: ObservatorySourceRepositoryInventory;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<RepositoryScopeFilter>("all");
  const [workingTree, setWorkingTree] =
    useState<WorkingTreeFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const repositories = useMemo(
    () =>
      inventory.repositories.filter((repository) => {
        if (scope !== "all" && repository.scope !== scope) return false;
        if (
          workingTree !== "all" &&
          repository.working_tree !== workingTree
        ) {
          return false;
        }
        if (activity !== "all" && repository.activity !== activity) {
          return false;
        }
        return (
          normalizedQuery.length === 0 ||
          searchableText(repository).includes(normalizedQuery)
        );
      }),
    [
      activity,
      inventory.repositories,
      normalizedQuery,
      scope,
      workingTree,
    ],
  );
  const summary = {
    total: inventory.repositories.length,
    github: inventory.repositories.filter((repository) => repository.github)
      .length,
    dirty: inventory.repositories.filter(
      (repository) => repository.working_tree === "dirty",
    ).length,
    stale: inventory.repositories.filter(
      (repository) => repository.activity === "stale",
    ).length,
  };

  return (
    <section
      className="observatory-repository-inventory"
      aria-labelledby="source-repositories-heading"
    >
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Local Git metadata only</p>
          <h2 id="source-repositories-heading">Source repositories</h2>
        </div>
        <span>{repositories.length} shown</span>
      </div>

      <ul
        className="observatory-repository-summary"
        aria-label="Source repository summary"
      >
        <li>{summary.total} repositories</li>
        <li>{summary.github} GitHub linked</li>
        <li>{summary.dirty} dirty</li>
        <li>{summary.stale} stale</li>
      </ul>

      <div className="observatory-repository-controls">
        <label>
          <span>Search source repositories</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repository, Agent, project…"
          />
        </label>
        <label>
          <span>Repository scope</span>
          <select
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as RepositoryScopeFilter)
            }
          >
            <option value="all">All scopes</option>
            <option value="workspace">OpenClaw workspace</option>
            <option value="vault">Obsidian Vault</option>
          </select>
        </label>
        <label>
          <span>Working tree</span>
          <select
            value={workingTree}
            onChange={(event) =>
              setWorkingTree(event.target.value as WorkingTreeFilter)
            }
          >
            <option value="all">All working trees</option>
            <option value="clean">Clean</option>
            <option value="dirty">Dirty</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span>Repository activity</span>
          <select
            value={activity}
            onChange={(event) =>
              setActivity(event.target.value as ActivityFilter)
            }
          >
            <option value="all">All activity</option>
            <option value="active">Active</option>
            <option value="stale">Stale</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>

      {inventory.source_health.status === "failed" ? (
        <p className="observatory-repository-failure" role="status">
          Repository collection failed.{" "}
          <code>
            {inventory.source_health.error_code ?? "SOURCE_OUTPUT_INVALID"}
          </code>
        </p>
      ) : repositories.length ? (
        <ul className="observatory-repository-list">
          {repositories.map((repository) => (
            <li key={repository.id} data-health={repository.health}>
              <article>
                <div className="observatory-object-title">
                  <h3 className="observatory-wrap">{repository.name}</h3>
                  <span>{repository.scope}</span>
                </div>
                <p className="observatory-repository-link">
                  {repository.github ? (
                    <a
                      href={repository.github.url}
                      rel="noreferrer noopener"
                    >
                      {repository.github.owner}/{repository.github.repo}
                    </a>
                  ) : (
                    "Local repository · no GitHub origin"
                  )}
                </p>
                <dl>
                  <div>
                    <dt>Maintainer</dt>
                    <dd>
                      {repository.maintainer_agent_id ??
                        repository.knowledge_area ??
                        "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      <code>{repository.local_ref}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Branch</dt>
                    <dd>
                      {repository.current_branch ??
                        (repository.detached ? "Detached HEAD" : "Not recorded")}
                    </dd>
                  </div>
                  <div>
                    <dt>HEAD</dt>
                    <dd>
                      <code>
                        {repository.head?.slice(0, 12) ?? "Not recorded"}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>Last commit</dt>
                    <dd>{displayDate(repository.last_commit_at)}</dd>
                  </div>
                  <div>
                    <dt>Working tree</dt>
                    <dd>{repository.working_tree}</dd>
                  </div>
                  <div>
                    <dt>Activity</dt>
                    <dd>{repository.activity}</dd>
                  </div>
                  <div>
                    <dt>Archive</dt>
                    <dd>{archiveLabel(repository.archive_state)}</dd>
                  </div>
                  <div>
                    <dt>Projects</dt>
                    <dd>
                      {repository.registry_project_keys.length
                        ? repository.registry_project_keys.join(", ")
                        : "No exact registry match"}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">
          {inventory.repositories.length
            ? "No repositories match the current filters."
            : "No source repositories discovered in the approved roots."}
        </p>
      )}
    </section>
  );
}
