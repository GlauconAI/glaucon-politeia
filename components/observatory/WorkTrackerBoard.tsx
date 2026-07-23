"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";

import {
  transitionObservatoryWorkItemAction,
  type ObservatoryWorkItemMutationActionState,
} from "@/app/observatory/actions";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import {
  OBSERVATORY_WORK_ITEM_STATES,
  allowedObservatoryWorkItemTransitions,
  type ObservatoryWorkItemState,
} from "@/lib/observatory/work-items";

export type WorkTrackerBoardState =
  | { status: "ready"; items: ObservatoryWorkItemRow[] }
  | { status: "error"; message: string };

type TransitionAction = (
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
) => Promise<ObservatoryWorkItemMutationActionState>;

type WorkTrackerBoardProps = {
  state: WorkTrackerBoardState;
  action?: TransitionAction;
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
}: WorkTrackerBoardProps) {
  const [mutationState, formAction, pending] = useActionState(
    action,
    idleState,
  );

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

  const itemsById = new Map(state.items.map((item) => [item.id, item]));

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
        <span>{state.items.length} items</span>
      </div>
      <p className="observatory-panel-copy">
        Server-authoritative workflow. Drag is optional; every card has a
        keyboard-operable move control.
      </p>

      {state.items.length === 0 ? (
        <p className="work-tracker-empty-board">
          Capture the first work item with Quick Capture.
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
          const items = state.items.filter(
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
                    const targets =
                      allowedObservatoryWorkItemTransitions(item.state);
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
                        </div>
                        <Link href={`/dashboard/work-items/${item.id}`}>
                          {item.title}
                        </Link>
                        <small>
                          {item.project_ref ?? "No project"}
                          {item.milestone_ref
                            ? ` · ${item.milestone_ref}`
                            : ""}
                        </small>
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
