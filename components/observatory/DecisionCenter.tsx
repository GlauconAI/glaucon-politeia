"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { listProjectControlDecisions } from "@/lib/observatory/project-control";

type Decision = ReturnType<typeof listProjectControlDecisions>[number];

function words(value: string) {
  return value.replaceAll("_", " ").replace(/^./u, (letter) => letter.toUpperCase());
}

function DecisionList({ title, decisions }: { title: string; decisions: Decision[] }) {
  return (
    <section className="project-control-section" aria-labelledby={`decision-${title.replaceAll(" ", "-").toLowerCase()}`}>
      <h2 id={`decision-${title.replaceAll(" ", "-").toLowerCase()}`}>{title}</h2>
      {decisions.length ? (
        <ul className="decision-center-list">
          {decisions.map((decision) => {
            return (
              <li key={decision.decision_id}>
                <article>
                  <header><div><p className="eyebrow">{decision.projectTitle}</p><h3>{decision.title}</h3></div><span>{words(decision.status)}</span></header>
                  <p>{decision.question}</p>
                  {decision.missing_evidence_refs.length ? <strong>{decision.missing_evidence_refs.length} missing evidence records</strong> : null}
                  <ul className="decision-center-options" aria-label={`${decision.title} options`}>
                    {decision.options.map((option) => (
                      <li key={option.option_id}>
                        <strong>{option.label}</strong>
                        <span>{option.impact_summary}</span>
                      </li>
                    ))}
                  </ul>
                  <p>Downstream Stages: {decision.downstream_stage_ids.length ? decision.downstream_stage_ids.join(", ") : "none"}</p>
                  {decision.audit_summary ? <small>{decision.audit_summary}</small> : null}
                  {decision.status !== "recorded" ? (
                    <div className="decision-center-suggested-actions">
                      <strong>Suggested actions</strong>
                      <ul>
                        <li><span>Accept</span> — record the selected option through the Orchestrator command boundary.</li>
                        <li><span>Request evidence</span> — keep the Gate closed and request the missing proof.</li>
                        <li><span>Return minimal work package</span> — return only the affected scope for correction.</li>
                      </ul>
                    </div>
                  ) : null}
                  <footer>
                    <span>{decision.gateTitle ?? "No Gate"}</span>
                    <Link href={`/dashboard/projects/${decision.projectSlug}${decision.stage_id ? `#${decision.stage_id}` : decision.gate_id ? `#${decision.gate_id}` : ""}`}>Open Project context →</Link>
                  </footer>
                </article>
              </li>
            );
          })}
        </ul>
      ) : <p className="empty-text">No decisions in this state.</p>}
    </section>
  );
}

export function DecisionCenter({
  decisions,
  sourceStatus = "unknown",
  collectedAt = null,
}: {
  decisions: Decision[];
  sourceStatus?: "fresh" | "stale" | "unknown";
  collectedAt?: string | null;
}) {
  const projects = [...new Set(decisions.map((decision) => decision.projectSlug))];
  const gates = [...new Set(decisions.map((decision) => decision.gate_id).filter(Boolean))] as string[];
  const owners = [...new Set(decisions.map((decision) => decision.ownerAgentId))];
  const [project, setProject] = useState("all");
  const [status, setStatus] = useState("all");
  const [gate, setGate] = useState("all");
  const [owner, setOwner] = useState("all");
  const filtered = useMemo(
    () => decisions.filter((decision) =>
      (project === "all" || decision.projectSlug === project) &&
      (status === "all" || decision.status === status) &&
      (gate === "all" || decision.gate_id === gate) &&
      (owner === "all" || decision.ownerAgentId === owner)),
    [decisions, project, status, gate, owner],
  );

  return (
    <div className="decision-center">
      <div className="dashboard-directory-heading">
        <div><p className="eyebrow">User authority</p><h1>Decision Center</h1></div>
      </div>
      {sourceStatus === "stale" ? (
        <p className="project-execution-callout" role="status">
          Showing last-known-good Project Control decisions. Source refresh is stale
          {collectedAt ? ` as of ${collectedAt}` : ""}.
        </p>
      ) : null}
      <div className="decision-center-filters">
        <label className="decision-center-filter"><span>Project</span><select value={project} onChange={(event) => setProject(event.target.value)}><option value="all">All Projects</option>{projects.map((slug) => <option key={slug} value={slug}>{decisions.find((decision) => decision.projectSlug === slug)?.projectTitle ?? slug}</option>)}</select></label>
        <label className="decision-center-filter"><span>Decision status</span><select aria-label="Decision status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["evidence_blocked", "pending", "ready", "recorded"].map((value) => <option key={value} value={value}>{words(value)}</option>)}</select></label>
        <label className="decision-center-filter"><span>Gate</span><select aria-label="Gate" value={gate} onChange={(event) => setGate(event.target.value)}><option value="all">All Gates</option>{gates.map((value) => <option key={value} value={value}>{decisions.find((decision) => decision.gate_id === value)?.gateTitle ?? value}</option>)}</select></label>
        <label className="decision-center-filter"><span>Owner</span><select aria-label="Owner" value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">All owners</option>{owners.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <p className="project-control-notice">This view is read-only. Decisions become authoritative only through the Orchestrator command boundary.</p>
      <DecisionList title="Needs evidence" decisions={filtered.filter((decision) => decision.status === "evidence_blocked")} />
      <DecisionList title="Pending decisions" decisions={filtered.filter((decision) => decision.status === "pending")} />
      <DecisionList title="Ready decision packages" decisions={filtered.filter((decision) => decision.status === "ready")} />
      <DecisionList title="Decision audit" decisions={filtered.filter((decision) => decision.status === "recorded")} />
    </div>
  );
}
