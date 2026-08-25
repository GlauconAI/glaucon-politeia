import Link from "next/link";

import type { ProjectControlProject } from "@/lib/observatory/project-control-schema";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import { topologicallyOrderProjectStages } from "@/lib/observatory/project-control";

function words(value: string) {
  return value.replaceAll("_", " ").replace(/^./u, (letter) => letter.toUpperCase());
}

function controlLabel(mode: "project_executor" | "independent_owner_line") {
  return mode === "independent_owner_line" ? "User + Owner line" : "Returns to PM";
}

function formatTime(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ProjectControlView({
  project,
  boundWorkItems = [],
  workTrackerAvailable = true,
  sourceStatus = "unknown",
}: {
  project: ProjectControlProject;
  boundWorkItems?: ObservatoryWorkItemRow[];
  workTrackerAvailable?: boolean;
  sourceStatus?: "fresh" | "stale" | "unknown";
}) {
  const stages = topologicallyOrderProjectStages(project);
  const stagesById = new Map(project.stages.map((stage) => [stage.stage_id, stage]));
  const childrenByStage = new Map(
    project.stages.map((stage) => [
      stage.stage_id,
      project.stages.filter((candidate) => candidate.dependency_ids.includes(stage.stage_id)),
    ]),
  );
  const currentStages = project.project.current_stage_ids
    .map((id) => stagesById.get(id))
    .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage));
  const currentGate = project.gates.find(
    (gate) => gate.gate_id === project.project.current_gate_id,
  );
  const nextStages = project.project.next_admissible_stage_ids
    .map((id) => stagesById.get(id))
    .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage));
  const missingEvidence =
    project.summary.missing_artifact_count + project.summary.pending_verification_count;
  const workPackagesByStage = new Map(
    project.stages.map((stage) => [
      stage.stage_id,
      project.work_packages.filter((workPackage) => workPackage.stage_id === stage.stage_id),
    ]),
  );
  const freshness = sourceStatus === "stale" ? "stale" : project.project.freshness;

  return (
    <div className="project-control-view">
      <header className="project-control-header">
        <div>
          <p className="eyebrow">{project.project.project_key}</p>
          <h1>{project.project.title}</h1>
          <p>{project.project.objective}</p>
        </div>
        <dl className="project-control-meta">
          <div><dt>Authority</dt><dd>OpenClaw Orchestrator</dd></div>
          <div><dt>Plan</dt><dd>Plan revision {project.project.approved_plan_revision}</dd></div>
          <div><dt>Freshness</dt><dd>{words(freshness)}</dd></div>
          <div><dt>Updated</dt><dd>{formatTime(project.project.updated_at)} UTC</dd></div>
        </dl>
      </header>

      {sourceStatus === "stale" ? (
        <p className="project-execution-callout" role="status">
          Showing last-known-good Project Control facts. Source refresh is stale.
        </p>
      ) : null}

      {project.project.revision_drift ? (
        <p className="project-control-alert" role="alert">
          Current Plan differs from the approved revision. Stage admission is fail-closed.
        </p>
      ) : null}

      <section aria-labelledby="current-control-heading" className="project-control-section">
        <p className="eyebrow">Control tower</p>
        <h2 id="current-control-heading">Current control</h2>
        <dl className="project-control-summary-grid">
          <div>
            <dt>Current Stages</dt>
            <dd>{currentStages.length ? currentStages.map((stage) => stage.title).join(", ") : "None"}</dd>
          </div>
          <div>
            <dt>Current Gate</dt>
            <dd>{currentGate ? `Current gate: ${currentGate.title} (${currentGate.gate_id})` : "No active Gate"}</dd>
          </div>
          <div>
            <dt>Critical path</dt>
            <dd>{project.stages.filter((stage) => stage.critical_path && stage.status !== "completed").map((stage) => stage.title).join(" → ") || "Complete"}</dd>
          </div>
          <div>
            <dt>Missing evidence</dt>
            <dd>{missingEvidence} open evidence records</dd>
          </div>
          <div>
            <dt>Pending decisions</dt>
            <dd>{project.summary.pending_decision_count}</dd>
          </div>
          <div>
            <dt>Next admissible Stages</dt>
            <dd>{nextStages.length ? nextStages.map((stage) => stage.title).join(", ") : "No Stage is currently admissible."}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="stage-map-heading" className="project-control-section">
        <div className="dashboard-directory-heading">
          <div><p className="eyebrow">Plan topology</p><h2 id="stage-map-heading">Stage dependency map</h2></div>
          <p>{project.summary.completed_stage_count}/{project.summary.stage_count} completed</p>
        </div>
        <ol className="project-control-stage-list" aria-label="Stage dependency order">
          {stages.map((stage) => {
            const workPackages = workPackagesByStage.get(stage.stage_id) ?? [];
            return (
              <li key={stage.stage_id}>
                <article id={stage.stage_id} className={`project-control-stage stage-${stage.status}`}>
                  <header>
                    <div>
                      <p className="eyebrow">{stage.stage_id}</p>
                      <h3>{stage.title}</h3>
                    </div>
                    <div className="project-control-badges">
                      <span>{words(stage.status)}</span>
                      {stage.critical_path ? <span>Critical path</span> : null}
                      <span>{controlLabel(stage.transfer_mode)}</span>
                    </div>
                  </header>
                  <dl className="project-control-stage-meta">
                    <div><dt>Accountable owner</dt><dd>{stage.accountable_owner_agent_id}</dd></div>
                    <div><dt>Executing agent</dt><dd>{stage.executing_agent_id ?? "Not admitted"}</dd></div>
                    <div><dt>Controller</dt><dd>{words(stage.current_controller)}</dd></div>
                    <div><dt>Admission</dt><dd>{words(stage.admission.evaluation)}</dd></div>
                  </dl>
                  <p className="project-control-dependencies">
                    {stage.dependency_ids.length
                      ? `Depends on ${stage.dependency_ids.map((id) => stagesById.get(id)?.title ?? id).join(", ")}`
                      : "Depends on no prior Stage"}
                  </p>
                  <p className="project-control-dependencies">
                    {(childrenByStage.get(stage.stage_id) ?? []).length
                      ? `Unlocks ${(childrenByStage.get(stage.stage_id) ?? []).map((child) => child.title).join(", ")}`
                      : "Unlocks no later Stage"}
                  </p>
                  {stage.admission.reason_codes.length ? (
                    <p className="project-control-reasons">Reason: {stage.admission.reason_codes.map(words).join(", ")}</p>
                  ) : null}
                  {workPackages.length ? (
                    <ul className="project-control-work-packages" aria-label={`${stage.title} work packages`}>
                      {workPackages.map((workPackage) => (
                        <li key={workPackage.work_package_id}>
                          <strong>{workPackage.title}</strong>
                          <span>{words(workPackage.status)}</span>
                          <p>{workPackage.scope_summary}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="execution-lines-heading" className="project-control-section">
        <p className="eyebrow">Parallel control</p>
        <h2 id="execution-lines-heading">Execution lines</h2>
        {project.execution_lines.length ? (
          <ul className="project-control-ledger-list">
            {project.execution_lines.map((line) => (
              <li key={line.execution_line_id}>
                <strong>{line.title}</strong>
                <span>{words(line.status)}</span>
                <small>
                  Owner {line.accountable_owner_agent_id} · Executor {line.executing_agent_id ?? "not admitted"} · {controlLabel(line.transfer_mode)} · Controller {words(line.current_controller)}
                </small>
              </li>
            ))}
          </ul>
        ) : <p className="empty-text">No execution lines published.</p>}
      </section>

      <div className="project-control-ledger-grid">
        <section aria-labelledby="artifact-ledger-heading" className="project-control-section">
          <p className="eyebrow">Evidence ledger</p>
          <h2 id="artifact-ledger-heading">Artifacts &amp; verifications</h2>
          <ul className="project-control-ledger-list">
            {project.artifacts.map((artifact) => (
              <li key={artifact.artifact_id}>
                <strong>{artifact.artifact_contract_id}</strong>
                <span>{artifact.status === "current_canonical" ? "Current canonical" : words(artifact.status)}</span>
                <small>{artifact.logical_ref ?? "Awaiting Artifact"}</small>
              </li>
            ))}
            {project.verifications.map((verification) => (
              <li key={verification.verification_id}>
                <strong>{verification.verification_id}</strong>
                <span>{words(verification.status)}</span>
                <small>{verification.evidence_summary || "Evidence pending"}</small>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="gate-ledger-heading" className="project-control-section">
          <p className="eyebrow">Governance ledger</p>
          <h2 id="gate-ledger-heading">Gates &amp; decisions</h2>
          <ul className="project-control-ledger-list">
            {project.gates.map((gate) => (
              <li id={gate.gate_id} key={gate.gate_id}>
                <strong>{gate.title}</strong><span>{words(gate.status)}</span>
                <small>{gate.decision_authority === "user" ? "User authority" : "Project Manager authority"}</small>
              </li>
            ))}
            {project.user_decisions.map((decision) => (
              <li key={decision.decision_id}>
                <strong>{decision.title}</strong>
                <span>{decision.status === "evidence_blocked" ? "Evidence blocked" : words(decision.status)}</span>
                <small>{decision.question}</small>
              </li>
            ))}
          </ul>
          <Link className="operator-link" href="/dashboard/decisions">Open Decision Center →</Link>
        </section>
      </div>

      <div className="project-control-ledger-grid">
        <section aria-labelledby="bound-work-heading" className="project-control-section">
          <p className="eyebrow">Delivery ledger</p>
          <h2 id="bound-work-heading">Bound Work Tracker cards</h2>
          {!workTrackerAvailable ? (
            <p className="empty-text">Work Tracker is temporarily unavailable.</p>
          ) : boundWorkItems.length ? (
            <ul className="project-control-ledger-list">
              {boundWorkItems.map((item) => (
                <li key={item.id}>
                  <Link href={`/work-tracker/items/${item.id}`}><strong>{item.title}</strong></Link>
                  <span>{words(item.state)}</span>
                  <small>
                    {item.stage_id} · {item.work_package_id} · Plan {item.plan_revision} · {
                      project.stages.some((stage) => stage.stage_id === item.stage_id) &&
                      project.work_packages.some((workPackage) =>
                        workPackage.work_package_id === item.work_package_id &&
                        workPackage.stage_id === item.stage_id)
                        ? "Matched"
                        : "Binding unmatched"
                    }
                  </small>
                </li>
              ))}
            </ul>
          ) : <p className="empty-text">No Work Tracker card is bound to this Project revision.</p>}
        </section>

        <section aria-labelledby="outcome-reviews-heading" className="project-control-section">
          <p className="eyebrow">Outcome ledger</p>
          <h2 id="outcome-reviews-heading">Outcome reviews</h2>
          {project.outcome_reviews.length ? (
            <ul className="project-control-ledger-list">
              {project.outcome_reviews.map((review) => (
                <li key={review.outcome_review_id}>
                  <strong>{review.title}</strong>
                  <span>{words(review.status)}</span>
                  <small>{review.decision ? words(review.decision) : review.evidence_summary || "Outcome evidence pending"}</small>
                </li>
              ))}
            </ul>
          ) : <p className="empty-text">No Outcome Review published.</p>}
        </section>
      </div>
    </div>
  );
}
