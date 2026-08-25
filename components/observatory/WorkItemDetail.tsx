"use client";

import Link from "next/link";
import { useActionState, useEffect, useReducer, useState } from "react";

import {
  addObservatoryWorkItemEvidenceAction,
  cancelObservatoryAgentClaimAction,
  configureObservatoryAgentClaimPolicyAction,
  removeObservatoryWorkItemEvidenceAction,
  transitionObservatoryWorkItemAction,
  type ObservatoryWorkItemMutationActionState,
  updateObservatoryWorkItemAction,
} from "@/app/observatory/actions";
import type {
  ObservatoryWorkItemEventRow,
  ObservatoryWorkItemEvidenceRow,
  ObservatoryWorkItemClaimRow,
  ObservatoryWorkItemRow,
} from "@/lib/observatory/repository";
import type { ProjectControlSnapshot } from "@/lib/observatory/project-control-schema";
import { classifyProjectControlBinding } from "@/lib/observatory/project-control";
import {
  OBSERVATORY_AGENT_ACTION_CLASSES,
  OBSERVATORY_AGENT_RISK_LEVELS,
  getAgentClaimEligibility,
} from "@/lib/observatory/agent-claims";
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
  claims?: ObservatoryWorkItemClaimRow[];
  currentAdmin: {
    user_id: string;
    username: string | null;
    display_name: string | null;
  };
  updateAction?: MutationAction;
  transitionAction?: MutationAction;
  addEvidenceAction?: MutationAction;
  removeEvidenceAction?: MutationAction;
  claimPolicyAction?: MutationAction;
  cancelClaimAction?: MutationAction;
  evaluatedAt?: string;
  projectControls?: ProjectControlSnapshot | null;
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
  if (event.event_type.startsWith("claim_")) {
    return event.event_type
      .replace("claim_", "Claim ")
      .replaceAll("_", " ");
  }
  return event.event_type === "created" ? "Created" : "Fields updated";
}

const eligibilityLabels = {
  unsupported_type: "Only Features and Bugs can be claimed.",
  not_ready: "Move the item to Ready.",
  ready_gate_incomplete: "Complete the Ready Gate.",
  risk_not_low: "Set risk to Low.",
  claim_not_approved: "Enable owner approval.",
  authorized_paths_missing: "Add at least one authorized path.",
  action_classes_missing: "Select at least one action class.",
  active_claim_exists: "An active claim already exists.",
} as const;

export function WorkItemDetail({
  item,
  evidence,
  events,
  claims = [],
  currentAdmin,
  updateAction = updateObservatoryWorkItemAction,
  transitionAction = transitionObservatoryWorkItemAction,
  addEvidenceAction = addObservatoryWorkItemEvidenceAction,
  removeEvidenceAction = removeObservatoryWorkItemEvidenceAction,
  claimPolicyAction = configureObservatoryAgentClaimPolicyAction,
  cancelClaimAction = cancelObservatoryAgentClaimAction,
  evaluatedAt = item.updated_at,
  projectControls = null,
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
  const [policyState, policyFormAction, updatingPolicy] = useActionState(
    claimPolicyAction,
    idleState,
  );
  const [cancelState, cancelFormAction, cancellingClaim] = useActionState(
    cancelClaimAction,
    idleState,
  );
  const [priority, setPriority] = useState(item.priority ?? "");
  const [ownerId, setOwnerId] = useState(item.owner_id ?? "");
  const bindingOptions = projectControls?.projects.flatMap((project) =>
    project.work_packages.map((workPackage) => {
      const stage = project.stages.find((candidate) => candidate.stage_id === workPackage.stage_id);
      return {
        key: `${project.project.project_key}\u001f${project.project.approved_plan_revision}\u001f${workPackage.stage_id}\u001f${workPackage.work_package_id}`,
        projectKey: project.project.project_key,
        planRevision: project.project.approved_plan_revision,
        stageId: workPackage.stage_id,
        workPackageId: workPackage.work_package_id,
        label: `${project.project.title} · Plan ${project.project.approved_plan_revision} · ${stage?.title ?? workPackage.stage_id} · ${workPackage.title}`,
      };
    }),
  ) ?? [];
  const currentBinding = item.project_key && item.plan_revision !== null && item.stage_id && item.work_package_id
    ? {
        key: `${item.project_key}\u001f${item.plan_revision}\u001f${item.stage_id}\u001f${item.work_package_id}`,
        projectKey: item.project_key,
        planRevision: item.plan_revision,
        stageId: item.stage_id,
        workPackageId: item.work_package_id,
        label: `${item.project_key} · Plan ${item.plan_revision} · ${item.stage_id} · ${item.work_package_id}`,
      }
    : null;
  const allBindingOptions = currentBinding && !bindingOptions.some((option) => option.key === currentBinding.key)
    ? [currentBinding, ...bindingOptions]
    : bindingOptions;
  const [bindingKey, setBindingKey] = useState(currentBinding?.key ?? "");
  const selectedBinding = allBindingOptions.find((option) => option.key === bindingKey) ?? null;
  const bindingStatus = currentBinding
    ? classifyProjectControlBinding(currentBinding, projectControls)
    : null;
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
  const activeClaim = claims.find(
    (claim) =>
      claim.status === "active" &&
      claim.ended_at === null &&
      new Date(claim.lease_expires_at).getTime() >
        new Date(evaluatedAt).getTime(),
  );
  const eligibility = getAgentClaimEligibility({
    type: item.type,
    state: item.state,
    readyGateComplete: readyFailures.length === 0,
    riskLevel: item.risk_level,
    enabled: item.agent_claim_enabled,
    authorizedPaths: item.authorized_paths,
    allowedActionClasses: item.allowed_action_classes,
    activeClaim: Boolean(activeClaim),
  });

  return (
    <article className="work-item-detail">
      <header className="work-item-detail-header">
        <div>
          <p className="eyebrow">
            <Link href="/work-tracker">Work Tracker</Link> / Item
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
          <label className="work-item-wide-field">
            <span>Project Control binding</span>
            <select
              aria-describedby="project-control-binding-help"
              value={bindingKey}
              onChange={(event) => setBindingKey(event.target.value)}
            >
              <option value="">Not bound</option>
              {allBindingOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <small id="project-control-binding-help">
              {projectControls
                ? "A Work Item may update only its Work Package workflow; parent Stage and Gate remain Orchestrator-owned."
                : "Project Control source unavailable. Existing binding is preserved unless explicitly cleared."}
              {bindingStatus ? ` Current status: ${bindingStatus.status.replaceAll("_", " ")}.` : ""}
            </small>
          </label>
          <input type="hidden" name="projectKey" value={selectedBinding?.projectKey ?? ""} />
          <input type="hidden" name="planRevision" value={selectedBinding?.planRevision ?? ""} />
          <input type="hidden" name="stageId" value={selectedBinding?.stageId ?? ""} />
          <input type="hidden" name="workPackageId" value={selectedBinding?.workPackageId ?? ""} />
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

      <section aria-labelledby="work-item-agent-claim-title">
        <h2 id="work-item-agent-claim-title">Agent Claim</h2>
        <p className="work-item-ready-gate">
          Agent completion stops at Review. A human administrator owns the
          final Done transition.
        </p>
        {activeClaim ? (
          <div className="work-item-active-claim">
            <p>
              <strong>Claimed by {activeClaim.agent_id}</strong>
            </p>
            <p>
              Heartbeat {new Date(activeClaim.last_heartbeat_at).toLocaleString("en-CA", { timeZone: "UTC" })} UTC
              {" · "}lease ends {new Date(activeClaim.lease_expires_at).toLocaleString("en-CA", { timeZone: "UTC" })} UTC
            </p>
            <form action={cancelFormAction}>
              <input type="hidden" name="workItemId" value={item.id} />
              <input type="hidden" name="claimId" value={activeClaim.id} />
              <input
                type="hidden"
                name="expectedClaimVersion"
                value={activeClaim.claim_version}
              />
              <input
                type="hidden"
                name="expectedWorkItemVersion"
                value={item.version}
              />
              <button type="submit" disabled={cancellingClaim}>
                {cancellingClaim ? "Cancelling…" : "Cancel claim"}
              </button>
            </form>
          </div>
        ) : (
          <p>
            {eligibility.eligible
              ? "Agent eligible."
              : eligibility.reasons.map((reason) => eligibilityLabels[reason]).join(" ")}
          </p>
        )}

        <form action={policyFormAction} className="work-item-claim-policy-form">
          <input type="hidden" name="workItemId" value={item.id} />
          <input
            type="hidden"
            name="expectedVersion"
            value={item.version}
          />
          <label>
            <span>Risk level</span>
            <select name="riskLevel" defaultValue={item.risk_level}>
              {OBSERVATORY_AGENT_RISK_LEVELS.map((risk) => (
                <option key={risk} value={risk}>
                  {risk[0].toUpperCase() + risk.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="work-item-checkbox">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={item.agent_claim_enabled}
            />
            <span>Owner approves Agent Claim</span>
          </label>
          <label className="work-item-wide-field">
            <span>Authorized paths (one repository-relative path per line)</span>
            <textarea
              name="authorizedPaths"
              defaultValue={item.authorized_paths.join("\n")}
              rows={4}
              maxLength={3856}
            />
          </label>
          <fieldset className="work-item-wide-field">
            <legend>Allowed action classes</legend>
            {OBSERVATORY_AGENT_ACTION_CLASSES.map((actionClass) => (
              <label key={actionClass} className="work-item-checkbox">
                <input
                  type="checkbox"
                  name="allowedActionClasses"
                  value={actionClass}
                  defaultChecked={item.allowed_action_classes.includes(actionClass)}
                />
                <span>{actionClass.replaceAll("_", " ")}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={updatingPolicy || Boolean(activeClaim)}>
            {updatingPolicy ? "Saving…" : "Save claim policy"}
          </button>
        </form>
        <MutationFeedback state={policyState} success="Claim policy saved." />
        <MutationFeedback state={cancelState} success="Claim cancelled." />

        <h3>Claim history</h3>
        {claims.length === 0 ? (
          <p>No Agent Claim history.</p>
        ) : (
          <ol className="work-item-claim-history">
            {claims.map((claim) => (
              <li key={claim.id}>
                <strong>
                  {claim.status} · {claim.agent_id}
                </strong>
                <span>claim version {claim.claim_version}</span>
              </li>
            ))}
          </ol>
        )}
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
