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
            const selected = decision.options.find((option) => option.option_id === decision.selected_option_id);
            return (
              <li key={decision.decision_id}>
                <article>
                  <header><div><p className="eyebrow">{decision.projectTitle}</p><h3>{decision.title}</h3></div><span>{words(decision.status)}</span></header>
                  <p>{decision.question}</p>
                  {decision.missing_evidence_refs.length ? <strong>{decision.missing_evidence_refs.length} missing evidence records</strong> : null}
                  {selected ? <p><strong>{selected.label}</strong> — {selected.impact_summary}</p> : null}
                  {decision.audit_summary ? <small>{decision.audit_summary}</small> : null}
                  <footer>
                    <span>{decision.gateTitle ?? "No Gate"}</span>
                    <Link href={`/dashboard/projects/${decision.projectSlug}`}>Open Project →</Link>
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

export function DecisionCenter({ decisions }: { decisions: Decision[] }) {
  const projects = [...new Set(decisions.map((decision) => decision.projectSlug))];
  const [project, setProject] = useState("all");
  const filtered = useMemo(
    () => decisions.filter((decision) => project === "all" || decision.projectSlug === project),
    [decisions, project],
  );

  return (
    <div className="decision-center">
      <div className="dashboard-directory-heading">
        <div><p className="eyebrow">User authority</p><h1>Decision Center</h1></div>
        <label className="decision-center-filter"><span>Project</span><select value={project} onChange={(event) => setProject(event.target.value)}><option value="all">All Projects</option>{projects.map((slug) => <option key={slug} value={slug}>{decisions.find((decision) => decision.projectSlug === slug)?.projectTitle ?? slug}</option>)}</select></label>
      </div>
      <p className="project-control-notice">This view is read-only. Decisions become authoritative only through the Orchestrator command boundary.</p>
      <DecisionList title="Needs evidence" decisions={filtered.filter((decision) => decision.status === "evidence_blocked")} />
      <DecisionList title="Ready for decision" decisions={filtered.filter((decision) => decision.status === "ready" || decision.status === "pending")} />
      <DecisionList title="Decision audit" decisions={filtered.filter((decision) => decision.status === "recorded")} />
    </div>
  );
}
