"use client";

import { useEffect, useMemo, useState } from "react";

import type { DashboardProjectEntry } from "@/lib/observatory/dashboard-directory";

export type ProjectDirectoryFilters = {
  q: string;
  owner: string;
  status: string;
  scene: string;
  repository: "all" | "linked" | "unlinked";
  sort: "recent" | "name" | "owner" | "status";
};

function updateUrl(filters: ProjectDirectoryFilters) {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  if (filters.owner !== "all") search.set("owner", filters.owner);
  if (filters.status !== "all") search.set("status", filters.status);
  if (filters.scene !== "all") search.set("scene", filters.scene);
  if (filters.repository !== "all") {
    search.set("repository", filters.repository);
  }
  if (filters.sort !== "recent") search.set("sort", filters.sort);
  const query = search.toString();
  window.history.replaceState(
    null,
    "",
    `/dashboard/projects${query ? `?${query}` : ""}`,
  );
}

function recentValue(project: DashboardProjectEntry): number {
  return project.lastActivityAt
    ? new Date(project.lastActivityAt).getTime()
    : Number.NEGATIVE_INFINITY;
}

function displayDate(value: string | null): string {
  if (!value) return "No linked activity";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No linked activity"
    : new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(date);
}

export function ProjectDirectory({
  projects,
  initialFilters,
}: {
  projects: DashboardProjectEntry[];
  initialFilters: ProjectDirectoryFilters;
}) {
  const [filters, setFilters] =
    useState<ProjectDirectoryFilters>(initialFilters);
  const options = useMemo(
    () => ({
      owners: [...new Set(projects.map((project) => project.owner))].sort(),
      statuses: [...new Set(projects.map((project) => project.status))].sort(),
      scenes: [
        ...new Set(projects.flatMap((project) => project.sceneIds)),
      ].sort(),
    }),
    [projects],
  );
  const filtered = useMemo(() => {
    const query = filters.q.trim().toLocaleLowerCase();
    return projects
      .filter((project) => {
        if (filters.owner !== "all" && project.owner !== filters.owner) {
          return false;
        }
        if (filters.status !== "all" && project.status !== filters.status) {
          return false;
        }
        if (
          filters.scene !== "all" &&
          !project.sceneIds.includes(filters.scene)
        ) {
          return false;
        }
        if (
          filters.repository === "linked" &&
          project.repositories.length === 0
        ) {
          return false;
        }
        if (
          filters.repository === "unlinked" &&
          project.repositories.length > 0
        ) {
          return false;
        }
        if (!query) return true;
        return [
          project.projectKey,
          project.name,
          project.title,
          project.owner,
          project.focus,
          project.status,
          project.description,
          ...project.sceneIds,
          ...project.repositories,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        if (filters.sort === "recent") {
          return (
            recentValue(right) - recentValue(left) ||
            left.title.localeCompare(right.title)
          );
        }
        const leftValue =
          filters.sort === "name"
            ? left.title
            : filters.sort === "owner"
              ? left.owner
              : left.status;
        const rightValue =
          filters.sort === "name"
            ? right.title
            : filters.sort === "owner"
              ? right.owner
              : right.status;
        return (
          leftValue.localeCompare(rightValue) ||
          left.title.localeCompare(right.title)
        );
      });
  }, [filters, projects]);

  useEffect(() => updateUrl(filters), [filters]);

  function setFilter<Key extends keyof ProjectDirectoryFilters>(
    key: Key,
    value: ProjectDirectoryFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="dashboard-directory" aria-labelledby="project-directory-heading">
      <div className="dashboard-directory-heading">
        <div>
          <p className="eyebrow">Canonical registry</p>
          <h2 id="project-directory-heading">All Projects</h2>
        </div>
        <div className="dashboard-directory-counts" aria-label="Project counts">
          <span>{projects.length} projects</span>
          <span>{filtered.length} shown</span>
        </div>
      </div>

      <div className="dashboard-directory-controls">
        <label className="dashboard-directory-search">
          <span>Search Projects</span>
          <input
            type="search"
            value={filters.q}
            onChange={(event) => setFilter("q", event.target.value)}
            placeholder="Name, key, owner, scene, repository…"
          />
        </label>
        <label>
          <span>Project owner</span>
          <select
            value={filters.owner}
            onChange={(event) => setFilter("owner", event.target.value)}
          >
            <option value="all">All owners</option>
            {options.owners.map((owner) => (
              <option key={owner}>{owner}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Project status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="all">All statuses</option>
            {options.statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Project scene</span>
          <select
            value={filters.scene}
            onChange={(event) => setFilter("scene", event.target.value)}
          >
            <option value="all">All scenes</option>
            {options.scenes.map((scene) => (
              <option key={scene}>{scene}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Repository linkage</span>
          <select
            value={filters.repository}
            onChange={(event) =>
              setFilter(
                "repository",
                event.target.value as ProjectDirectoryFilters["repository"],
              )
            }
          >
            <option value="all">All Projects</option>
            <option value="linked">Linked repository</option>
            <option value="unlinked">No linked repository</option>
          </select>
        </label>
        <label>
          <span>Sort Projects</span>
          <select
            value={filters.sort}
            onChange={(event) =>
              setFilter(
                "sort",
                event.target.value as ProjectDirectoryFilters["sort"],
              )
            }
          >
            <option value="recent">Recent activity</option>
            <option value="name">Name</option>
            <option value="owner">Owner</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>

      {filtered.length ? (
        <ul
          className="dashboard-directory-list dashboard-project-list"
          aria-label="Project directory results"
        >
          {filtered.map((project) => (
            <li key={project.projectKey}>
              <article>
                <div className="observatory-object-title">
                  <h3 className="observatory-wrap">{project.title}</h3>
                  <span>{project.status}</span>
                </div>
                <p>{project.description || "No description supplied."}</p>
                <dl>
                  <div>
                    <dt>Project key</dt>
                    <dd><code>{project.projectKey}</code></dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{project.owner}</dd>
                  </div>
                  <div>
                    <dt>Scenes</dt>
                    <dd>{project.sceneIds.join(", ") || "None"}</dd>
                  </div>
                  <div>
                    <dt>Recent activity</dt>
                    <dd>{displayDate(project.lastActivityAt)}</dd>
                  </div>
                  <div className="dashboard-directory-wide">
                    <dt>Repositories</dt>
                    <dd>
                      {project.repositories.join(", ") ||
                        "No exact repository match"}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">No Projects match the current filters.</p>
      )}
    </section>
  );
}
