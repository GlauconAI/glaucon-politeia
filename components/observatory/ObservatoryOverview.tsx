"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { SourceStatus } from "@/components/observatory/SourceStatus";
import { FreshnessSummary } from "@/components/observatory/FreshnessSummary";
import { SourceRepositoryInventory } from "@/components/observatory/SourceRepositoryInventory";
import { SystemInventory } from "@/components/observatory/SystemInventory";
import { SystemTopology } from "@/components/observatory/SystemTopology";
import { ProjectCockpit } from "@/components/observatory/ProjectCockpit";
import { DeliveryRoadmap } from "@/components/observatory/DeliveryRoadmap";
import { FlowAnalytics } from "@/components/observatory/FlowAnalytics";
import { GovernanceReview } from "@/components/observatory/GovernanceReview";
import { buildSkillDirectory } from "@/lib/observatory/dashboard-directory";
import type { ObservatoryOverviewState } from "@/lib/observatory/dashboard-state";

export type { ObservatoryOverviewState } from "@/lib/observatory/dashboard-state";

type SearchItem = {
  id: string;
  searchText: string;
  content: ReactNode;
};

type ObjectListProps = {
  id: string;
  title: string;
  items: SearchItem[];
  searching: boolean;
};

function ObjectList({ id, title, items, searching }: ObjectListProps) {
  return (
    <section className="observatory-object-group" aria-labelledby={id}>
      <div className="observatory-object-heading">
        <h3 id={id}>{title}</h3>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <ul className="observatory-object-list">
          {items.map((item) => (
            <li key={item.id}>
              <article>{item.content}</article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">
          {searching
            ? `No matching ${title.toLowerCase()}.`
            : `No ${title.toLowerCase()} reported.`}
        </p>
      )}
    </section>
  );
}

function includesQuery(item: SearchItem, query: string) {
  return item.searchText.toLocaleLowerCase().includes(query);
}

export function ObservatoryOverview({
  state,
}: {
  state: ObservatoryOverviewState;
}) {
  const [query, setQuery] = useState("");

  const lists = useMemo(() => {
    if (state.status !== "ready") return null;

    const projects: SearchItem[] = state.snapshot.registry.project_groups.flatMap(
      (group) =>
        group.projects.map((project) => ({
          id: project.project_key,
          searchText: [
            group.owner,
            group.focus,
            project.project_key,
            project.name,
            project.title,
            project.status,
            project.description,
            ...project.scene_ids,
          ]
            .filter(Boolean)
            .join(" "),
          content: (
            <>
              <div className="observatory-object-title">
                <h4 className="observatory-wrap">
                  {project.title ?? project.name}
                </h4>
                <span className="observatory-object-badge observatory-wrap">
                  {project.status}
                </span>
              </div>
              <p className="observatory-wrap">
                {project.description || "No description supplied."}
              </p>
              <small className="observatory-wrap">
                {group.owner} · {project.project_key}
              </small>
            </>
          ),
        })),
    );

    const scenes: SearchItem[] = state.snapshot.registry.scenes.map((scene) => ({
      id: scene.id,
      searchText: [
        scene.id,
        scene.name,
        scene.flow,
        scene.description,
        scene.recommended_stage_owner,
      ]
        .filter(Boolean)
        .join(" "),
      content: (
        <>
          <div className="observatory-object-title">
            <h4 className="observatory-wrap">{scene.name}</h4>
            <span className="observatory-object-badge observatory-wrap">
              {scene.id}
            </span>
          </div>
          <p className="observatory-wrap">{scene.description}</p>
          <small className="observatory-wrap">
            {scene.flow}
            {scene.recommended_stage_owner
              ? ` · ${scene.recommended_stage_owner}`
              : ""}
          </small>
        </>
      ),
    }));

    const agents: SearchItem[] = state.snapshot.agents.map((agent) => ({
      id: agent.id,
      searchText: [
        agent.id,
        agent.display_name,
        agent.model_label,
        agent.workspace_label,
        agent.default ? "default" : "",
      ].join(" "),
      content: (
        <>
          <div className="observatory-object-title">
            <h4 className="observatory-wrap">
              {agent.emoji ? `${agent.emoji} ` : ""}
              {agent.display_name || agent.id}
            </h4>
            <span className="observatory-object-badge observatory-wrap">
              {agent.binding_count} bindings
            </span>
          </div>
          <p className="observatory-wrap">
            {agent.model_label || "Model not reported"}
          </p>
          <small className="observatory-wrap">
            {agent.workspace_label}
            {agent.default ? " · default" : ""}
          </small>
        </>
      ),
    }));

    const flows: SearchItem[] = state.snapshot.registry.execution_flows.map(
      (flow) => ({
        id: flow.id,
        searchText: [
          flow.id,
          flow.name,
          flow.tier_label,
          flow.use_when,
          flow.controller,
          flow.core_output,
          flow.topology,
        ].join(" "),
        content: (
          <>
            <div className="observatory-object-title">
              <h4 className="observatory-wrap">{flow.name}</h4>
              <span className="observatory-object-badge observatory-wrap">
                {flow.id}
              </span>
            </div>
            <p className="observatory-wrap">
              {flow.use_when || flow.core_output}
            </p>
            <small className="observatory-wrap">
              {flow.topology} · {flow.team_allowed ? "team allowed" : "solo"}
            </small>
          </>
        ),
      }),
    );

    return { projects, scenes, agents, flows };
  }, [state]);

  if (state.status !== "ready" || !lists) {
    return (
      <div
        id="dashboard-snapshot"
        className="dashboard-section-anchor"
        data-dashboard-section
      >
        <SourceStatus {...state} />
      </div>
    );
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filter = (items: SearchItem[]) =>
    normalizedQuery
      ? items.filter((item) => includesQuery(item, normalizedQuery))
      : items;
  const summary = state.snapshot.summary;
  const gatewayOnline = summary.gateway_running && summary.gateway_reachable;
  const summaryItems: ReadonlyArray<{
    label: string;
    value: string | number;
    href: string;
  }> = [
    {
      label: "Projects",
      value: summary.project_count,
      href: "/dashboard/projects",
    },
    ...("assets" in state.snapshot
      ? [{
          label: "Skills",
          value: buildSkillDirectory(state.snapshot.assets).length,
          href: "/dashboard/skills",
        }]
      : []),
    {
      label: "Primary scenes",
      value: summary.primary_scene_count,
      href: "#dashboard-objects",
    },
    {
      label: "Secondary scenes",
      value: summary.secondary_scene_count,
      href: "#dashboard-objects",
    },
    {
      label: "Execution flows",
      value: summary.execution_flow_count,
      href: "#dashboard-objects",
    },
    {
      label: "Agents",
      value: summary.agent_count,
      href: "#dashboard-objects",
    },
    {
      label: "Bindings",
      value: summary.binding_count,
      href: "#dashboard-topology",
    },
    {
      label: "Active tasks",
      value: summary.task_totals.active,
      href: "#dashboard-snapshot",
    },
    {
      label: "Failed tasks",
      value: summary.task_totals.failed,
      href: "#dashboard-snapshot",
    },
    ...("source_repositories" in state.snapshot
      ? [{
          label: "Source repos",
          value: state.snapshot.source_repositories.repositories.length,
          href: "#dashboard-repositories",
        }]
      : []),
    {
      label: "Gateway",
      value: gatewayOnline ? "Online" : "Offline",
      href: "#dashboard-snapshot",
    },
  ];

  return (
    <div className="observatory-overview">
      <div
        id="dashboard-snapshot"
        className="dashboard-section-anchor"
        data-dashboard-section
      >
        <SourceStatus status="ready" snapshot={state.snapshot} />
      </div>

      <section
        id="dashboard-index"
        className="observatory-summary dashboard-section-anchor"
        aria-label="System summary"
        data-dashboard-section
      >
        {summaryItems.map(({ label, value, href }) => (
          <Link
            key={label}
            className="observatory-summary-card"
            href={href}
            aria-label={`View ${label}`}
          >
            <dl>
              <div>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            </dl>
            <span className="observatory-summary-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        ))}
      </section>

      {"assets" in state.snapshot ? (
        <>
          <div
            id="dashboard-sources"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <FreshnessSummary sources={state.snapshot.source_health} />
          </div>
          {"source_repositories" in state.snapshot ? (
            <div
              id="dashboard-repositories"
              className="dashboard-section-anchor"
              data-dashboard-section
            >
              <SourceRepositoryInventory
                inventory={state.snapshot.source_repositories}
              />
            </div>
          ) : null}
          <div
            id="dashboard-inventory"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <SystemInventory assets={state.snapshot.assets} />
          </div>
          <div
            id="dashboard-topology"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <SystemTopology
              assets={state.snapshot.assets}
              coreEndpointLabels={Object.fromEntries(
                state.snapshot.agents.map((agent) => [
                  `agent:${agent.id}`,
                  agent.display_name || agent.id,
                ]),
              )}
              relationships={state.snapshot.relationships}
            />
          </div>
        </>
      ) : (
        <section className="observatory-v1-notice" aria-label="System inventory status">
          <p>
            Core objects are available from the v1 Snapshot. The expanded system
            inventory will appear after the first validated v2 refresh.
          </p>
        </section>
      )}

      <section
        id="dashboard-objects"
        className="observatory-catalog dashboard-section-anchor"
        aria-labelledby="catalog-heading"
        data-dashboard-section
      >
        <div className="observatory-panel-heading">
          <div>
            <p className="eyebrow">Validated system map</p>
            <h2 id="catalog-heading">Core objects</h2>
          </div>
        </div>
        <label className="observatory-search" htmlFor="observatory-object-search">
          <span>Search projects, scenes, agents, and flows</span>
          <input
            id="observatory-object-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search names, IDs, owners, status…"
          />
        </label>
        <div className="observatory-object-grid">
          <ObjectList
            id="observatory-projects"
            title="Projects"
            items={filter(lists.projects)}
            searching={Boolean(normalizedQuery)}
          />
          <ObjectList
            id="observatory-scenes"
            title="Scenes"
            items={filter(lists.scenes)}
            searching={Boolean(normalizedQuery)}
          />
          <ObjectList
            id="observatory-agents"
            title="Agents"
            items={filter(lists.agents)}
            searching={Boolean(normalizedQuery)}
          />
          <ObjectList
            id="observatory-flows"
            title="Execution flows"
            items={filter(lists.flows)}
            searching={Boolean(normalizedQuery)}
          />
        </div>
      </section>

      {"delivery_governance" in state.snapshot ? (
        <>
          <div
            id="dashboard-projects"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <ProjectCockpit governance={state.snapshot.delivery_governance} />
          </div>
          <div
            id="dashboard-roadmap"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <DeliveryRoadmap governance={state.snapshot.delivery_governance} />
          </div>
          <div
            id="dashboard-analytics"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <FlowAnalytics governance={state.snapshot.delivery_governance} />
          </div>
          <div
            id="dashboard-review"
            className="dashboard-section-anchor"
            data-dashboard-section
          >
            <GovernanceReview governance={state.snapshot.delivery_governance} />
          </div>
        </>
      ) : (
        <section
          className="observatory-v1-notice"
          aria-label="Delivery governance status"
        >
          <p>
            Delivery governance data is not yet available. The Project Cockpit
            will appear after the first validated v3 refresh.
          </p>
        </section>
      )}
    </div>
  );
}
