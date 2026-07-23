import { z } from "zod";

import type {
  ObservatoryWorkItemState,
  ObservatoryWorkItemType,
} from "@/lib/observatory/work-items";

export const OBSERVATORY_AGENT_RISK_LEVELS = [
  "unclassified",
  "low",
  "high",
] as const;
export const OBSERVATORY_AGENT_ACTION_CLASSES = [
  "code_edit",
  "test",
  "documentation",
] as const;
export const OBSERVATORY_AGENT_CLAIM_STATUSES = [
  "active",
  "completed",
  "released",
  "expired",
  "cancelled",
] as const;

export const OBSERVATORY_AGENT_ID_MAX_LENGTH = 80;
export const OBSERVATORY_AUTHORIZED_PATH_MAX_LENGTH = 240;
export const OBSERVATORY_AUTHORIZED_PATH_MAX_COUNT = 16;
export const OBSERVATORY_AGENT_IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const OBSERVATORY_AGENT_COMPLETION_SUMMARY_MAX_LENGTH = 2_000;
export const OBSERVATORY_AGENT_LEASE_MIN_SECONDS = 300;
export const OBSERVATORY_AGENT_LEASE_MAX_SECONDS = 3_600;
export const OBSERVATORY_AGENT_LEASE_DEFAULT_SECONDS = 900;

export type ObservatoryAgentRiskLevel =
  (typeof OBSERVATORY_AGENT_RISK_LEVELS)[number];
export type ObservatoryAgentActionClass =
  (typeof OBSERVATORY_AGENT_ACTION_CLASSES)[number];
export type ObservatoryAgentClaimStatus =
  (typeof OBSERVATORY_AGENT_CLAIM_STATUSES)[number];

const AgentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(OBSERVATORY_AGENT_ID_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9-]*$/u);
const WorkItemIdSchema = z.uuid();
const ClaimIdSchema = z.uuid();
const PositiveVersionSchema = z.number().int().positive();
const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(OBSERVATORY_AGENT_IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const LeaseSecondsSchema = z
  .number()
  .int()
  .min(OBSERVATORY_AGENT_LEASE_MIN_SECONDS)
  .max(OBSERVATORY_AGENT_LEASE_MAX_SECONDS);

function isSafeAuthorizedPath(path: string) {
  if (
    !path ||
    path.length > OBSERVATORY_AUTHORIZED_PATH_MAX_LENGTH ||
    path.startsWith("/") ||
    path.startsWith("./") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.includes("//")
  ) {
    return false;
  }
  const segments = path.split("/");
  return segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export function normalizeAuthorizedPaths(paths: readonly string[]): string[] {
  if (
    paths.length < 1 ||
    paths.length > OBSERVATORY_AUTHORIZED_PATH_MAX_COUNT
  ) {
    throw new Error("Authorized paths require one to sixteen entries.");
  }
  const normalized: string[] = [];
  for (const rawPath of paths) {
    const path = rawPath.trim().replace(/\/+$/u, "");
    if (path.length > OBSERVATORY_AUTHORIZED_PATH_MAX_LENGTH) {
      throw new Error("Authorized paths must not exceed 240 characters.");
    }
    if (!isSafeAuthorizedPath(path)) {
      throw new Error(
        "Each authorized path must be a repository-relative POSIX path.",
      );
    }
    if (!normalized.includes(path)) normalized.push(path);
  }
  return normalized;
}

const AuthorizedPathsSchema = z
  .array(z.string())
  .max(OBSERVATORY_AUTHORIZED_PATH_MAX_COUNT)
  .transform((paths, context) => {
    if (paths.length === 0) return [];
    try {
      return normalizeAuthorizedPaths(paths);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? error.message
            : "Authorized paths are invalid.",
      });
      return z.NEVER;
    }
  });

export const AgentClaimPolicyInputSchema = z.strictObject({
  workItemId: WorkItemIdSchema,
  expectedVersion: PositiveVersionSchema,
  riskLevel: z.enum(OBSERVATORY_AGENT_RISK_LEVELS),
  enabled: z.boolean(),
  authorizedPaths: AuthorizedPathsSchema,
  allowedActionClasses: z
    .array(z.enum(OBSERVATORY_AGENT_ACTION_CLASSES))
    .max(OBSERVATORY_AGENT_ACTION_CLASSES.length)
    .transform((values) => [...new Set(values)]),
}).superRefine((value, context) => {
  if (!value.enabled) return;
  if (value.riskLevel !== "low") {
    context.addIssue({
      code: "custom",
      path: ["riskLevel"],
      message: "Only Low-risk work can be enabled for Agent Claim.",
    });
  }
  if (value.authorizedPaths.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["authorizedPaths"],
      message: "Add at least one authorized path.",
    });
  }
  if (value.allowedActionClasses.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["allowedActionClasses"],
      message: "Select at least one allowed action class.",
    });
  }
});

export const AgentClaimRequestSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  workItemId: WorkItemIdSchema.optional(),
  leaseSeconds: LeaseSecondsSchema.default(
    OBSERVATORY_AGENT_LEASE_DEFAULT_SECONDS,
  ),
});

const HttpEvidenceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a valid HTTP or HTTPS evidence URL.");

export const AgentClaimMutationRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("heartbeat"),
    expectedClaimVersion: PositiveVersionSchema,
    leaseSeconds: LeaseSecondsSchema.default(
      OBSERVATORY_AGENT_LEASE_DEFAULT_SECONDS,
    ),
  }),
  z.strictObject({
    action: z.literal("release"),
    expectedClaimVersion: PositiveVersionSchema,
    expectedWorkItemVersion: PositiveVersionSchema,
  }),
  z.strictObject({
    action: z.literal("complete"),
    expectedClaimVersion: PositiveVersionSchema,
    expectedWorkItemVersion: PositiveVersionSchema,
    summary: z
      .string()
      .trim()
      .min(1)
      .max(OBSERVATORY_AGENT_COMPLETION_SUMMARY_MAX_LENGTH),
    evidenceUrl: HttpEvidenceUrlSchema,
  }),
]);

export const AgentClaimCancellationInputSchema = z.strictObject({
  claimId: ClaimIdSchema,
  expectedClaimVersion: PositiveVersionSchema,
  expectedWorkItemVersion: PositiveVersionSchema,
});

export type ObservatoryAgentClaimPolicyInput = z.infer<
  typeof AgentClaimPolicyInputSchema
>;
export type ObservatoryAgentClaimRequest = z.infer<
  typeof AgentClaimRequestSchema
>;
export type ObservatoryAgentClaimMutationRequest = z.infer<
  typeof AgentClaimMutationRequestSchema
>;
export type ObservatoryAgentClaimCancellationInput = z.infer<
  typeof AgentClaimCancellationInputSchema
>;

export const OBSERVATORY_AGENT_ELIGIBILITY_REASONS = [
  "unsupported_type",
  "not_ready",
  "ready_gate_incomplete",
  "risk_not_low",
  "claim_not_approved",
  "authorized_paths_missing",
  "action_classes_missing",
  "active_claim_exists",
] as const;

export type ObservatoryAgentEligibilityReason =
  (typeof OBSERVATORY_AGENT_ELIGIBILITY_REASONS)[number];

export function getAgentClaimEligibility(input: {
  type: ObservatoryWorkItemType;
  state: ObservatoryWorkItemState;
  readyGateComplete: boolean;
  riskLevel: ObservatoryAgentRiskLevel;
  enabled: boolean;
  authorizedPaths: readonly string[];
  allowedActionClasses: readonly ObservatoryAgentActionClass[];
  activeClaim: boolean;
}): {
  eligible: boolean;
  reasons: ObservatoryAgentEligibilityReason[];
} {
  const reasons: ObservatoryAgentEligibilityReason[] = [];
  if (input.type !== "feature" && input.type !== "bug") {
    reasons.push("unsupported_type");
  }
  if (input.state !== "ready") reasons.push("not_ready");
  if (!input.readyGateComplete) reasons.push("ready_gate_incomplete");
  if (input.riskLevel !== "low") reasons.push("risk_not_low");
  if (!input.enabled) reasons.push("claim_not_approved");
  if (input.authorizedPaths.length === 0) {
    reasons.push("authorized_paths_missing");
  }
  if (input.allowedActionClasses.length === 0) {
    reasons.push("action_classes_missing");
  }
  if (input.activeClaim) reasons.push("active_claim_exists");
  return { eligible: reasons.length === 0, reasons };
}

export { AgentIdSchema };
