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
import { CanonicalProjectPicker } from "@/components/observatory/CanonicalProjectPicker";
import { ProjectVersionPicker } from "@/components/observatory/ProjectVersionPicker";
import type {
  ObservatoryWorkItemEventRow,
  ObservatoryWorkItemEvidenceRow,
  ObservatoryWorkItemClaimRow,
  ObservatoryWorkItemRow,
  ObservatoryProjectVersionRow,
} from "@/lib/observatory/repository";
import type { ProjectControlSnapshot } from "@/lib/observatory/project-control-schema";
import { classifyProjectControlBinding } from "@/lib/observatory/project-control";
import {
  resolveWorkItemProject,
  type WorkTrackerProjectOption,
} from "@/lib/observatory/work-tracker-projects";
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
  projects: WorkTrackerProjectOption[];
  agentIds?: readonly string[];
  versions?: ObservatoryProjectVersionRow[];
  backHref?: string;
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

const workItemDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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
  projects,
  agentIds = [],
  versions = [],
  backHref = "/work-tracker",
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
  const [assignedAgentId, setAssignedAgentId] = useState(
    item.assigned_agent_id,
  );
  const [projectRef, setProjectRef] = useState(
    resolveWorkItemProject(item, projects)?.projectKey ?? "",
  );
  const [projectVersionId, setProjectVersionId] = useState(item.project_version_id ?? "");
  const [versionBindingKind, setVersionBindingKind] = useState<"required" | "optional">(item.version_binding_kind ?? "optional");
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
  function selectBinding(nextBindingKey: string) {
    setBindingKey(nextBindingKey);
    const nextBinding = allBindingOptions.find(
      (option) => option.key === nextBindingKey,
    );
    if (nextBinding) {
      if (nextBinding.projectKey !== projectRef) setProjectVersionId("");
      setProjectRef(nextBinding.projectKey);
    }
  }
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
  const agentOptions = Array.from(
    new Set([
      item.assigned_agent_id,
      ...agentIds,
    ]),
  ).sort((left, right) => left.localeCompare(right, "en"));
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
            Work Tracker / Item
          </p>
          <Link className="work-item-back-link" href={backHref}>← 返回 Work Tracker</Link>
          <h1>{item.title}</h1>
          <div className="work-item-detail-badges">
            <span>{stateLabels[item.state]}</span>
            <span>{item.type}</span>
            <span>Assigned · {item.assigned_agent_id}</span>
            <span>v{item.version}</span>
          </div>
          <p className="work-item-detail-timestamps">
            Created {workItemDateFormatter.format(new Date(item.created_at))}
            {" · "}Updated {workItemDateFormatter.format(new Date(item.updated_at))}
          </p>
        </div>
      </header>

      <form action={updateFormAction} className="work-item-edit-form">
        <input type="hidden" name="workItemId" value={item.id} />
        <input
          type="hidden"
          name="expectedVersion"
          value={item.version}
        />
        <section
          className="work-item-content-panel"
          role="region"
          aria-label="Item content"
        >
          <p className="eyebrow">Item content</p>
          <h2 id="work-item-fields-title">Content</h2>
          <p className="work-tracker-language-guidance">
            标题、描述和验收标准默认使用中文；常用英文专有名词、产品名、代码标识、路径、API
            与提交哈希可以保留。
          </p>
          <label>
            <span>Title</span>
            <input
              name="title"
              defaultValue={item.title}
              maxLength={200}
              required
            />
          </label>
          <label>
            <span>Description</span>
            <textarea
              name="description"
              defaultValue={item.description}
              maxLength={4000}
              rows={8}
            />
          </label>
          <label>
            <span>Acceptance criteria</span>
            <textarea
              name="acceptanceCriteria"
              defaultValue={item.acceptance_criteria}
              maxLength={4000}
              rows={8}
            />
          </label>
        </section>

        <aside
          className="work-item-properties-panel"
          aria-label="Item properties"
        >
          <p className="eyebrow">Responsibility & control</p>
          <h2>Properties</h2>
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
            <span>Assigned Agent</span>
            <select
              aria-label="Assigned Agent"
              name="assignedAgentId"
              value={assignedAgentId}
              onChange={(event) => setAssignedAgentId(event.target.value)}
              required
            >
              {agentOptions.map((agentId) => (
                <option key={agentId} value={agentId}>
                  {agentId}
                </option>
              ))}
            </select>
            <small>Execution responsibility; this does not grant controller authority.</small>
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
          <div>
            <CanonicalProjectPicker
              id="work-item-project"
              projects={projects}
              value={projectRef}
              onChange={(nextProjectRef) => {
                setProjectRef(nextProjectRef);
                setProjectVersionId("");
                setBindingKey("");
              }}
              required
            />
          </div>
          <ProjectVersionPicker
            id="work-item-project-version"
            versions={versions}
            projectKey={projectRef}
            value={projectVersionId}
            onChange={setProjectVersionId}
            required
          />
          <fieldset className="work-tracker-version-binding" aria-describedby="detail-version-binding-help">
            <legend>Version scope</legend>
            <label><input aria-describedby="detail-version-binding-help" type="radio" name="versionBindingKind" value="required" checked={versionBindingKind === "required"} onChange={() => setVersionBindingKind("required")} /><span>Required version scope</span></label>
            <label><input aria-describedby="detail-version-binding-help" type="radio" name="versionBindingKind" value="optional" checked={versionBindingKind === "optional"} onChange={() => setVersionBindingKind("optional")} /><span>Optional version scope</span></label>
            <small id="detail-version-binding-help">Required scope contributes to the Product Version Release Gate. Version binding does not grant execution authority.</small>
          </fieldset>
          <label>
            <span>Milestone reference</span>
            <input
              name="milestoneRef"
              defaultValue={item.milestone_ref ?? ""}
              maxLength={160}
            />
          </label>
          <label>
            <span>Project Control binding</span>
            <select
              aria-describedby="project-control-binding-help"
              value={bindingKey}
              onChange={(event) => selectBinding(event.target.value)}
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
          <button
            className="button-primary"
            type="submit"
            disabled={updating || projects.length === 0}
          >
            {updating ? "Saving…" : "Save fields"}
          </button>
          <MutationFeedback state={updateState} success="Fields saved." />
        </aside>
      </form>

      <div className="work-item-detail-lower">
        <aside className="work-item-workflow-panel" aria-label="Workflow and Agent Claim">

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

        </aside>
        <div className="work-item-detail-main-stack">

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
        <h2 id="work-item-history-title">Activity</h2>
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
        </div>
      </div>
    </article>
  );
}
