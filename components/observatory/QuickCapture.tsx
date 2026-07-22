"use client";

import { startTransition, useActionState, useState } from "react";

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
  initialIdempotencyKey: string;
  initialState?: ObservatoryQuickCaptureActionState;
};

const idleState: ObservatoryQuickCaptureActionState = { status: "idle" };

export function QuickCapture({
  action = captureObservatoryWorkItemAction,
  initialIdempotencyKey,
  initialState = idleState,
}: QuickCaptureProps) {
  const [selectedType, setSelectedType] = useState<
    "idea" | "feature" | "bug"
  >("idea");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
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
            placeholder="What needs attention?"
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
            placeholder="Context, desired outcome, or reproduction steps"
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

        <button className="button-primary" type="submit" disabled={pending}>
          {pending ? "Capturing…" : "Capture work item"}
        </button>
      </form>
    </section>
  );
}
