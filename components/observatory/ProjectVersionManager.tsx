"use client";

import { useActionState, useState } from "react";
import { createObservatoryProjectVersionAction, transitionObservatoryProjectVersionAction, updateObservatoryProjectVersionAction, type ObservatoryWorkItemMutationActionState } from "@/app/observatory/actions";
import { PROJECT_VERSION_STATUS_LABELS, allowedProjectVersionTransitions } from "@/lib/observatory/project-versions";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";

const idleState: ObservatoryWorkItemMutationActionState = { status: "idle" };

function Feedback({ state }: { state: ObservatoryWorkItemMutationActionState }) {
  if (state.status === "error") return <p role="alert" className="observatory-form-error">{state.formError ?? Object.values(state.fieldErrors ?? {}).flat().join(" ")}</p>;
  if (state.status === "success") return <p role="status" className="observatory-form-success">Saved.</p>;
  return null;
}

function ContractFields({ version, versions }: { version?: ObservatoryProjectVersionRow; versions: ObservatoryProjectVersionRow[] }) {
  const displayVersion = version?.semver ?? version?.version_label ?? "new version";
  return <>
    {version ? <input type="hidden" name="versionLabel" value={version.version_label} /> : null}
    <label><span>SemVer</span><input aria-label={version ? `SemVer for ${displayVersion}` : "SemVer"} name={version ? "semver" : "versionLabel"} defaultValue={version?.semver ?? ""} placeholder="1.0.0" required={!version} pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)" maxLength={64} /></label>
    <label className="project-version-checkbox"><input name="isReleaseTarget" type="checkbox" defaultChecked={version?.is_release_target ?? false} /><span>Release target</span></label>
    <label><span>Milestone reference</span><input name="milestoneRef" defaultValue={version?.milestone_ref ?? ""} maxLength={160} /></label>
    <label><span>Predecessor version</span><select name="predecessorVersionId" defaultValue={version?.predecessor_version_id ?? ""}><option value="">None recorded</option>{versions.filter((candidate) => candidate.id !== version?.id && !candidate.is_backlog).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.semver ?? candidate.version_label}</option>)}</select></label>
    <label><span>Canonical roadmap reference</span><input name="roadmapRef" defaultValue={version?.roadmap_ref ?? ""} maxLength={160} /></label>
    <label><span>Approved Plan reference</span><input name="approvedPlanRef" defaultValue={version?.approved_plan_ref ?? ""} maxLength={160} /></label>
    <label className="project-version-wide-field"><span>Acceptance summary</span><textarea name="acceptanceSummary" defaultValue={version?.acceptance_summary ?? ""} maxLength={4000} /></label>
    <label className="project-version-wide-field"><span>Dependencies</span><textarea name="dependenciesSummary" defaultValue={version?.dependencies_summary ?? ""} maxLength={4000} /></label>
    <label><span>Actual date</span><input name="actualDate" type="date" defaultValue={version?.actual_date ?? ""} /></label>
    <label><span>User Gate decision reference</span><input name="userGateDecisionRef" defaultValue={version?.user_gate_decision_ref ?? ""} maxLength={160} /></label>
    <fieldset className="project-version-gate-fields project-version-wide-field"><legend>Release Gate evidence</legend>{[
      ["dependenciesSatisfied", "Dependencies satisfied", version?.dependencies_satisfied],
      ["artifactsAccepted", "Artifacts accepted", version?.artifacts_accepted],
      ["verificationComplete", "Verification complete", version?.verification_complete],
      ["roadmapReconciled", "Roadmap reconciled", version?.roadmap_reconciled],
    ].map(([name, label, checked]) => <label key={String(name)} className="project-version-checkbox"><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} /><span>{String(label)}</span></label>)}</fieldset>
  </>;
}

function gateSummary(version: ObservatoryProjectVersionRow) {
  return [Boolean(version.acceptance_summary?.trim()), Boolean(version.artifacts_accepted), Boolean(version.verification_complete), Boolean(version.dependencies_satisfied), Boolean(version.roadmap_reconciled)].filter(Boolean).length;
}

function VersionRow({ version, versions }: { version: ObservatoryProjectVersionRow; versions: ObservatoryProjectVersionRow[] }) {
  const [editState, editAction, editing] = useActionState(updateObservatoryProjectVersionAction, idleState);
  const [transitionState, transitionAction, transitioning] = useActionState(transitionObservatoryProjectVersionAction, idleState);
  const predecessor = versions.find((candidate) => candidate.id === version.predecessor_version_id);
  const displayVersion = version.is_backlog ? "待规划" : version.semver ?? version.version_label;
  const authorityRecorded = Boolean(version.roadmap_ref || version.approved_plan_ref);
  return <li className={`project-version-manager-row project-version-manager-row-${version.status}`}>
    <div className="project-version-roadmap-summary">
      <div className="project-version-roadmap-heading"><strong>{displayVersion}</strong><span className={`project-version-status project-version-status-${version.status}`}>{PROJECT_VERSION_STATUS_LABELS[version.status]}</span>{version.is_release_target ? <span className="project-version-release-target">Release target</span> : null}</div>
      <p>{version.title}{version.target_date ? ` · Target ${version.target_date}` : ""}{version.actual_date ? ` · Actual ${version.actual_date}` : ""}</p>
      <dl className="project-version-roadmap-meta"><div><dt>Milestone</dt><dd>{version.milestone_ref ?? "none recorded"}</dd></div><div><dt>Predecessor</dt><dd>{predecessor ? predecessor.semver ?? predecessor.version_label : "none recorded"}</dd></div><div><dt>Roadmap</dt><dd>{version.roadmap_ref ?? "not recorded"}</dd></div><div><dt>Approved Plan</dt><dd>{version.approved_plan_ref ?? "not recorded"}</dd></div></dl>
      {!authorityRecorded ? <small>Authority refs · not recorded</small> : null}
      <div className="project-version-gate-summary" aria-label={`Release Gate for ${displayVersion}`}><strong>Release Gate · {gateSummary(version)}/5 complete</strong><span>User Gate · {version.user_gate_decision_ref ? "recorded" : "pending"}</span></div>
      {version.acceptance_summary ? <p className="project-version-acceptance-summary">{version.acceptance_summary}</p> : null}
    </div>
    {!version.is_backlog ? <details className="project-version-editor"><summary>Edit roadmap record</summary><form action={editAction} className="project-version-manager-form"><input type="hidden" name="projectVersionId" value={version.id} /><input type="hidden" name="expectedVersion" value={version.row_version} /><label><span>Name</span><input name="title" defaultValue={version.title} required maxLength={200} /></label><label><span>Target date</span><input name="targetDate" type="date" defaultValue={version.target_date ?? ""} /></label><label className="project-version-wide-field"><span>Description</span><textarea name="description" defaultValue={version.description} maxLength={4000} /></label><ContractFields version={version} versions={versions} /><button type="submit" disabled={editing}>{editing ? "Saving…" : "Save roadmap record"}</button></form><Feedback state={editState} /></details> : null}
    {allowedProjectVersionTransitions(version.status).length > 0 && !version.is_backlog ? <form action={transitionAction} className="project-version-transition-form" aria-label={`Lifecycle actions for ${displayVersion}`}><input type="hidden" name="projectVersionId" value={version.id} /><input type="hidden" name="expectedVersion" value={version.row_version} />{allowedProjectVersionTransitions(version.status).map((status) => <button key={status} type="submit" name="targetStatus" value={status} disabled={transitioning}>转为{PROJECT_VERSION_STATUS_LABELS[status]}</button>)}<Feedback state={transitionState} /></form> : null}
  </li>;
}

export function ProjectVersionManager({ projects, versions }: { projects: WorkTrackerProjectOption[]; versions: ObservatoryProjectVersionRow[] }) {
  const [projectKey, setProjectKey] = useState(projects[0]?.projectKey ?? "");
  const [createState, createAction, creating] = useActionState(createObservatoryProjectVersionAction, idleState);
  const filtered = versions.filter((version) => version.project_key === projectKey);
  return <details className="project-version-manager"><summary>Manage versions</summary><div className="project-version-manager-panel">
    <header><p className="eyebrow">Product Version roadmap</p><h2>Release roadmap</h2></header>
    <label><span>Project</span><select value={projectKey} onChange={(event) => setProjectKey(event.target.value)}>{projects.map((project) => <option key={project.projectKey} value={project.projectKey}>{project.title}</option>)}</select></label>
    <details className="project-version-create"><summary>Create planned version</summary><form action={createAction} className="project-version-manager-form"><input type="hidden" name="projectKey" value={projectKey} /><label><span>Name</span><input name="title" placeholder="Version outcome" required maxLength={200} /></label><label><span>Target date</span><input name="targetDate" type="date" /></label><label className="project-version-wide-field"><span>Description</span><textarea name="description" maxLength={4000} /></label><ContractFields versions={filtered} /><button type="submit" disabled={creating || !projectKey}>{creating ? "Creating…" : "创建计划版本"}</button></form><Feedback state={createState} /></details>
    <p className="project-version-authority-note">Version binding records scope. Approved Plans retain execution and Gate authority.</p>
    <ol className="project-version-manager-list">{filtered.map((version) => <VersionRow key={version.id} version={version} versions={filtered} />)}</ol>
  </div></details>;
}
