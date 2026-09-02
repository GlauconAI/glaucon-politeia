"use client";

import { useActionState, useState } from "react";

import {
  createObservatoryProjectVersionAction,
  transitionObservatoryProjectVersionAction,
  updateObservatoryProjectVersionAction,
  type ObservatoryWorkItemMutationActionState,
} from "@/app/observatory/actions";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";
import {
  PROJECT_VERSION_STATUS_LABELS,
  allowedProjectVersionTransitions,
} from "@/lib/observatory/project-versions";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";

const idleState: ObservatoryWorkItemMutationActionState = { status: "idle" };

function Feedback({ state }: { state: ObservatoryWorkItemMutationActionState }) {
  if (state.status === "error") return <p role="alert" className="observatory-form-error">{state.formError ?? Object.values(state.fieldErrors ?? {}).flat().join(" ")}</p>;
  if (state.status === "success") return <p role="status" className="observatory-form-success">Saved.</p>;
  return null;
}

function VersionRow({ version }: { version: ObservatoryProjectVersionRow }) {
  const [editState, editAction, editing] = useActionState(updateObservatoryProjectVersionAction, idleState);
  const [transitionState, transitionAction, transitioning] = useActionState(transitionObservatoryProjectVersionAction, idleState);
  return (
    <li className="project-version-manager-row">
      <div>
        <strong>{version.is_backlog ? "待规划" : version.version_label}</strong>
        <span>{PROJECT_VERSION_STATUS_LABELS[version.status]}</span>
        <small>{version.title}{version.target_date ? ` · ${version.target_date}` : ""}</small>
      </div>
      {!version.is_backlog ? (
        <details>
          <summary>编辑</summary>
          <form action={editAction} className="project-version-manager-form">
            <input type="hidden" name="projectVersionId" value={version.id} />
            <input type="hidden" name="expectedVersion" value={version.row_version} />
            <label><span>版本号</span><input name="versionLabel" defaultValue={version.version_label} required maxLength={64} /></label>
            <label><span>名称</span><input name="title" defaultValue={version.title} required maxLength={200} /></label>
            <label><span>目标日期</span><input name="targetDate" type="date" defaultValue={version.target_date ?? ""} /></label>
            <label><span>说明</span><textarea name="description" defaultValue={version.description} maxLength={4000} /></label>
            <button type="submit" disabled={editing}>{editing ? "保存中…" : "保存"}</button>
          </form>
          <Feedback state={editState} />
        </details>
      ) : null}
      {allowedProjectVersionTransitions(version.status).length > 0 && !version.is_backlog ? (
        <form action={transitionAction} className="project-version-transition-form">
          <input type="hidden" name="projectVersionId" value={version.id} />
          <input type="hidden" name="expectedVersion" value={version.row_version} />
          {allowedProjectVersionTransitions(version.status).map((status) => (
            <button key={status} type="submit" name="targetStatus" value={status} disabled={transitioning}>
              转为{PROJECT_VERSION_STATUS_LABELS[status]}
            </button>
          ))}
          <Feedback state={transitionState} />
        </form>
      ) : null}
    </li>
  );
}

export function ProjectVersionManager({ projects, versions }: {
  projects: WorkTrackerProjectOption[];
  versions: ObservatoryProjectVersionRow[];
}) {
  const [projectKey, setProjectKey] = useState(projects[0]?.projectKey ?? "");
  const [createState, createAction, creating] = useActionState(createObservatoryProjectVersionAction, idleState);
  const filtered = versions.filter((version) => version.project_key === projectKey);
  return (
    <details className="project-version-manager">
      <summary>管理版本</summary>
      <div className="project-version-manager-panel">
        <label><span>Project</span><select value={projectKey} onChange={(event) => setProjectKey(event.target.value)}>{projects.map((project) => <option key={project.projectKey} value={project.projectKey}>{project.title}</option>)}</select></label>
        <form action={createAction} className="project-version-manager-form">
          <input type="hidden" name="projectKey" value={projectKey} />
          <label><span>版本号</span><input name="versionLabel" placeholder="v1.0" required maxLength={64} /></label>
          <label><span>名称</span><input name="title" placeholder="版本目标" required maxLength={200} /></label>
          <label><span>目标日期</span><input name="targetDate" type="date" /></label>
          <label><span>说明</span><textarea name="description" maxLength={4000} /></label>
          <button type="submit" disabled={creating || !projectKey}>{creating ? "创建中…" : "创建计划版本"}</button>
        </form>
        <Feedback state={createState} />
        <ul className="project-version-manager-list">{filtered.map((version) => <VersionRow key={version.id} version={version} />)}</ul>
      </div>
    </details>
  );
}
