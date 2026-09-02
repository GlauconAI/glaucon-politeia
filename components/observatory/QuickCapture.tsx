"use client";

import { startTransition, useActionState, useState } from "react";

import {
  captureObservatoryWorkItemAction,
  type ObservatoryQuickCaptureActionState,
} from "@/app/observatory/actions";
import { CanonicalProjectPicker } from "@/components/observatory/CanonicalProjectPicker";
import { ProjectVersionPicker } from "@/components/observatory/ProjectVersionPicker";
import type { ObservatoryProjectVersionRow } from "@/lib/observatory/repository";
import type { WorkTrackerProjectOption } from "@/lib/observatory/work-tracker-projects";

type QuickCaptureAction = (
  previousState: ObservatoryQuickCaptureActionState,
  formData: FormData,
) => Promise<ObservatoryQuickCaptureActionState>;

type QuickCaptureProps = {
  action?: QuickCaptureAction;
  initialIdempotencyKey: string;
  initialState?: ObservatoryQuickCaptureActionState;
  projects?: WorkTrackerProjectOption[];
  agentIds?: string[];
  versions?: ObservatoryProjectVersionRow[];
};

const idleState: ObservatoryQuickCaptureActionState = { status: "idle" };

export function QuickCapture({
  action = captureObservatoryWorkItemAction,
  initialIdempotencyKey,
  initialState = idleState,
  projects,
  agentIds = [],
  versions = [],
}: QuickCaptureProps) {
  const [selectedType, setSelectedType] = useState<
    "idea" | "feature" | "bug"
  >("idea");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [assignedAgentId, setAssignedAgentId] = useState("");
  const [projectVersionId, setProjectVersionId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(
    initialIdempotencyKey,
  );
  const [state, formAction, pending] = useActionState(
    async (
      previousState: ObservatoryQuickCaptureActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        setSelectedType("idea");
        setTitle("");
        setDescription("");
        setIdempotencyKey(
          `observatory-capture-${globalThis.crypto.randomUUID()}`,
        );
      }
      return nextState;
    },
    initialState,
  );

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const titleError = fieldErrors?.title?.[0];
  const descriptionError = fieldErrors?.description?.[0];
  const typeError = fieldErrors?.type?.[0];
  const projectError = fieldErrors?.projectRef?.[0];
  const projectVersionError = fieldErrors?.projectVersionId?.[0];
  const assignedAgentError = fieldErrors?.assignedAgentId?.[0];
  const idempotencyError = fieldErrors?.idempotencyKey?.[0];

  return (
    <section className="observatory-capture-panel">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Inbox command</p>
          <h2>Quick Capture</h2>
        </div>
        <span className="observatory-keyboard-label">Tab ↹ · Enter ↵</span>
      </div>
      <p className="observatory-panel-copy">
        Capture an Idea, Feature, or Bug now; triage and planning happen later.
      </p>
      <p className="work-tracker-language-guidance">
        标题、描述和验收标准默认使用中文；常用英文专有名词、产品名、代码标识、路径、API
        与提交哈希可以保留。
      </p>

      <form
        action={formAction}
        className="observatory-capture-form"
        aria-label="Quick Capture"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(() => formAction(formData));
        }}
      >
        <input
          type="hidden"
          name="idempotencyKey"
          value={idempotencyKey}
        />

        {projects ? (
          <>
            <CanonicalProjectPicker
              id="observatory-capture-project"
              projects={projects}
              value={projectRef}
              onChange={(nextProjectRef) => {
                setProjectRef(nextProjectRef);
                setProjectVersionId("");
                const project = projects.find(
                  (candidate) => candidate.projectKey === nextProjectRef,
                );
                const owner = project?.owner.toLowerCase() ?? "";
                setAssignedAgentId(agentIds.includes(owner) ? owner : "");
              }}
              required
            />
            {projectError ? (
              <p className="observatory-field-error">{projectError}</p>
            ) : null}
            <ProjectVersionPicker
              id="observatory-capture-project-version"
              versions={versions}
              projectKey={projectRef}
              value={projectVersionId}
              onChange={setProjectVersionId}
              required
            />
            {projectVersionError ? (
              <p className="observatory-field-error">{projectVersionError}</p>
            ) : null}
            <label
              className="observatory-field"
              htmlFor="observatory-capture-assigned-agent"
            >
              <span>Assigned Agent</span>
              <select
                id="observatory-capture-assigned-agent"
                name="assignedAgentId"
                required
                value={assignedAgentId}
                aria-invalid={assignedAgentError ? true : undefined}
                aria-describedby={
                  assignedAgentError
                    ? "observatory-assigned-agent-error"
                    : undefined
                }
                onChange={(event) => setAssignedAgentId(event.target.value)}
              >
                <option value="">Choose an Agent</option>
                {[...agentIds].sort().map((agentId) => (
                  <option key={agentId} value={agentId}>
                    {agentId}
                  </option>
                ))}
              </select>
            </label>
            {assignedAgentError ? (
              <p
                id="observatory-assigned-agent-error"
                className="observatory-field-error"
              >
                {assignedAgentError}
              </p>
            ) : null}
          </>
        ) : null}

        <fieldset
          className="observatory-type-picker"
          aria-describedby={typeError ? "observatory-type-error" : undefined}
        >
          <legend>Type</legend>
          <div>
            {(["idea", "feature", "bug"] as const).map((itemType) => (
              <label key={itemType}>
                <input
                  type="radio"
                  name="type"
                  value={itemType}
                  checked={selectedType === itemType}
                  onChange={() => setSelectedType(itemType)}
                />
                <span>{itemType[0].toUpperCase() + itemType.slice(1)}</span>
              </label>
            ))}
          </div>
          {typeError ? (
            <p id="observatory-type-error" className="observatory-field-error">
              {typeError}
            </p>
          ) : null}
        </fieldset>

        <label className="observatory-field" htmlFor="observatory-capture-title">
          <span>Title</span>
          <input
            id="observatory-capture-title"
            name="title"
            required
            maxLength={200}
            autoComplete="off"
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? "observatory-title-error" : undefined}
            placeholder="用中文简要说明需要处理的事项"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {titleError ? (
          <p id="observatory-title-error" className="observatory-field-error">
            {titleError}
          </p>
        ) : null}

        <label
          className="observatory-field"
          htmlFor="observatory-capture-description"
        >
          <span>Details <small>(optional)</small></span>
          <textarea
            id="observatory-capture-description"
            name="description"
            rows={5}
            maxLength={4000}
            aria-invalid={descriptionError ? true : undefined}
            aria-describedby={
              descriptionError ? "observatory-description-error" : undefined
            }
            placeholder="补充背景、目标或限制；专有名词可保留英文"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {descriptionError ? (
          <p
            id="observatory-description-error"
            className="observatory-field-error"
          >
            {descriptionError}
          </p>
        ) : null}

        {idempotencyError ? (
          <p className="observatory-form-error" role="alert">
            {idempotencyError}
          </p>
        ) : null}
        {state.status === "error" && state.formError ? (
          <p className="observatory-form-error" role="alert">
            {state.formError}
          </p>
        ) : null}
        {state.status === "success" ? (
          <p className="observatory-form-success" role="status">
            Captured in inbox. Reference: <code>{state.workItemId}</code>
          </p>
        ) : null}

        <button
          className="button-primary"
          type="submit"
          disabled={pending || (projects !== undefined && projects.length === 0)}
        >
          {pending ? "Capturing…" : "Capture work item"}
        </button>
      </form>
    </section>
  );
}
