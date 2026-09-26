import { z } from "zod";

import {
  OBSERVATORY_VERSION_BINDING_KINDS,
  OBSERVATORY_WORK_ITEM_PRIORITIES,
  OBSERVATORY_WORK_ITEM_STATES,
  OBSERVATORY_WORK_ITEM_TYPES,
  allowedObservatoryWorkItemTransitions,
  type ObservatoryWorkItemState,
} from "@/lib/observatory/work-items";

const AgentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9-]*$/u);
const WorkItemIdSchema = z.uuid();
const ExpectedVersionSchema = z.number().int().positive();
const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const ProjectRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const AgentWorkItemListQuerySchema = z.strictObject({
  state: z.enum(OBSERVATORY_WORK_ITEM_STATES).optional(),
  projectRef: ProjectRefSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const AgentWorkItemCreateSchema = z.strictObject({
  type: z.enum(OBSERVATORY_WORK_ITEM_TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4_000).default(""),
  projectRef: ProjectRefSchema,
  projectVersionId: z.uuid(),
  versionBindingKind: z
    .enum(OBSERVATORY_VERSION_BINDING_KINDS)
    .default("optional"),
  idempotencyKey: IdempotencyKeySchema,
});

const UpdateMutationSchema = z.strictObject({
  action: z.literal("update"),
  expectedVersion: ExpectedVersionSchema,
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4_000).optional(),
  acceptanceCriteria: z.string().trim().max(4_000).optional(),
  priority: z.enum(OBSERVATORY_WORK_ITEM_PRIORITIES).nullable().optional(),
  idempotencyKey: IdempotencyKeySchema,
});

const TransitionMutationSchema = z.strictObject({
  action: z.literal("transition"),
  expectedVersion: ExpectedVersionSchema,
  targetState: z.enum(OBSERVATORY_WORK_ITEM_STATES),
  idempotencyKey: IdempotencyKeySchema,
});

const AssignMutationSchema = z.strictObject({
  action: z.literal("assign"),
  expectedVersion: ExpectedVersionSchema,
  assignedAgentId: AgentIdSchema,
  idempotencyKey: IdempotencyKeySchema,
});

const EvidenceMutationSchema = z.strictObject({
  action: z.literal("add_evidence"),
  expectedVersion: ExpectedVersionSchema,
  label: z.string().trim().min(1).max(200),
  url: z.url().max(2_048).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }),
  idempotencyKey: IdempotencyKeySchema,
});

export const AgentWorkItemMutationSchema = z.discriminatedUnion("action", [
  UpdateMutationSchema,
  TransitionMutationSchema,
  AssignMutationSchema,
  EvidenceMutationSchema,
]);

export type AgentWorkItemAction =
  | "get"
  | "update"
  | "transition"
  | "assign"
  | "add_evidence"
  | "claim"
  | "complete_claim";

export function normalizeRegistryOwnerAgentId(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function evaluateAgentWorkItemAccess(input: {
  agentId: string;
  projectOwnerAgentId: string | null;
  item: {
    assigned_agent_id: string;
    state: ObservatoryWorkItemState;
  };
}) {
  const isProjectOwner = input.projectOwnerAgentId === input.agentId;
  const isAssignee = input.item.assigned_agent_id === input.agentId;
  const visible = isProjectOwner || isAssignee;
  if (!visible) {
    return {
      visible: false,
      isProjectOwner: false,
      isAssignee: false,
      allowedActions: [] as AgentWorkItemAction[],
      allowedTransitions: [] as ObservatoryWorkItemState[],
    };
  }

  const allowedTransitions = allowedObservatoryWorkItemTransitions(
    input.item.state,
  ).filter((target) => {
    if (isProjectOwner) return true;
    return target !== "done" && target !== "reopened";
  });
  const allowedActions: AgentWorkItemAction[] = ["get"];
  if (isAssignee || isProjectOwner) {
    allowedActions.push("update", "transition", "add_evidence");
  }
  if (isAssignee) allowedActions.push("claim", "complete_claim");
  if (isProjectOwner) allowedActions.push("assign");

  return {
    visible,
    isProjectOwner,
    isAssignee,
    allowedActions,
    allowedTransitions,
  };
}

export type AgentWorkItemCreateInput = z.infer<
  typeof AgentWorkItemCreateSchema
>;
export type AgentWorkItemMutationInput = z.infer<
  typeof AgentWorkItemMutationSchema
>;
