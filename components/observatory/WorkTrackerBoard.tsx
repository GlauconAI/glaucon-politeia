"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useMemo, useState } from "react";

import {
  transitionObservatoryWorkItemAction,
  type ObservatoryWorkItemMutationActionState,
} from "@/app/observatory/actions";
import { CanonicalProjectPicker } from "@/components/observatory/CanonicalProjectPicker";
import {
  getAgentClaimEligibility,
} from "@/lib/observatory/agent-claims";
import type {
  ObservatoryWorkItemClaimRow,
  ObservatoryWorkItemRow,
} from "@/lib/observatory/repository";
import {
  resolveWorkItemProject,
  type WorkTrackerProjectOption,
} from "@/lib/observatory/work-tracker-projects";
import {
  OBSERVATORY_WORK_ITEM_STATES,
  allowedObservatoryWorkItemTransitions,
  type ObservatoryWorkItemState,
} from "@/lib/observatory/work-items";

export type WorkTrackerBoardState =
  | {
      status: "ready";
      items: ObservatoryWorkItemRow[];
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
};

const labels: Record<ObservatoryWorkItemState, string> = {
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

const idleState: ObservatoryWorkItemMutationActionState = { status: "idle" };

export function WorkTrackerBoard({
  state,
  action = transitionObservatoryWorkItemAction,
  projects,
  initialProjectKey = "all",
}: WorkTrackerBoardProps) {
  const [projectKey, setProjectKey] = useState(initialProjectKey);
  const [mutationState, formAction, pending] = useActionState(
    action,
    idleState,
  );
  const filteredItems = useMemo(() => {
    if (state.status !== "ready" || projectKey === "all" || !projects) {
      return state.status === "ready" ? state.items : [];
    }
    return state.items.filter(
      (item) =>
        resolveWorkItemProject(item, projects)?.projectKey === projectKey,
    );
  }, [projectKey, projects, state]);

  useEffect(() => {
    if (!projects) return;
    const search = new URLSearchParams(window.location.search);
    if (projectKey === "all") search.delete("project");
    else search.set("project", projectKey);
    const query = search.toString();
    window.history.replaceState(
      null,
      "",
      `/work-tracker${query ? `?${query}` : ""}`,
    );
  }, [projectKey, projects]);

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

  const itemsById = new Map(filteredItems.map((item) => [item.id, item]));
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

  function submitMove(item: ObservatoryWorkItemRow, targetState: string) {
    const formData = new FormData();
    formData.set("workItemId", item.id);
    formData.set("expectedVersion", String(item.version));
    formData.set("targetState", targetState);
    startTransition(() => formAction(formData));
  }

  function dropOnColumn(
    event: React.DragEvent<HTMLElement>,
    targetState: ObservatoryWorkItemState,
  ) {
    event.preventDefault();
    const item = itemsById.get(event.dataTransfer.getData("text/plain"));
    if (
      item &&
      allowedObservatoryWorkItemTransitions(item.state).includes(targetState)
    ) {
      submitMove(item, targetState);
    }
  }

  return (
    <section className="work-tracker-board" aria-labelledby="work-tracker-title">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Daily write surface</p>
          <h2 id="work-tracker-title">Work Tracker</h2>
        </div>
        <span>{filteredItems.length} of {state.items.length} items</span>
      </div>
      <p className="observatory-panel-copy">
        Server-authoritative workflow. Drag is optional; every card has a
        keyboard-operable move control.
      </p>

      {projects ? (
        <div className="work-tracker-filter">
          <CanonicalProjectPicker
            id="work-tracker-project-filter"
            name="projectFilter"
            projects={projects}
            value={projectKey}
            onChange={setProjectKey}
            allowAll
            selectLabel="Filter by Project"
          />
        </div>
      ) : null}

      {filteredItems.length === 0 ? (
        <p className="work-tracker-empty-board">
          {state.items.length === 0
            ? "Capture the first work item with Quick Capture."
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

      <div className="work-tracker-columns" aria-label="Work Tracker Board">
        {OBSERVATORY_WORK_ITEM_STATES.map((columnState) => {
          const items = filteredItems.filter(
            (item) => item.state === columnState,
          );
          return (
            <section
              key={columnState}
              className={`work-tracker-column work-tracker-column-${columnState}`}
              aria-label={`${labels[columnState]} · ${items.length}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOnColumn(event, columnState)}
            >
              <header>
                <h3>{labels[columnState]}</h3>
                <span>{items.length}</span>
              </header>
              {items.length === 0 ? (
                <p className="work-tracker-column-empty">No work items.</p>
              ) : (
                <ul>
                  {items.map((item) => {
                    const project = projects
                      ? resolveWorkItemProject(item, projects)
                      : null;
                    const targets =
                      allowedObservatoryWorkItemTransitions(item.state);
                    const claim = activeClaims.get(item.id);
                    const readyGateComplete = Boolean(
                      item.acceptance_criteria.trim() &&
                        item.priority &&
                        item.owner_id,
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
                        className="work-tracker-card"
                        draggable
                        data-testid={`work-item-${item.id}`}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                        }}
                      >
                        <div className="work-tracker-card-meta">
                          <span>{item.type}</span>
                          <span>{item.priority ?? "No priority"}</span>
                          <span>v{item.version}</span>
                          <span className="work-tracker-claim-badge">
                            {claimLabel}
                          </span>
                        </div>
                        <Link href={`/work-tracker/items/${item.id}`}>
                          {item.title}
                        </Link>
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
                        {item.milestone_ref ? (
                          <small>Milestone: {item.milestone_ref}</small>
                        ) : null}
                        {item.project_key && item.plan_revision !== null ? (
                          <small>
                            Project Control: {item.project_key} · Plan {item.plan_revision} · {item.stage_id} · {item.work_package_id}
                          </small>
                        ) : null}
                        {targets.length > 0 ? (
                          <form
                            action={formAction}
                            className="work-tracker-move-form"
                          >
                            <input
                              type="hidden"
                              name="workItemId"
                              value={item.id}
                            />
                            <input
                              type="hidden"
                              name="expectedVersion"
                              value={item.version}
                            />
                            <label>
                              <span className="sr-only">
                                Move {item.title} to
                              </span>
                              <select
                                name="targetState"
                                aria-label={`Move ${item.title} to`}
                                defaultValue={targets[0]}
                              >
                                {targets.map((target) => (
                                  <option key={target} value={target}>
                                    {labels[target]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button type="submit" disabled={pending}>
                              {pending ? "Moving…" : "Move"}
                            </button>
                          </form>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
