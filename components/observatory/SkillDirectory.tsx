"use client";

import { useEffect, useMemo, useState } from "react";

import {
  dashboardSkillCategories,
  dashboardSkillCategoryLabels,
  type DashboardSkillCategory,
  type DashboardSkillEntry,
} from "@/lib/observatory/dashboard-directory";

export type SkillDirectoryFilters = {
  q: string;
  category: "all" | DashboardSkillCategory;
  health: string;
  agent: string;
  source: string;
  sort: "name" | "agents" | "instances" | "health";
};

function updateUrl(filters: SkillDirectoryFilters) {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  if (filters.category !== "all") {
    search.set("category", filters.category);
  }
  if (filters.health !== "all") search.set("health", filters.health);
  if (filters.agent !== "all") search.set("agent", filters.agent);
  if (filters.source !== "all") search.set("source", filters.source);
  if (filters.sort !== "name") search.set("sort", filters.sort);
  const query = search.toString();
  window.history.replaceState(
    null,
    "",
    `/dashboard/skills${query ? `?${query}` : ""}`,
  );
}

const healthOrder: Record<string, number> = {
  failed: 0,
  degraded: 1,
  unknown: 2,
  disabled: 3,
  healthy: 4,
};

export function SkillDirectory({
  skills,
  initialFilters,
}: {
  skills: DashboardSkillEntry[];
  initialFilters: SkillDirectoryFilters;
}) {
  const [filters, setFilters] = useState<SkillDirectoryFilters>(initialFilters);
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(
    () => new Set(),
  );
  const options = useMemo(
    () => ({
      health: [...new Set(skills.map((skill) => skill.health))].sort(),
      agents: [...new Set(skills.flatMap((skill) => skill.owners))].sort(),
      sources: [...new Set(skills.flatMap((skill) => skill.sources))].sort(),
    }),
    [skills],
  );
  const filtered = useMemo(() => {
    const query = filters.q.trim().toLocaleLowerCase();
    return skills
      .filter((skill) => {
        if (
          filters.category !== "all" &&
          skill.category !== filters.category
        ) {
          return false;
        }
        if (filters.health !== "all" && skill.health !== filters.health) {
          return false;
        }
        if (filters.agent !== "all" && !skill.owners.includes(filters.agent)) {
          return false;
        }
        if (filters.source !== "all" && !skill.sources.includes(filters.source)) {
          return false;
        }
        if (!query) return true;
        return [
          skill.name,
          skill.description,
          skill.health,
          dashboardSkillCategoryLabels[skill.category],
          ...skill.owners,
          ...skill.sources,
          ...skill.versions,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((left, right) => {
        if (filters.sort === "agents") {
          return (
            right.agentCount - left.agentCount ||
            left.name.localeCompare(right.name)
          );
        }
        if (filters.sort === "instances") {
          return (
            right.instanceCount - left.instanceCount ||
            left.name.localeCompare(right.name)
          );
        }
        if (filters.sort === "health") {
          return (
            (healthOrder[left.health] ?? 99) -
              (healthOrder[right.health] ?? 99) ||
            left.name.localeCompare(right.name)
          );
        }
        return left.name.localeCompare(right.name);
      });
  }, [filters, skills]);

  useEffect(() => updateUrl(filters), [filters]);

  function setFilter<Key extends keyof SkillDirectoryFilters>(
    key: Key,
    value: SkillDirectoryFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const instanceCount = skills.reduce(
    (total, skill) => total + skill.instanceCount,
    0,
  );
  const categoryCounts = Object.fromEntries(
    dashboardSkillCategories.map((category) => [
      category,
      skills.filter((skill) => skill.category === category).length,
    ]),
  ) as Record<DashboardSkillCategory, number>;

  return (
    <section className="dashboard-directory" aria-labelledby="skill-directory-heading">
      <div className="dashboard-directory-heading">
        <div>
          <p className="eyebrow">Agent-visible inventory</p>
          <h2 id="skill-directory-heading">All Skills</h2>
        </div>
        <div className="dashboard-directory-counts" aria-label="Skill counts">
          <span>{skills.length} unique Skills</span>
          <span>{instanceCount} Agent-Skill instances</span>
          <span>{filtered.length} shown</span>
        </div>
      </div>

      <div
        className="dashboard-skill-categories"
        aria-label="Skill categories"
      >
        {dashboardSkillCategories.map((category) => {
          const count = categoryCounts[category];
          return (
            <button
              key={category}
              className="dashboard-skill-category"
              type="button"
              aria-pressed={filters.category === category}
              onClick={() =>
                setFilter(
                  "category",
                  filters.category === category ? "all" : category,
                )
              }
            >
              <strong>{dashboardSkillCategoryLabels[category]}</strong>
              <span>
                {count} Skill{count === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="dashboard-directory-controls">
        <label className="dashboard-directory-search">
          <span>Search Skills</span>
          <input
            type="search"
            value={filters.q}
            onChange={(event) => setFilter("q", event.target.value)}
            placeholder="Name, description, Agent, source…"
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(event) =>
              setFilter(
                "category",
                event.target.value as SkillDirectoryFilters["category"],
              )
            }
          >
            <option value="all">All categories</option>
            {dashboardSkillCategories.map((category) => (
              <option key={category} value={category}>
                {dashboardSkillCategoryLabels[category]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Skill health</span>
          <select
            value={filters.health}
            onChange={(event) => setFilter("health", event.target.value)}
          >
            <option value="all">All health</option>
            {options.health.map((health) => (
              <option key={health}>{health}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Visible to Agent</span>
          <select
            value={filters.agent}
            onChange={(event) => setFilter("agent", event.target.value)}
          >
            <option value="all">All Agents</option>
            {options.agents.map((agent) => (
              <option key={agent}>{agent}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Skill source</span>
          <select
            value={filters.source}
            onChange={(event) => setFilter("source", event.target.value)}
          >
            <option value="all">All sources</option>
            {options.sources.map((source) => (
              <option key={source}>{source}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort Skills</span>
          <select
            value={filters.sort}
            onChange={(event) =>
              setFilter(
                "sort",
                event.target.value as SkillDirectoryFilters["sort"],
              )
            }
          >
            <option value="name">Name</option>
            <option value="agents">Agent count</option>
            <option value="instances">Instance count</option>
            <option value="health">Health</option>
          </select>
        </label>
      </div>

      {filtered.length ? (
        <ul
          className="dashboard-directory-list dashboard-skill-list"
          aria-label="Skill directory results"
        >
          {filtered.map((skill) => (
            <li key={skill.key} data-health={skill.health}>
              <article>
                <div className="observatory-object-title">
                  <h3 className="observatory-wrap">{skill.name}</h3>
                  <span>{skill.health}</span>
                </div>
                <p>{skill.description}</p>
                <div className="dashboard-skill-meta">
                  <span>{dashboardSkillCategoryLabels[skill.category]}</span>
                  {skill.hasAgentOverride ? (
                    <span className="dashboard-skill-override">
                      Agent override
                    </span>
                  ) : null}
                  <span>
                    {skill.agentCount} Agent{skill.agentCount === 1 ? "" : "s"} ·{" "}
                    {skill.instanceCount} instance
                    {skill.instanceCount === 1 ? "" : "s"}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>Agents</dt>
                    <dd>{skill.owners.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{skill.sources.join(", ")}</dd>
                  </div>
                  <div className="dashboard-directory-wide">
                    <dt>Version</dt>
                    <dd>
                      {skill.versions.join(", ") || "Not reported"}
                    </dd>
                  </div>
                </dl>
                <details
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setExpandedSkills((current) => {
                      const next = new Set(current);
                      if (open) {
                        next.add(skill.key);
                      } else {
                        next.delete(skill.key);
                      }
                      return next;
                    });
                  }}
                >
                  <summary>View Agent instances</summary>
                  {expandedSkills.has(skill.key) ? (
                    <ul>
                      {skill.instances.map((instance) => (
                        <li key={instance.id}>
                          <strong>{instance.owner}</strong>
                          <span>{instance.health}</span>
                          <small>
                            {instance.source}
                            {instance.version ? ` · ${instance.version}` : ""}
                          </small>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">No Skills match the current filters.</p>
      )}
    </section>
  );
}
