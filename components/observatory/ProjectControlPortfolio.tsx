import Link from "next/link";

import type { ProjectControlSnapshot } from "@/lib/observatory/project-control-schema";

type SourceStatus = "fresh" | "stale" | "unknown";

export function ProjectControlPortfolio({
  snapshot,
  sourceStatus = "unknown",
  collectedAt = null,
}: {
  snapshot: ProjectControlSnapshot | null;
  sourceStatus?: SourceStatus;
  collectedAt?: string | null;
}) {
  return (
    <section className="project-control-portfolio" aria-labelledby="project-control-portfolio-heading">
      <div className="dashboard-directory-heading">
        <div>
          <p className="eyebrow">Orchestrator authority</p>
          <h2 id="project-control-portfolio-heading">Project Control</h2>
        </div>
        <Link className="operator-link" href="/dashboard/decisions">Decision Center →</Link>
      </div>
      {snapshot && sourceStatus === "stale" ? (
        <p className="project-execution-callout" role="status">
          Showing last-known-good Project Control facts. Source refresh is stale
          {collectedAt ? ` as of ${collectedAt}` : ""}.
        </p>
      ) : null}
      {!snapshot ? (
        <p className="project-execution-callout" role="status">
          Project Control projection unavailable. Existing Project execution and registry views remain available.
        </p>
      ) : snapshot.projects.length ? (
        <ul className="project-control-card-grid" aria-label="Project Control results">
          {snapshot.projects.map(({ project, summary, gates, user_decisions }) => {
            const currentGate = gates.find((gate) => gate.gate_id === project.current_gate_id);
            const freshness = sourceStatus === "stale" ? "stale" : project.freshness;
            return (
              <li key={project.project_key}>
                <article className="project-control-card">
                  <header>
                    <div><p className="eyebrow">{project.project_key}</p><h3>{project.title}</h3></div>
                    <span className={`project-execution-freshness freshness-${freshness}`}>{freshness}</span>
                  </header>
                  <dl>
                    <div><dt>Plan</dt><dd>Revision {project.approved_plan_revision}</dd></div>
                    <div><dt>Stages</dt><dd>{summary.completed_stage_count}/{summary.stage_count}</dd></div>
                    <div><dt>Blocked</dt><dd>{summary.blocked_stage_count}</dd></div>
                    <div><dt>Decisions</dt><dd>{user_decisions.filter((decision) => decision.status !== "recorded").length}</dd></div>
                    <div><dt>Current Gate</dt><dd>{currentGate?.title ?? "No active Gate"}</dd></div>
                  </dl>
                  <Link className="operator-link" href={`/dashboard/projects/${project.project_slug}`}>Open Project Control →</Link>
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="project-execution-callout">No Project Control records published yet.</p>
      )}
    </section>
  );
}
