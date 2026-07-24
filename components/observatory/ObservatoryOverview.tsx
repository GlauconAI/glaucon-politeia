"use client";

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
import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";

export type ObservatoryOverviewState =
  | { status: "ready"; snapshot: ObservatoryCollectionEnvelope }
  | { status: "empty" }
  | { status: "error"; message: string };

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
    return <SourceStatus {...state} />;
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filter = (items: SearchItem[]) =>
    normalizedQuery
      ? items.filter((item) => includesQuery(item, normalizedQuery))
      : items;
  const summary = state.snapshot.summary;
  const gatewayOnline = summary.gateway_running && summary.gateway_reachable;
  const summaryItems: ReadonlyArray<readonly [string, string | number]> = [
    ["Projects", summary.project_count],
    ["Primary scenes", summary.primary_scene_count],
    ["Secondary scenes", summary.secondary_scene_count],
    ["Execution flows", summary.execution_flow_count],
    ["Agents", summary.agent_count],
    ["Bindings", summary.binding_count],
    ["Active tasks", summary.task_totals.active],
    ["Failed tasks", summary.task_totals.failed],
    ...("source_repositories" in state.snapshot
      ? ([["Source repos", state.snapshot.source_repositories.repositories.length]] as const)
      : []),
    ["Gateway", gatewayOnline ? "Online" : "Offline"],
  ];

  return (
    <div className="observatory-overview">
      <SourceStatus status="ready" snapshot={state.snapshot} />

      <section className="observatory-summary" aria-label="System summary">
        {summaryItems.map(([label, value]) => (
          <dl key={label} className="observatory-summary-card">
            <div>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          </dl>
        ))}
      </section>

      {"assets" in state.snapshot ? (
        <>
          <FreshnessSummary sources={state.snapshot.source_health} />
          {"source_repositories" in state.snapshot ? (
            <SourceRepositoryInventory
              inventory={state.snapshot.source_repositories}
            />
          ) : null}
          <SystemInventory assets={state.snapshot.assets} />
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
        </>
      ) : (
        <section className="observatory-v1-notice" aria-label="System inventory status">
          <p>
            Core objects are available from the v1 Snapshot. The expanded system
            inventory will appear after the first validated v2 refresh.
          </p>
        </section>
      )}

      <section className="observatory-catalog" aria-labelledby="catalog-heading">
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
          <ProjectCockpit governance={state.snapshot.delivery_governance} />
          <DeliveryRoadmap governance={state.snapshot.delivery_governance} />
          <FlowAnalytics governance={state.snapshot.delivery_governance} />
          <GovernanceReview governance={state.snapshot.delivery_governance} />
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
