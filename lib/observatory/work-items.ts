import { z } from "zod";

export const OBSERVATORY_WORK_ITEM_TYPES = [
  "idea",
  "feature",
  "bug",
] as const;
export const OBSERVATORY_WORK_ITEM_STATES = [
  "inbox",
  "triage",
  "ready",
  "in_progress",
  "review",
  "done",
  "blocked",
  "waiting",
  "reopened",
] as const;
export const OBSERVATORY_WORK_ITEM_PRIORITIES = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;

export const OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH = 200;
export const OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH = 4_000;
export const OBSERVATORY_QUICK_CAPTURE_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const OBSERVATORY_ACCEPTANCE_CRITERIA_MAX_LENGTH = 4_000;
export const OBSERVATORY_GOVERNANCE_REF_MAX_LENGTH = 160;
export const OBSERVATORY_EVIDENCE_LABEL_MAX_LENGTH = 200;
export const OBSERVATORY_EVIDENCE_URL_MAX_LENGTH = 2_048;

const QuickCaptureTextSchema = z.string().trim();
const WorkItemIdSchema = z.uuid();
const ExpectedVersionSchema = z.number().int().positive();
const NullablePrioritySchema = z
  .enum(OBSERVATORY_WORK_ITEM_PRIORITIES)
  .nullable();
const NullableOwnerSchema = z.uuid().nullable();
const AssignedAgentIdSchema = QuickCaptureTextSchema.min(1)
  .max(80)
  .regex(
    /^[a-z][a-z0-9-]{0,79}$/u,
    "Use a lowercase Agent ID with letters, numbers, and hyphens.",
  )
  .refine(
    (value) => value !== "shared",
    "Choose an Agent from the runtime registry.",
  );
const NullableReferenceSchema = QuickCaptureTextSchema.max(
  OBSERVATORY_GOVERNANCE_REF_MAX_LENGTH,
)
  .nullable()
  .transform((value) => value || null);
const ProjectReferenceSchema = QuickCaptureTextSchema.min(1).max(
  OBSERVATORY_GOVERNANCE_REF_MAX_LENGTH,
);
const NullableProjectKeySchema = QuickCaptureTextSchema.max(256)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .nullable();
const NullableControlIdSchema = QuickCaptureTextSchema.max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/iu)
  .nullable();

export const ObservatoryQuickCaptureInputSchema = z.strictObject({
  type: z.enum(OBSERVATORY_WORK_ITEM_TYPES),
  title: QuickCaptureTextSchema.min(1).max(
    OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH,
  ),
  description: QuickCaptureTextSchema.max(
    OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH,
  ).default(""),
  projectRef: ProjectReferenceSchema,
  assignedAgentId: AssignedAgentIdSchema,
  state: z.literal("inbox").default("inbox"),
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
export type ObservatoryWorkItemPriority =
  (typeof OBSERVATORY_WORK_ITEM_PRIORITIES)[number];

export const OBSERVATORY_WORK_ITEM_ACTIVE_GROUPS = [
  {
    id: "pending",
    label: "待处理",
    description: "Inbox · Triage",
    states: ["inbox", "triage"],
  },
  {
    id: "ready",
    label: "待执行",
    description: "Ready · Reopened",
    states: ["ready", "reopened"],
  },
  {
    id: "active",
    label: "进行中",
    description: "In Progress · Blocked · Waiting",
    states: ["in_progress", "blocked", "waiting"],
  },
  {
    id: "review",
    label: "待验收",
    description: "Review",
    states: ["review"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  states: readonly ObservatoryWorkItemState[];
}[];

export const OBSERVATORY_WORK_ITEM_COMPLETED_STATES = [
  "done",
] as const satisfies readonly ObservatoryWorkItemState[];
export type ObservatoryQuickCaptureInput = z.infer<
  typeof ObservatoryQuickCaptureInputSchema
>;

const transitionGraph = {
  inbox: ["triage"],
  triage: ["inbox", "ready"],
  ready: ["triage", "in_progress"],
  in_progress: ["review", "blocked", "waiting"],
  review: ["in_progress", "done", "blocked", "waiting"],
  done: ["reopened"],
  blocked: ["in_progress", "waiting"],
  waiting: ["in_progress", "blocked"],
  reopened: ["ready", "in_progress"],
} as const satisfies Record<
  ObservatoryWorkItemState,
  readonly ObservatoryWorkItemState[]
>;

export function allowedObservatoryWorkItemTransitions(
  state: ObservatoryWorkItemState,
): ObservatoryWorkItemState[] {
  return [...transitionGraph[state]];
}

export function isObservatoryWorkItemTransitionAllowed(
  from: ObservatoryWorkItemState,
  to: ObservatoryWorkItemState,
) {
  return transitionGraph[from].some((state) => state === to);
}

export type ObservatoryReadyGateField =
  | "acceptanceCriteria"
  | "priority"
  | "ownerId";

export function getObservatoryReadyGateFailures(input: {
  acceptanceCriteria: string;
  priority: ObservatoryWorkItemPriority | null;
  ownerId: string | null;
}): ObservatoryReadyGateField[] {
  const failures: ObservatoryReadyGateField[] = [];
  if (!input.acceptanceCriteria.trim()) failures.push("acceptanceCriteria");
  if (!input.priority) failures.push("priority");
  if (!input.ownerId) failures.push("ownerId");
  return failures;
}

export const ObservatoryWorkItemUpdateInputSchema = z.strictObject({
  workItemId: WorkItemIdSchema,
  expectedVersion: ExpectedVersionSchema,
  type: z.enum(OBSERVATORY_WORK_ITEM_TYPES),
  title: QuickCaptureTextSchema.min(1).max(
    OBSERVATORY_QUICK_CAPTURE_TITLE_MAX_LENGTH,
  ),
  description: QuickCaptureTextSchema.max(
    OBSERVATORY_QUICK_CAPTURE_DESCRIPTION_MAX_LENGTH,
  ),
  acceptanceCriteria: QuickCaptureTextSchema.max(
    OBSERVATORY_ACCEPTANCE_CRITERIA_MAX_LENGTH,
  ),
  priority: NullablePrioritySchema,
  ownerId: NullableOwnerSchema,
  assignedAgentId: AssignedAgentIdSchema,
  projectRef: ProjectReferenceSchema,
  milestoneRef: NullableReferenceSchema,
  projectKey: NullableProjectKeySchema,
  planRevision: z.number().int().nonnegative().nullable(),
  stageId: NullableControlIdSchema,
  workPackageId: NullableControlIdSchema,
}).superRefine((input, context) => {
  const binding = [input.projectKey, input.planRevision, input.stageId, input.workPackageId];
  const present = binding.filter((value) => value !== null).length;
  if (present !== 0 && present !== binding.length) {
    context.addIssue({
      code: "custom",
      path: ["projectKey"],
      message: "Project Control binding must be fully specified or fully empty.",
    });
  }
  if (input.projectKey && input.projectRef !== input.projectKey) {
    context.addIssue({
      code: "custom",
      path: ["projectRef"],
      message: "Project must match the Project Control binding.",
    });
  }
});

export const ObservatoryWorkItemTransitionInputSchema = z.strictObject({
  workItemId: WorkItemIdSchema,
  expectedVersion: ExpectedVersionSchema,
  targetState: z.enum(OBSERVATORY_WORK_ITEM_STATES),
});

const EvidenceUrlSchema = QuickCaptureTextSchema.max(
  OBSERVATORY_EVIDENCE_URL_MAX_LENGTH,
).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Use a valid HTTP or HTTPS URL.");

export const ObservatoryEvidenceInputSchema = z.strictObject({
  workItemId: WorkItemIdSchema,
  expectedVersion: ExpectedVersionSchema,
  label: QuickCaptureTextSchema.min(1).max(
    OBSERVATORY_EVIDENCE_LABEL_MAX_LENGTH,
  ),
  url: EvidenceUrlSchema,
});

export const ObservatoryEvidenceRemovalInputSchema = z.strictObject({
  workItemId: WorkItemIdSchema,
  evidenceId: z.uuid(),
  expectedVersion: ExpectedVersionSchema,
});

export type ObservatoryWorkItemUpdateInput = z.infer<
  typeof ObservatoryWorkItemUpdateInputSchema
>;
export type ObservatoryWorkItemTransitionInput = z.infer<
  typeof ObservatoryWorkItemTransitionInputSchema
>;
export type ObservatoryEvidenceInput = z.infer<
  typeof ObservatoryEvidenceInputSchema
>;
export type ObservatoryEvidenceRemovalInput = z.infer<
  typeof ObservatoryEvidenceRemovalInputSchema
>;
