"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  transitionObservatoryWorkItemAction,
  type ObservatoryWorkItemMutationActionState,
} from "@/app/observatory/actions";
import { CanonicalProjectPicker } from "@/components/observatory/CanonicalProjectPicker";
import { ProjectVersionPicker } from "@/components/observatory/ProjectVersionPicker";
import { getAgentClaimEligibility } from "@/lib/observatory/agent-claims";
import type {
  ObservatoryWorkItemClaimRow,
  ObservatoryWorkItemRow,
  ObservatoryProjectVersionRow,
} from "@/lib/observatory/repository";
import { PROJECT_VERSION_STATUS_LABELS } from "@/lib/observatory/project-versions";
import {
  buildWorkItemDetailHref,
  buildWorkTrackerHref,
  readRememberedProject,
  rememberProject,
  resolveRememberedProject,
  type WorkTrackerView,
} from "@/lib/observatory/work-tracker-navigation";
import {
  filterTrackedWorkTrackerProjects,
  resolveWorkItemProject,
  type WorkTrackerProjectOption,
} from "@/lib/observatory/work-tracker-projects";
import {
  OBSERVATORY_WORK_ITEM_ACTIVE_GROUPS,
  OBSERVATORY_WORK_ITEM_COMPLETED_STATES,
  allowedObservatoryWorkItemTransitions,
  type ObservatoryWorkItemState,
  type ObservatoryWorkItemType,
} from "@/lib/observatory/work-items";

export type WorkTrackerBoardState =
  | {
      status: "ready";
      items: ObservatoryWorkItemRow[];
      versions?: ObservatoryProjectVersionRow[];
      activeClaims?: ObservatoryWorkItemClaimRow[];
      evaluatedAt?: string;
    }
  | { status: "error"; message: string };

type TransitionAction = (
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
) => Promise<ObservatoryWorkItemMutationActionState>;

type WorkTrackerBoardProps = {
  state: WorkTrackerBoardState;
  action?: TransitionAction;
  projects?: WorkTrackerProjectOption[];
  initialProjectKey?: string;
  initialProjectVersionId?: string;
  initialView?: WorkTrackerView;
  versions?: ObservatoryProjectVersionRow[];
  urlProjectKey?: string;
};

const stateLabels: Record<ObservatoryWorkItemState, string> = {
  inbox: "Inbox",
  triage: "Triage",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
  waiting: "Waiting",
  reopened: "Reopened",
};

const typeLabels: Record<ObservatoryWorkItemType, string> = {
  idea: "想法",
  feature: "功能",
  bug: "Bug",
};

const idleState: ObservatoryWorkItemMutationActionState = { status: "idle" };
const noProjectPreferenceSubscription = () => () => undefined;

function browserRememberedProject() {
  try {
    return readRememberedProject(window.localStorage);
  } catch {
    return null;
  }
}

function rememberBrowserProject(projectKey: string) {
  try {
    rememberProject(window.localStorage, projectKey);
  } catch {
    // Accessing localStorage itself may be blocked by the browser.
  }
}

export function WorkTrackerBoard({
  state,
  action = transitionObservatoryWorkItemAction,
  projects,
  initialProjectKey = "all",
  initialProjectVersionId = "all",
  initialView = "active",
  versions = [],
  urlProjectKey,
}: WorkTrackerBoardProps) {
  const [projectSelection, setProjectSelection] = useState<string | null>(null);
  const [projectVersionId, setProjectVersionId] = useState(initialProjectVersionId);
  const [view, setView] = useState<WorkTrackerView>(initialView);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRefs = useRef(new Map<string, HTMLDetailsElement>());
  const menuTriggerRefs = useRef(new Map<string, HTMLElement>());
  const [mutationState, formAction, pending] = useActionState(
    action,
    idleState,
  );

  const trackedProjects = useMemo(() => {
    if (state.status !== "ready" || !projects) return [];
    return filterTrackedWorkTrackerProjects(projects, state.items);
  }, [projects, state]);

  const rememberedProjectKey = useSyncExternalStore(
    noProjectPreferenceSubscription,
    () => resolveRememberedProject({
      urlProject: urlProjectKey ?? new URLSearchParams(window.location.search).get("project") ?? undefined,
      storedProject: browserRememberedProject(),
      validProjectKeys: trackedProjects.map((project) => project.projectKey),
    }),
    () => initialProjectKey,
  );
  const projectKey = projectSelection ?? rememberedProjectKey;

  const filteredItems = useMemo(() => {
    if (state.status !== "ready") return [];
    if (projectKey === "all" || !projects) return state.items;
    const projectItems = state.items.filter(
      (item) =>
        resolveWorkItemProject(item, projects)?.projectKey === projectKey,
    );
    return projectVersionId === "all"
      ? projectItems
      : projectItems.filter((item) => item.project_version_id === projectVersionId);
  }, [projectKey, projectVersionId, projects, state]);

  const versionsById = useMemo(
    () => new Map(versions.map((version) => [version.id, version])),
    [versions],
  );

  useEffect(() => {
    if (!projects) return;
    rememberBrowserProject(projectKey);
    window.history.replaceState(null, "", buildWorkTrackerHref({
      projectKey,
      projectVersionId: projectKey === "all" ? undefined : projectVersionId,
      view,
    }));
  }, [projectKey, projectVersionId, projects, view]);

  useEffect(() => {
    if (!openMenuId) return;
    const activeMenuId = openMenuId;
    function closeOnOutsidePointer(event: PointerEvent) {
      const menu = menuRefs.current.get(activeMenuId);
      if (menu && !menu.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [openMenuId]);

  if (state.status === "error") {
    return (
      <section className="work-tracker-board work-tracker-error">
        <div className="observatory-panel-heading">
          <div>
            <p className="eyebrow">Daily write surface</p>
            <h2>Work Tracker</h2>
          </div>
        </div>
        <p role="alert">{state.message}</p>
      </section>
    );
  }

  const evaluatedAt = new Date(state.evaluatedAt ?? "1970-01-01").getTime();
  const activeClaims = new Map(
    (state.activeClaims ?? [])
      .filter(
        (claim) =>
          claim.status === "active" &&
          claim.ended_at === null &&
          new Date(claim.lease_expires_at).getTime() > evaluatedAt,
      )
      .map((claim) => [claim.work_item_id, claim]),
  );
  const activeItems = filteredItems.filter(
    (item) => !OBSERVATORY_WORK_ITEM_COMPLETED_STATES.includes(item.state as "done"),
  );
  const completedItems = filteredItems.filter((item) =>
    OBSERVATORY_WORK_ITEM_COMPLETED_STATES.includes(item.state as "done"),
  );

  function renderCard(item: ObservatoryWorkItemRow) {
    const project = projects ? resolveWorkItemProject(item, projects) : null;
    const projectVersion = item.project_version_id
      ? versionsById.get(item.project_version_id)
      : null;
    const targets = allowedObservatoryWorkItemTransitions(item.state);
    const claim = activeClaims.get(item.id);
    const readyGateComplete = Boolean(
      item.acceptance_criteria.trim() && item.priority && item.owner_id,
    );
    const eligibility = getAgentClaimEligibility({
      type: item.type,
      state: item.state,
      readyGateComplete,
      riskLevel: item.risk_level,
      enabled: item.agent_claim_enabled,
      authorizedPaths: item.authorized_paths,
      allowedActionClasses: item.allowed_action_classes,
      activeClaim: Boolean(claim),
    });
    const claimLabel = claim
      ? `Claimed by ${claim.agent_id}`
      : eligibility.eligible
        ? "Agent eligible"
        : "Manual";

    return (
      <li
        key={item.id}
        className={`work-tracker-card work-tracker-card-${item.type}`}
        data-testid={`work-item-${item.id}`}
      >
        <div className="work-tracker-card-header">
          <div className="work-tracker-card-meta">
            <span
              className={`work-tracker-type-badge work-tracker-type-${item.type}`}
            >
              {typeLabels[item.type]}
            </span>
            <span
              className={`work-tracker-state-badge work-tracker-state-${item.state}`}
            >
              {stateLabels[item.state]}
            </span>
            <span className="work-tracker-priority-badge">
              {item.priority ?? "No priority"}
            </span>
          </div>
          {targets.length > 0 ? (
            <details
              className="work-tracker-card-actions"
              open={openMenuId === item.id}
              ref={(node) => {
                if (node) menuRefs.current.set(item.id, node);
                else menuRefs.current.delete(item.id);
              }}
              onToggle={(event) => {
                if (event.currentTarget.open) setOpenMenuId(item.id);
                else {
                  setOpenMenuId((current) =>
                    current === item.id ? null : current,
                  );
                }
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setOpenMenuId((current) =>
                    current === item.id ? null : current,
                  );
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setOpenMenuId(null);
                menuTriggerRefs.current.get(item.id)?.focus();
              }}
            >
              <summary
                aria-label={`打开 ${item.title} 操作菜单`}
                aria-expanded={openMenuId === item.id}
                onClick={(event) => {
                  event.preventDefault();
                  setOpenMenuId((current) =>
                    current === item.id ? null : item.id,
                  );
                }}
                ref={(node) => {
                  if (node) menuTriggerRefs.current.set(item.id, node);
                  else menuTriggerRefs.current.delete(item.id);
                }}
              >
                <span aria-hidden="true">•••</span>
              </summary>
              <form action={formAction}>
                <input type="hidden" name="workItemId" value={item.id} />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={item.version}
                />
                {targets.map((target) => (
                  <button
                    key={target}
                    type="submit"
                    name="targetState"
                    value={target}
                    disabled={pending}
                    onClick={() => setOpenMenuId(null)}
                  >
                    移动到 {stateLabels[target]}
                  </button>
                ))}
              </form>
            </details>
          ) : null}
        </div>

        <Link href={buildWorkItemDetailHref(item.id, {
          projectKey,
          projectVersionId,
          view,
        })}>{item.title}</Link>

        <div className="work-tracker-card-footer">
          {project ? (
            <span className="work-tracker-project-badge">
              Project: {project.title}
            </span>
          ) : item.project_ref ? (
            <span className="work-tracker-project-badge work-tracker-project-badge-legacy">
              Legacy Project: {item.project_ref}
            </span>
          ) : (
            <span className="work-tracker-project-badge work-tracker-project-badge-legacy">
              No Project
            </span>
          )}
          <span className="work-tracker-assignee-badge">
            Assigned · {item.assigned_agent_id}
          </span>
          {projectVersion ? (
            <span className={`work-tracker-version-badge work-tracker-version-${projectVersion.status}`}>
              {projectVersion.is_backlog ? "待规划" : projectVersion.version_label} · {PROJECT_VERSION_STATUS_LABELS[projectVersion.status]}
            </span>
          ) : null}
          <span className="work-tracker-claim-badge">{claimLabel}</span>
        </div>
      </li>
    );
  }

  return (
    <section className="work-tracker-board" aria-label="Work Tracker Board">
      <div
        className="work-tracker-toolbar"
        role="group"
        aria-label="Work Tracker controls"
      >
        {projects && trackedProjects.length > 0 ? (
          <div className="work-tracker-filter">
            <CanonicalProjectPicker
              id="work-tracker-project-filter"
              name="projectFilter"
              projects={trackedProjects}
              value={projectKey}
              onChange={(nextProjectKey) => {
                setProjectSelection(nextProjectKey);
                setProjectVersionId("all");
              }}
              allowAll
              selectLabel="Filter by Project"
              allLabel="全部有 Item 的 Project"
              showAvailabilityCount={false}
            />
          </div>
        ) : null}
        {projectKey !== "all" ? (
          <div className="work-tracker-filter">
            <ProjectVersionPicker
              id="work-tracker-version-filter"
              name="versionFilter"
              versions={versions}
              projectKey={projectKey}
              value={projectVersionId}
              onChange={setProjectVersionId}
              allowAll
            />
          </div>
        ) : null}
        <span className="work-tracker-item-count">
          {filteredItems.length} of {state.items.length} items
        </span>
      </div>

      <div className="work-tracker-view-tabs" aria-label="Work Tracker views">
        <button
          type="button"
          aria-pressed={view === "active"}
          onClick={() => setView("active")}
        >
          进行中工作 {activeItems.length}
        </button>
        <button
          type="button"
          aria-pressed={view === "completed"}
          onClick={() => setView("completed")}
        >
          已完成 {completedItems.length}
        </button>
      </div>

      {filteredItems.length === 0 ? (
        <p className="work-tracker-empty-board">
          {state.items.length === 0
            ? "Use 新建 Item to capture the first work item."
            : "No work items match this Project."}
        </p>
      ) : null}
      {mutationState.status === "error" && mutationState.formError ? (
        <p className="observatory-form-error" role="alert">
          {mutationState.formError}
        </p>
      ) : null}
      {mutationState.status === "success" ? (
        <p className="observatory-form-success" role="status">
          Work item moved. Version {mutationState.version}.
        </p>
      ) : null}

      {view === "active" ? (
        <div className="work-tracker-columns" aria-label="Work Tracker Board">
          {OBSERVATORY_WORK_ITEM_ACTIVE_GROUPS.map((group) => {
            const items = activeItems.filter((item) =>
              group.states.includes(item.state as never),
            );
            return (
              <section
                key={group.id}
                className={`work-tracker-column work-tracker-column-${group.id}`}
                aria-label={`${group.label} · ${items.length}`}
              >
                <header>
                  <div>
                    <h3>{group.label}</h3>
                    <small>{group.description}</small>
                  </div>
                  <span>{items.length}</span>
                </header>
                {items.length === 0 ? (
                  <p className="work-tracker-column-empty">No work items.</p>
                ) : (
                  <ul>{items.map(renderCard)}</ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <section
          className="work-tracker-history"
          aria-label={`已完成事项 · ${completedItems.length}`}
        >
          {completedItems.length === 0 ? (
            <p className="work-tracker-column-empty">No completed work items.</p>
          ) : (
            <ul>{completedItems.map(renderCard)}</ul>
          )}
        </section>
      )}
    </section>
  );
}
