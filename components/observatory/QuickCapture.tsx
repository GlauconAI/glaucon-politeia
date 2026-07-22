"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import {
  captureObservatoryWorkItemAction,
  type ObservatoryQuickCaptureActionState,
} from "@/app/observatory/actions";

type QuickCaptureAction = (
  previousState: ObservatoryQuickCaptureActionState,
  formData: FormData,
) => Promise<ObservatoryQuickCaptureActionState>;

type QuickCaptureProps = {
  action?: QuickCaptureAction;
  initialState?: ObservatoryQuickCaptureActionState;
};

const idleState: ObservatoryQuickCaptureActionState = { status: "idle" };

export function QuickCapture({
  action = captureObservatoryWorkItemAction,
  initialState = idleState,
}: QuickCaptureProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formId = useId().replace(/[^A-Za-z0-9._:-]/gu, "") || "form";
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      const nextKey = state.workItemId.replace(/[^A-Za-z0-9._:-]/gu, "");
      if (idempotencyKeyRef.current) {
        idempotencyKeyRef.current.value =
          `observatory-capture-${nextKey || "next"}-next`;
      }
    }
  }, [state]);

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const titleError = fieldErrors?.title?.[0];
  const descriptionError = fieldErrors?.description?.[0];
  const typeError = fieldErrors?.type?.[0];
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

      <form
        ref={formRef}
        action={formAction}
        className="observatory-capture-form"
        aria-label="Quick Capture"
      >
        <input
          ref={idempotencyKeyRef}
          type="hidden"
          name="idempotencyKey"
          defaultValue={`observatory-capture-${formId}-0`}
        />

        <fieldset
          className="observatory-type-picker"
          aria-describedby={typeError ? "observatory-type-error" : undefined}
        >
          <legend>Type</legend>
          <div>
            {(["idea", "feature", "bug"] as const).map((type) => (
              <label key={type}>
                <input
                  type="radio"
                  name="type"
                  value={type}
                  defaultChecked={type === "idea"}
                />
                <span>{type[0].toUpperCase() + type.slice(1)}</span>
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
            placeholder="What needs attention?"
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
            placeholder="Context, desired outcome, or reproduction steps"
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
          <p className="observatory-field-error">{idempotencyError}</p>
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

        <button className="button-primary" type="submit" disabled={pending}>
          {pending ? "Capturing…" : "Capture work item"}
        </button>
      </form>
    </section>
  );
}
