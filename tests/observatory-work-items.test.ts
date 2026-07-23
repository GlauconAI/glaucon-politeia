import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_WORK_ITEM_PRIORITIES,
  OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH,
  OBSERVATORY_QUICK_CAPTURE_IDEMPOTENCY_KEY_MAX_LENGTH,
  OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH,
  OBSERVATORY_WORK_ITEM_STATES,
  OBSERVATORY_WORK_ITEM_TYPES,
  ObservatoryEvidenceInputSchema,
  ObservatoryQuickCaptureInputSchema,
  ObservatoryWorkItemTransitionInputSchema,
  ObservatoryWorkItemUpdateInputSchema,
  allowedObservatoryWorkItemTransitions,
  getObservatoryReadyGateFailures,
} from "../lib/observatory/work-items";

function validQuickCapture() {
  return {
    type: "idea",
    title: "Map the runtime boundary",
    description: "Keep the source observation read-only.",
    state: "inbox",
    idempotencyKey: "capture-20260721-0001",
  } as const;
}

describe("Observatory Quick Capture validation", () => {
  it("publishes the approved work-item enums", () => {
    expect(OBSERVATORY_WORK_ITEM_TYPES).toEqual(["idea", "feature", "bug"]);
    expect(OBSERVATORY_WORK_ITEM_STATES).toEqual([
      "inbox",
      "triage",
      "ready",
      "in_progress",
      "review",
      "done",
      "blocked",
      "waiting",
      "reopened",
    ]);
    expect(OBSERVATORY_WORK_ITEM_PRIORITIES).toEqual([
      "low",
      "medium",
      "high",
      "urgent",
    ]);
  });

  it.each(OBSERVATORY_WORK_ITEM_TYPES)("accepts the %s capture type", (type) => {
    const result = ObservatoryQuickCaptureInputSchema.safeParse({
      ...validQuickCapture(),
      type,
    });

    expect(result.success).toBe(true);
  });

  it("trims bounded text and defaults optional description and state", () => {
    const result = ObservatoryQuickCaptureInputSchema.safeParse({
      type: "feature",
      title: "  A bounded title  ",
      idempotencyKey: "  capture-0002  ",
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        type: "feature",
        title: "A bounded title",
        description: "",
        state: "inbox",
        idempotencyKey: "capture-0002",
      },
    });
  });

  it("rejects every non-inbox initial state", () => {
    for (const state of ["planned", "in_progress", "done", "archived"]) {
      expect(
        ObservatoryQuickCaptureInputSchema.safeParse({
          ...validQuickCapture(),
          state,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects unsupported types, blank titles, and malformed idempotency keys", () => {
    for (const input of [
      { ...validQuickCapture(), type: "task" },
      { ...validQuickCapture(), title: "   " },
      { ...validQuickCapture(), idempotencyKey: "contains whitespace" },
      { ...validQuickCapture(), idempotencyKey: "../escape" },
    ]) {
      expect(ObservatoryQuickCaptureInputSchema.safeParse(input).success).toBe(
        false,
      );
    }
  });

  it("enforces text length limits", () => {
    for (const input of [
      {
        ...validQuickCapture(),
        title: "t".repeat(OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH + 1),
      },
      {
        ...validQuickCapture(),
        description: "d".repeat(
          OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH + 1,
        ),
      },
      {
        ...validQuickCapture(),
        idempotencyKey: "k".repeat(
          OBSERVATORY_QUICK_CAPTURE_IDEMPOTENCY_KEY_MAX_LENGTH + 1,
        ),
      },
    ]) {
      expect(ObservatoryQuickCaptureInputSchema.safeParse(input).success).toBe(
        false,
      );
    }
  });

  it("defensively rejects non-objects and unknown fields", () => {
    for (const input of [
      null,
      "idea",
      [],
      { ...validQuickCapture(), isAdmin: true },
    ]) {
      expect(ObservatoryQuickCaptureInputSchema.safeParse(input).success).toBe(
        false,
      );
    }
  });
});

describe("Work Tracker workflow contract", () => {
  it("publishes only the approved state transitions", () => {
    expect(allowedObservatoryWorkItemTransitions("inbox")).toEqual(["triage"]);
    expect(allowedObservatoryWorkItemTransitions("triage")).toEqual([
      "inbox",
      "ready",
    ]);
    expect(allowedObservatoryWorkItemTransitions("ready")).toEqual([
      "triage",
      "in_progress",
    ]);
    expect(allowedObservatoryWorkItemTransitions("in_progress")).toEqual([
      "review",
      "blocked",
      "waiting",
    ]);
    expect(allowedObservatoryWorkItemTransitions("review")).toEqual([
      "in_progress",
      "done",
      "blocked",
      "waiting",
    ]);
    expect(allowedObservatoryWorkItemTransitions("done")).toEqual(["reopened"]);
    expect(allowedObservatoryWorkItemTransitions("reopened")).toEqual([
      "ready",
      "in_progress",
    ]);
  });

  it("reports every missing Ready Gate requirement", () => {
    expect(
      getObservatoryReadyGateFailures({
        acceptanceCriteria: "  ",
        priority: null,
        ownerId: null,
      }),
    ).toEqual(["acceptanceCriteria", "priority", "ownerId"]);
    expect(
      getObservatoryReadyGateFailures({
        acceptanceCriteria: "Evidence is linked.",
        priority: "high",
        ownerId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual([]);
  });

  it("validates bounded editable fields and nullable governance references", () => {
    const result = ObservatoryWorkItemUpdateInputSchema.safeParse({
      workItemId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 2,
      type: "feature",
      title: "Ship the manual board",
      description: "Admin-only.",
      acceptanceCriteria: "The item can reach Done.",
      priority: "urgent",
      ownerId: "22222222-2222-4222-8222-222222222222",
      projectRef: null,
      milestoneRef: "OBS-M3",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown edit fields and malformed identifiers", () => {
    expect(
      ObservatoryWorkItemUpdateInputSchema.safeParse({
        workItemId: "not-a-uuid",
        expectedVersion: 0,
        type: "feature",
        title: "Invalid",
        description: "",
        acceptanceCriteria: "",
        priority: null,
        ownerId: null,
        projectRef: null,
        milestoneRef: null,
        isAdmin: true,
      }).success,
    ).toBe(false);
  });

  it("accepts only a legal transition-shaped request", () => {
    expect(
      ObservatoryWorkItemTransitionInputSchema.safeParse({
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 3,
        targetState: "review",
      }).success,
    ).toBe(true);
    expect(
      ObservatoryWorkItemTransitionInputSchema.safeParse({
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 3,
        targetState: "archived",
      }).success,
    ).toBe(false);
  });

  it("accepts only bounded HTTP(S) evidence", () => {
    const base = {
      workItemId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 4,
      label: "Production evidence",
    };

    expect(
      ObservatoryEvidenceInputSchema.safeParse({
        ...base,
        url: "https://402v.com/dashboard",
      }).success,
    ).toBe(true);
    for (const url of [
      "file:///tmp/private",
      "javascript:alert(1)",
      "ftp://example.com/evidence",
    ]) {
      expect(
        ObservatoryEvidenceInputSchema.safeParse({ ...base, url }).success,
      ).toBe(false);
    }
  });
});
