import Link from "next/link";

import type { ProjectControlProject } from "@/lib/observatory/project-control-schema";
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

export function ProjectControlView({ project }: { project: ProjectControlProject }) {
  const stages = topologicallyOrderProjectStages(project);
  const stagesById = new Map(project.stages.map((stage) => [stage.stage_id, stage]));
  const workPackagesByStage = new Map(
    project.stages.map((stage) => [
      stage.stage_id,
      project.work_packages.filter((workPackage) => workPackage.stage_id === stage.stage_id),
    ]),
  );

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
          <div><dt>Freshness</dt><dd>{words(project.project.freshness)}</dd></div>
          <div><dt>Updated</dt><dd>{formatTime(project.project.updated_at)} UTC</dd></div>
        </dl>
      </header>

      {project.project.revision_drift ? (
        <p className="project-control-alert" role="alert">
          Current Plan differs from the approved revision. Stage admission is fail-closed.
        </p>
      ) : null}

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
                <article className={`project-control-stage stage-${stage.status}`}>
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
              <li key={gate.gate_id}>
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
    </div>
  );
}
