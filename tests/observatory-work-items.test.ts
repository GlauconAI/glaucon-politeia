import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH,
  OBSERVATORY_QUICK_CAPTURE_IDEMPOTENCY_KEY_MAX_LENGTH,
  OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH,
  OBSERVATORY_WORK_ITEM_STATES,
  OBSERVATORY_WORK_ITEM_TYPES,
  ObservatoryQuickCaptureInputSchema,
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
    expect(OBSERVATORY_WORK_ITEM_STATES).toEqual(["inbox"]);
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
