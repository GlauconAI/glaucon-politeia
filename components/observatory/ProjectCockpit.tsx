"use client";

import { useMemo, useState } from "react";

import type {
  DeliveryGovernance,
  GovernanceStatusCategory,
} from "@/lib/observatory/governance-schema";

type StatusFilter = GovernanceStatusCategory | "all";

function displayDate(value: string): string {
  return value === "not_recorded" ? "Not recorded" : value;
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="observatory-wrap">{value}</dd>
    </div>
  );
}

function EvidenceList({
  id,
  title,
  empty,
  children,
}: {
  id: string;
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="cockpit-evidence-panel" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {empty ? <p className="empty-text">No records reported.</p> : <ul>{children}</ul>}
    </section>
  );
}

export function ProjectCockpit({
  governance,
}: {
  governance: DeliveryGovernance;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const hierarchy = useMemo(
    () =>
      governance.milestones.flatMap((milestone) => {
        const features = governance.features.flatMap((feature) => {
          if (feature.milestone_id !== milestone.id) return [];
          const allTasks = governance.tasks.filter(
            (task) => task.feature_id === feature.id,
          );
          const featureSearch = [
            feature.id,
            feature.name,
            feature.contract_id,
            feature.contract_type,
            feature.status_label,
            ...allTasks.flatMap((task) => [
              task.id,
              task.name,
              task.contract_id,
              task.contract_type,
              task.status_label,
              ...task.evidence_refs,
            ]),
          ]
            .join(" ")
            .toLocaleLowerCase();
          const featureMatchesQuery =
            !normalizedQuery || featureSearch.includes(normalizedQuery);
          const featureMatchesStatus =
            status === "all" ||
            feature.status_category === status ||
            allTasks.some((task) => task.status_category === status);
          if (!featureMatchesQuery || !featureMatchesStatus) return [];
          const tasks = allTasks.filter(
            (task) =>
              (status === "all" || task.status_category === status) &&
              (!normalizedQuery ||
                [
                  task.id,
                  task.name,
                  task.contract_id,
                  task.contract_type,
                  task.status_label,
                  ...task.evidence_refs,
                ]
                  .join(" ")
                  .toLocaleLowerCase()
                  .includes(normalizedQuery) ||
                [feature.id, feature.name, feature.contract_id]
                  .join(" ")
                  .toLocaleLowerCase()
                  .includes(normalizedQuery)),
          );
          return [{ feature, tasks }];
        });
        if (!features.length) return [];
        return [{ milestone, features }];
      }),
    [governance, normalizedQuery, status],
  );

  const summaryCards = [
    ["Milestones", governance.summary.milestone_count],
    ["Features", governance.summary.feature_count],
    ["Tasks", governance.summary.task_count],
    ["Executor Runs", governance.summary.run_count],
    ["Gates", governance.summary.gate_count],
    ["Open risks", governance.summary.open_risk_count],
    ["Open dependencies", governance.summary.open_dependency_count],
    ["Missing dates", governance.summary.missing_date_count],
  ] as const;

  return (
    <section
      className="project-cockpit"
      aria-labelledby="project-cockpit-heading"
    >
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Delivery Governance</p>
          <h2 id="project-cockpit-heading">Project Cockpit</h2>
        </div>
        <span className="observatory-status-badge">
          {governance.project.health}
        </span>
      </div>

      <div className="cockpit-project-heading">
        <div>
          <h3>{governance.project.name}</h3>
          <p>
            {governance.project.phase} · {governance.project.accountable_owner}
          </p>
        </div>
        <strong>
          {governance.project.baseline_status === "candidate"
            ? "Candidate Baseline"
            : `${governance.project.baseline_status} baseline`}
        </strong>
      </div>

      <section className="cockpit-summary" aria-label="Delivery summary">
        {summaryCards.map(([label, value]) => (
          <dl key={label}>
            <Meta label={label} value={value} />
          </dl>
        ))}
      </section>

      <div className="cockpit-controls">
        <label>
          <span>Search delivery hierarchy</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search IDs, names, contracts, evidence…"
          />
        </label>
        <label>
          <span>Filter delivery status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="accepted">Accepted</option>
            <option value="done">Done</option>
            <option value="active">Active</option>
            <option value="planned">Planned</option>
            <option value="partial">Partial</option>
            <option value="blocked">Blocked</option>
            <option value="at_risk">At risk</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>

      <section className="cockpit-hierarchy" aria-labelledby="delivery-hierarchy">
        <h3 id="delivery-hierarchy">Milestone → Feature → Task</h3>
        {hierarchy.length ? (
          hierarchy.map(({ milestone, features }) => (
            <details key={milestone.id} open>
              <summary>
                <span>
                  <strong>{milestone.id}</strong> · {milestone.name}
                </span>
                <span>{milestone.status_label}</span>
              </summary>
              <dl className="cockpit-meta">
                <Meta label="Forecast" value={displayDate(milestone.forecast)} />
                <Meta label="Variance" value={milestone.variance} />
              </dl>
              <div className="cockpit-feature-list">
                {features.map(({ feature, tasks }) => (
                  <details key={feature.id} open>
                    <summary>
                      <span>
                        {feature.id} · {feature.name}
                      </span>
                      <span>{feature.status_label}</span>
                    </summary>
                    <dl className="cockpit-meta">
                      <Meta label="Contract" value={feature.contract_type} />
                      <Meta label="Contract ID" value={feature.contract_id} />
                      <Meta label="Estimate" value={`${feature.estimate_hours}h`} />
                      <Meta label="Confidence" value={feature.confidence} />
                      <Meta
                        label="Baseline finish"
                        value={displayDate(feature.baseline_finish)}
                      />
                      <Meta
                        label="Forecast finish"
                        value={displayDate(feature.forecast_finish)}
                      />
                      <Meta
                        label="Actual finish"
                        value={displayDate(feature.actual_finish)}
                      />
                    </dl>
                    {tasks.length ? (
                      <ul className="cockpit-task-list">
                        {tasks.map((task) => (
                          <li key={task.id}>
                            <div>
                              <strong>
                                {task.id} · {task.name}
                              </strong>
                              <span>{task.status_label}</span>
                            </div>
                            <dl className="cockpit-meta">
                              <Meta label="Contract" value={task.contract_type} />
                              <Meta label="Contract ID" value={task.contract_id} />
                              <Meta
                                label="Forecast"
                                value={displayDate(task.forecast_finish)}
                              />
                              <Meta
                                label="Actual finish"
                                value={displayDate(task.actual_finish)}
                              />
                            </dl>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-text">No matching Tasks.</p>
                    )}
                  </details>
                ))}
              </div>
            </details>
          ))
        ) : (
          <p className="empty-text">
            {governance.milestones.length
              ? "No matching delivery items."
              : "No delivery hierarchy records reported."}
          </p>
        )}
      </section>

      <div className="cockpit-evidence-grid">
        <EvidenceList
          id="cockpit-runs"
          title="Executor Runs"
          empty={!governance.executor_runs.length}
        >
          {governance.executor_runs.map((run) => (
            <li key={run.id}>
              <strong>{run.id}</strong>
              <p>{run.functional_role} · {run.task_ref}</p>
              <small>{run.evidence_summary || "Not recorded"}</small>
            </li>
          ))}
        </EvidenceList>
        <EvidenceList
          id="cockpit-gates"
          title="Gate decisions"
          empty={!governance.gates.length}
        >
          {governance.gates.map((gate) => (
            <li key={gate.id}>
              <strong>{gate.id}</strong>
              <p>{gate.status} · {displayDate(gate.date)}</p>
              <small>{gate.evidence_summary || "Not recorded"}</small>
            </li>
          ))}
        </EvidenceList>
        <EvidenceList
          id="cockpit-risks"
          title="Risks"
          empty={!governance.risks.length}
        >
          {governance.risks.map((risk) => (
            <li key={risk.id}>
              <strong>{risk.description}</strong>
              <p>{risk.status} · {risk.impact}</p>
              <small>{risk.mitigation}</small>
            </li>
          ))}
        </EvidenceList>
        <EvidenceList
          id="cockpit-dependencies"
          title="Dependencies"
          empty={!governance.dependencies.length}
        >
          {governance.dependencies.map((dependency) => (
            <li key={dependency.id}>
              <strong>{dependency.dependency}</strong>
              <p>{dependency.owner} · {dependency.needed_by}</p>
              <small>{dependency.status}</small>
            </li>
          ))}
        </EvidenceList>
      </div>

      <p className="cockpit-source">
        Collected{" "}
        <time dateTime={governance.source.collected_at}>
          {governance.source.collected_at}
        </time>{" "}
        · {governance.source.files.length} allowlisted sources
      </p>
    </section>
  );
}
