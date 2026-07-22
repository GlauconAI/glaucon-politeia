"use client";

import { useMemo, useState, type ReactNode } from "react";

import { SourceStatus } from "@/components/observatory/SourceStatus";
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
        <div className="observatory-object-list">
          {items.map((item) => (
            <article key={item.id}>{item.content}</article>
          ))}
        </div>
      ) : (
        <p className="empty-text">
          {searching ? `No matching ${title.toLowerCase()}.` : `No ${title.toLowerCase()} reported.`}
        </p>
      )}
    </section>
  );
}

function includesQuery(item: SearchItem, query: string) {
  return item.searchText.toLocaleLowerCase().includes(query);
}

export function ObservatoryOverview({ state }: { state: ObservatoryOverviewState }) {
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
                <h4>{project.title ?? project.name}</h4>
                <span>{project.status}</span>
              </div>
              <p>{project.description || "No description supplied."}</p>
              <small>
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
            <h4>{scene.name}</h4>
            <span>{scene.id}</span>
          </div>
          <p>{scene.description}</p>
          <small>
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
            <h4>
              {agent.emoji ? `${agent.emoji} ` : ""}
              {agent.display_name || agent.id}
            </h4>
            <span>{agent.binding_count} bindings</span>
          </div>
          <p>{agent.model_label || "Model not reported"}</p>
          <small>
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
          flow.topology,
        ].join(" "),
        content: (
          <>
            <div className="observatory-object-title">
              <h4>{flow.name}</h4>
              <span>{flow.id}</span>
            </div>
            <p>{flow.use_when || flow.core_output}</p>
            <small>
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
  const summaryItems = [
    ["Projects", summary.project_count],
    ["Primary scenes", summary.primary_scene_count],
    ["Secondary scenes", summary.secondary_scene_count],
    ["Execution flows", summary.execution_flow_count],
    ["Agents", summary.agent_count],
    ["Bindings", summary.binding_count],
    ["Active tasks", summary.task_totals.active],
    ["Failed tasks", summary.task_totals.failed],
    ["Gateway", gatewayOnline ? "Online" : "Offline"],
  ] as const;

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
    </div>
  );
}
