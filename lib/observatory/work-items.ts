import { z } from "zod";

export const OBSERVATORY_WORK_ITEM_TYPES = [
  "idea",
  "feature",
  "bug",
] as const;
export const OBSERVATORY_WORK_ITEM_STATES = ["inbox"] as const;

export const OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH = 200;
export const OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH = 4_000;
export const OBSERVATORY_QUICK_CAPTURE_IDEMPOTENCY_KEY_MAX_LENGTH = 128;

const QuickCaptureTextSchema = z.string().trim();

export const ObservatoryQuickCaptureInputSchema = z.strictObject({
  type: z.enum(OBSERVATORY_WORK_ITEM_TYPES),
  title: QuickCaptureTextSchema.min(1).max(
    OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH,
  ),
  description: QuickCaptureTextSchema.max(
    OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH,
  ).default(""),
  state: z.literal(OBSERVATORY_WORK_ITEM_STATES[0]).default(
    OBSERVATORY_WORK_ITEM_STATES[0],
  ),
  idempotencyKey: QuickCaptureTextSchema.min(1)
    .max(OBSERVATORY_QUICK_CAPTURE_IDEMPOTENCY_KEY_MAX_LENGTH)
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u,
      "Use only letters, numbers, dots, underscores, colons, and hyphens.",
    ),
});

export type ObservatoryWorkItemType =
  (typeof OBSERVATORY_WORK_ITEM_TYPES)[number];
export type ObservatoryWorkItemState =
  (typeof OBSERVATORY_WORK_ITEM_STATES)[number];
export type ObservatoryQuickCaptureInput = z.infer<
  typeof ObservatoryQuickCaptureInputSchema
>;
