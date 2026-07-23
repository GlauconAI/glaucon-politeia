"use client";

import Link from "next/link";
import { useActionState, useEffect, useReducer, useState } from "react";

import {
  addObservatoryWorkItemEvidenceAction,
  removeObservatoryWorkItemEvidenceAction,
  transitionObservatoryWorkItemAction,
  type ObservatoryWorkItemMutationActionState,
  updateObservatoryWorkItemAction,
} from "@/app/observatory/actions";
import type {
  ObservatoryWorkItemEventRow,
  ObservatoryWorkItemEvidenceRow,
  ObservatoryWorkItemRow,
} from "@/lib/observatory/repository";
import {
  OBSERVATORY_WORK_ITEM_PRIORITIES,
  OBSERVATORY_WORK_ITEM_TYPES,
  allowedObservatoryWorkItemTransitions,
  getObservatoryReadyGateFailures,
} from "@/lib/observatory/work-items";

type MutationAction = (
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
) => Promise<ObservatoryWorkItemMutationActionState>;

type WorkItemDetailProps = {
  item: ObservatoryWorkItemRow;
  evidence: ObservatoryWorkItemEvidenceRow[];
  events: ObservatoryWorkItemEventRow[];
  currentAdmin: {
    user_id: string;
    username: string | null;
    display_name: string | null;
  };
  updateAction?: MutationAction;
  transitionAction?: MutationAction;
  addEvidenceAction?: MutationAction;
  removeEvidenceAction?: MutationAction;
};

const stateLabels = {
  inbox: "Inbox",
  triage: "Triage",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  blocked: "Blocked",
  waiting: "Waiting",
  reopened: "Reopened",
} as const;

const idleState: ObservatoryWorkItemMutationActionState = { status: "idle" };

function MutationFeedback({
  state,
  success,
}: {
  state: ObservatoryWorkItemMutationActionState;
  success: string;
}) {
  if (state.status === "error") {
    const fieldMessages = Object.values(state.fieldErrors ?? {}).flatMap(
      (messages) => messages ?? [],
    );
    return (
      <>
        {state.formError ? (
          <p role="alert" className="observatory-form-error">
            {state.formError}
          </p>
        ) : null}
        {fieldMessages.length > 0 ? (
          <p role="alert" className="observatory-form-error">
            {fieldMessages.join(" ")}
          </p>
        ) : null}
      </>
    );
  }
  return state.status === "success" ? (
    <p role="status" className="observatory-form-success">
      {success} Version {state.version}.
    </p>
  ) : null;
}

function eventSummary(event: ObservatoryWorkItemEventRow) {
  if (event.event_type === "state_transitioned") {
    const from = typeof event.data.from === "string" ? event.data.from : "?";
    const to = typeof event.data.to === "string" ? event.data.to : "?";
    return `${from} → ${to}`;
  }
  if (
    event.event_type === "evidence_added" ||
    event.event_type === "evidence_removed"
  ) {
    const label =
      typeof event.data.label === "string" ? event.data.label : "Evidence";
    return `${event.event_type === "evidence_added" ? "Added" : "Removed"} ${label}`;
  }
  return event.event_type === "created" ? "Created" : "Fields updated";
}

export function WorkItemDetail({
  item,
  evidence,
  events,
  currentAdmin,
  updateAction = updateObservatoryWorkItemAction,
  transitionAction = transitionObservatoryWorkItemAction,
  addEvidenceAction = addObservatoryWorkItemEvidenceAction,
  removeEvidenceAction = removeObservatoryWorkItemEvidenceAction,
}: WorkItemDetailProps) {
  const [updateState, updateFormAction, updating] = useActionState(
    updateAction,
    idleState,
  );
  const [transitionState, transitionFormAction, transitioning] =
    useActionState(transitionAction, idleState);
  const [evidenceState, evidenceFormAction, addingEvidence] = useActionState(
    addEvidenceAction,
    idleState,
  );
  const [removalState, removalFormAction, removingEvidence] = useActionState(
    removeEvidenceAction,
    idleState,
  );
  const [priority, setPriority] = useState(item.priority ?? "");
  const [ownerId, setOwnerId] = useState(item.owner_id ?? "");
  const [, syncControlledFields] = useReducer((version: number) => version + 1, 0);
  useEffect(() => {
    if (updateState.status !== "idle") {
      syncControlledFields();
    }
  }, [updateState]);
  const readyFailures = getObservatoryReadyGateFailures({
    acceptanceCriteria: item.acceptance_criteria,
    priority: item.priority,
    ownerId: item.owner_id,
  });
  const ownerLabel =
    currentAdmin.display_name ?? currentAdmin.username ?? "Current admin";

  return (
    <article className="work-item-detail">
      <header className="work-item-detail-header">
        <div>
          <p className="eyebrow">
            <Link href="/dashboard">Dashboard</Link> / Work Tracker
          </p>
          <h1>{item.title}</h1>
          <p>
            {stateLabels[item.state]} · {item.type} · version {item.version}
          </p>
        </div>
      </header>

      <section aria-labelledby="work-item-fields-title">
        <h2 id="work-item-fields-title">Work item</h2>
        <p className="work-item-ready-gate">
          Ready Gate requires acceptance criteria, priority, and owner.
          {readyFailures.length > 0
            ? ` Missing ${readyFailures
                .map((failure) =>
                  failure === "acceptanceCriteria"
                    ? "acceptance criteria"
                    : failure === "ownerId"
                      ? "owner"
                      : "priority",
                )
                .join(", ")}.`
            : " Gate complete."}
        </p>
        <form action={updateFormAction} className="work-item-edit-form">
          <input type="hidden" name="workItemId" value={item.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={item.version}
          />
          <label>
            <span>Type</span>
            <select name="type" defaultValue={item.type}>
              {OBSERVATORY_WORK_ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Title</span>
            <input
              name="title"
              defaultValue={item.title}
              maxLength={200}
              required
            />
          </label>
          <label className="work-item-wide-field">
            <span>Description</span>
            <textarea
              name="description"
              defaultValue={item.description}
              maxLength={4000}
              rows={4}
            />
          </label>
          <label className="work-item-wide-field">
            <span>Acceptance criteria</span>
            <textarea
              name="acceptanceCriteria"
              defaultValue={item.acceptance_criteria}
              maxLength={4000}
              rows={5}
            />
          </label>
          <label>
            <span>Priority</span>
            <select
              name="priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="">Unassigned</option>
              {OBSERVATORY_WORK_ITEM_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Owner</span>
            <select
              name="ownerId"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Unassigned</option>
              <option value={currentAdmin.user_id}>{ownerLabel}</option>
            </select>
          </label>
          <label>
            <span>Project reference</span>
            <input
              name="projectRef"
              defaultValue={item.project_ref ?? ""}
              maxLength={160}
            />
          </label>
          <label>
            <span>Milestone reference</span>
            <input
              name="milestoneRef"
              defaultValue={item.milestone_ref ?? ""}
              maxLength={160}
            />
          </label>
          <button className="button-primary" type="submit" disabled={updating}>
            {updating ? "Saving…" : "Save fields"}
          </button>
        </form>
        <MutationFeedback state={updateState} success="Fields saved." />
      </section>

      <section aria-labelledby="work-item-transitions-title">
        <h2 id="work-item-transitions-title">Move state</h2>
        <div className="work-item-transition-actions">
          {allowedObservatoryWorkItemTransitions(item.state).map((target) => (
            <form key={target} action={transitionFormAction}>
              <input type="hidden" name="workItemId" value={item.id} />
              <input
                type="hidden"
                name="expectedVersion"
                value={item.version}
              />
              <input type="hidden" name="targetState" value={target} />
              <button type="submit" disabled={transitioning}>
                Move to {stateLabels[target]}
              </button>
            </form>
          ))}
        </div>
        <MutationFeedback state={transitionState} success="State moved." />
      </section>

      <section aria-labelledby="work-item-evidence-title">
        <h2 id="work-item-evidence-title">Evidence</h2>
        {evidence.length === 0 ? (
          <p>No evidence links yet.</p>
        ) : (
          <ul className="work-item-evidence-list">
            {evidence.map((entry) => (
              <li key={entry.id}>
                <a href={entry.url} target="_blank" rel="noreferrer">
                  {entry.label}
                </a>
                <form action={removalFormAction}>
                  <input type="hidden" name="workItemId" value={item.id} />
                  <input type="hidden" name="evidenceId" value={entry.id} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={item.version}
                  />
                  <button
                    type="submit"
                    disabled={removingEvidence}
                    aria-label={`Remove ${entry.label}`}
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={evidenceFormAction} className="work-item-evidence-form">
          <input type="hidden" name="workItemId" value={item.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={item.version}
          />
          <label>
            <span>Evidence label</span>
            <input name="label" maxLength={200} required />
          </label>
          <label>
            <span>Evidence URL</span>
            <input
              name="url"
              type="url"
              maxLength={2048}
              placeholder="https://"
              required
            />
          </label>
          <button type="submit" disabled={addingEvidence}>
            {addingEvidence ? "Adding…" : "Add evidence"}
          </button>
        </form>
        <MutationFeedback state={evidenceState} success="Evidence added." />
        <MutationFeedback state={removalState} success="Evidence removed." />
      </section>

      <section aria-labelledby="work-item-history-title">
        <h2 id="work-item-history-title">History</h2>
        {events.length === 0 ? (
          <p>No history events.</p>
        ) : (
          <ol className="work-item-history">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{eventSummary(event)}</strong>
                <time dateTime={event.created_at}>
                  {new Date(event.created_at).toLocaleString("en-CA", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  );
}
