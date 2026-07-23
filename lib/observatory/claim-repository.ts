import "server-only";

import { z } from "zod";

import {
  OBSERVATORY_AGENT_ACTION_CLASSES,
  OBSERVATORY_AGENT_CLAIM_STATUSES,
  type ObservatoryAgentClaimRequest,
  type ObservatoryAgentClaimStatus,
} from "@/lib/observatory/agent-claims";
import {
  OBSERVATORY_WORK_ITEM_STATES,
  OBSERVATORY_WORK_ITEM_TYPES,
  type ObservatoryWorkItemState,
  type ObservatoryWorkItemType,
} from "@/lib/observatory/work-items";

interface AgentClaimDatabaseError {
  code?: string;
  message: string;
}

export interface AgentClaimRepositoryClient {
  rpc(
    functionName:
      | "claim_observatory_work_item"
      | "renew_observatory_work_item_claim"
      | "release_observatory_work_item_claim"
      | "complete_observatory_work_item_claim"
      | "sweep_observatory_work_item_claims",
    arguments_: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: AgentClaimDatabaseError | null;
  }>;
}

export type AgentClaimRepositoryErrorCode =
  | "FORBIDDEN"
  | "NO_ELIGIBLE_WORK"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "LEASE_EXPIRED"
  | "OWNER_MISMATCH"
  | "INVALID_BOUNDARY"
  | "DEPENDENCY_FAILED";

export class AgentClaimRepositoryError extends Error {
  readonly code: AgentClaimRepositoryErrorCode;

  constructor(code: AgentClaimRepositoryErrorCode, message: string) {
    super(message);
    this.name = "AgentClaimRepositoryError";
    this.code = code;
  }
}

const ClaimRowSchema = z.object({
  id: z.uuid(),
  work_item_id: z.uuid(),
  agent_id: z.string().min(1).max(80),
  status: z.enum(OBSERVATORY_AGENT_CLAIM_STATUSES),
  claim_version: z.number().int().positive(),
  started_at: z.string().min(1),
  last_heartbeat_at: z.string().min(1),
  lease_expires_at: z.string().min(1),
  ended_at: z.string().min(1).nullable(),
});

const WorkItemBoundarySchema = z.object({
  id: z.uuid(),
  type: z.enum(OBSERVATORY_WORK_ITEM_TYPES),
  title: z.string(),
  description: z.string(),
  state: z.enum(OBSERVATORY_WORK_ITEM_STATES),
  version: z.number().int().positive(),
  authorized_paths: z.array(z.string()).max(16),
  allowed_action_classes: z
    .array(z.enum(OBSERVATORY_AGENT_ACTION_CLASSES))
    .max(3),
});

const ClaimResultSchema = z.object({
  claim: ClaimRowSchema,
  work_item: WorkItemBoundarySchema,
});

export interface AgentClaimProjection {
  id: string;
  workItemId: string;
  agentId: string;
  status: ObservatoryAgentClaimStatus;
  claimVersion: number;
  startedAt: string;
  lastHeartbeatAt: string;
  leaseExpiresAt: string;
  endedAt: string | null;
}

export interface AgentClaimWorkItemProjection {
  id: string;
  type: ObservatoryWorkItemType;
  title: string;
  description: string;
  state: ObservatoryWorkItemState;
  version: number;
  authorizedPaths: string[];
  allowedActionClasses: string[];
}

export interface AgentClaimResult {
  claim: AgentClaimProjection;
  workItem: AgentClaimWorkItemProjection;
}

function mapClaim(row: z.infer<typeof ClaimRowSchema>): AgentClaimProjection {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    agentId: row.agent_id,
    status: row.status,
    claimVersion: row.claim_version,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    leaseExpiresAt: row.lease_expires_at,
    endedAt: row.ended_at,
  };
}

function mapResult(value: unknown): AgentClaimResult {
  const result = ClaimResultSchema.parse(value);
  return {
    claim: mapClaim(result.claim),
    workItem: {
      id: result.work_item.id,
      type: result.work_item.type,
      title: result.work_item.title,
      description: result.work_item.description,
      state: result.work_item.state,
      version: result.work_item.version,
      authorizedPaths: result.work_item.authorized_paths,
      allowedActionClasses: result.work_item.allowed_action_classes,
    },
  };
}

function stableError(error: AgentClaimDatabaseError) {
  const message = error.message.toLowerCase();
  if (message.includes("observatory_claim_owner_mismatch")) {
    return new AgentClaimRepositoryError(
      "OWNER_MISMATCH",
      "The claim belongs to another agent.",
    );
  }
  if (
    error.code === "P0002" ||
    message.includes("observatory_claim_not_eligible")
  ) {
    return new AgentClaimRepositoryError(
      "NO_ELIGIBLE_WORK",
      "No eligible work item is available.",
    );
  }
  if (
    error.code === "40001" ||
    message.includes("observatory_claim_version_conflict") ||
    message.includes("observatory_version_conflict")
  ) {
    return new AgentClaimRepositoryError(
      "VERSION_CONFLICT",
      "The claim or work item changed after it was loaded.",
    );
  }
  if (message.includes("observatory_claim_idempotency_conflict")) {
    return new AgentClaimRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for another request.",
    );
  }
  if (message.includes("observatory_claim_expired")) {
    return new AgentClaimRepositoryError(
      "LEASE_EXPIRED",
      "The claim lease is no longer active.",
    );
  }
  if (
    error.code === "22023" ||
    message.includes("observatory_claim_boundary_invalid")
  ) {
    return new AgentClaimRepositoryError(
      "INVALID_BOUNDARY",
      "The claim request is outside the allowed boundary.",
    );
  }
  if (error.code === "42501") {
    return new AgentClaimRepositoryError(
      "FORBIDDEN",
      "Agent Claim authorization failed.",
    );
  }
  return new AgentClaimRepositoryError(
    "DEPENDENCY_FAILED",
    "Agent Claim is temporarily unavailable.",
  );
}

async function call(
  operation: () => PromiseLike<{
    data: unknown;
    error: AgentClaimDatabaseError | null;
  }>,
) {
  const { data, error } = await operation();
  if (error) throw stableError(error);
  return data;
}

function parseResult(data: unknown) {
  try {
    return mapResult(data);
  } catch {
    throw new AgentClaimRepositoryError(
      "DEPENDENCY_FAILED",
      "Agent Claim is temporarily unavailable.",
    );
  }
}

export function createAgentClaimRepository(
  client: AgentClaimRepositoryClient,
) {
  return {
    async claim(
      input: ObservatoryAgentClaimRequest & { agentId: string },
    ): Promise<AgentClaimResult> {
      const data = await call(() =>
        client.rpc("claim_observatory_work_item", {
          p_agent_id: input.agentId,
          p_idempotency_key: input.idempotencyKey,
          p_work_item_id: input.workItemId ?? null,
          p_lease_seconds: input.leaseSeconds,
        }),
      );
      return parseResult(data);
    },

    async heartbeat(input: {
      claimId: string;
      agentId: string;
      expectedClaimVersion: number;
      leaseSeconds: number;
    }): Promise<AgentClaimProjection> {
      const data = await call(() =>
        client.rpc("renew_observatory_work_item_claim", {
          p_claim_id: input.claimId,
          p_agent_id: input.agentId,
          p_expected_claim_version: input.expectedClaimVersion,
          p_lease_seconds: input.leaseSeconds,
        }),
      );
      try {
        return mapClaim(ClaimRowSchema.parse(data));
      } catch {
        throw new AgentClaimRepositoryError(
          "DEPENDENCY_FAILED",
          "Agent Claim is temporarily unavailable.",
        );
      }
    },

    async release(input: {
      claimId: string;
      agentId: string;
      expectedClaimVersion: number;
      expectedWorkItemVersion: number;
    }): Promise<AgentClaimResult> {
      const data = await call(() =>
        client.rpc("release_observatory_work_item_claim", {
          p_claim_id: input.claimId,
          p_agent_id: input.agentId,
          p_expected_claim_version: input.expectedClaimVersion,
          p_expected_work_item_version: input.expectedWorkItemVersion,
        }),
      );
      return parseResult(data);
    },

    async complete(input: {
      claimId: string;
      agentId: string;
      expectedClaimVersion: number;
      expectedWorkItemVersion: number;
      summary: string;
      evidenceUrl: string;
    }): Promise<AgentClaimResult> {
      const data = await call(() =>
        client.rpc("complete_observatory_work_item_claim", {
          p_claim_id: input.claimId,
          p_agent_id: input.agentId,
          p_expected_claim_version: input.expectedClaimVersion,
          p_expected_work_item_version: input.expectedWorkItemVersion,
          p_summary: input.summary,
          p_evidence_url: input.evidenceUrl,
        }),
      );
      return parseResult(data);
    },

    async sweep(): Promise<number> {
      const data = await call(() =>
        client.rpc("sweep_observatory_work_item_claims", {}),
      );
      if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
        throw new AgentClaimRepositoryError(
          "DEPENDENCY_FAILED",
          "Agent Claim is temporarily unavailable.",
        );
      }
      return data;
    },
  };
}
