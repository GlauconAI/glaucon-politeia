import "server-only";

import type {
  ObservatoryAgentClaimCancellationInput,
  ObservatoryAgentClaimPolicyInput,
  ObservatoryAgentActionClass,
  ObservatoryAgentClaimStatus,
  ObservatoryAgentRiskLevel,
} from "@/lib/observatory/agent-claims";
import type {
  ObservatoryEvidenceInput,
  ObservatoryEvidenceRemovalInput,
  ObservatoryQuickCaptureInput,
  ObservatoryWorkItemPriority,
  ObservatoryWorkItemState,
  ObservatoryWorkItemTransitionInput,
  ObservatoryWorkItemType,
  ObservatoryWorkItemUpdateInput,
} from "@/lib/observatory/work-items";

export interface ObservatorySnapshotRow {
  id: string;
  schema_version: string;
  generated_at: string;
  source_digest: string;
  payload: unknown;
  summary: unknown;
  collector_version: string;
  status: "success";
  created_at: string;
}

export interface ObservatoryWorkItemRow {
  id: string;
  type: ObservatoryWorkItemType;
  title: string;
  description: string;
  state: ObservatoryWorkItemState;
  priority: ObservatoryWorkItemPriority | null;
  owner_id: string | null;
  acceptance_criteria: string;
  project_ref: string | null;
  milestone_ref: string | null;
  idempotency_key: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  risk_level: ObservatoryAgentRiskLevel;
  agent_claim_enabled: boolean;
  authorized_paths: string[];
  allowed_action_classes: ObservatoryAgentActionClass[];
  claim_approved_by: string | null;
  claim_approved_at: string | null;
}

export interface ObservatoryWorkItemEventRow {
  id: string;
  work_item_id: string;
  event_type:
    | "created"
    | "updated"
    | "state_transitioned"
    | "evidence_added"
    | "evidence_removed"
    | "claim_policy_updated"
    | "claim_started"
    | "claim_renewed"
    | "claim_released"
    | "claim_expired"
    | "claim_completed"
    | "claim_cancelled";
  actor_id: string | null;
  agent_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface ObservatoryWorkItemEvidenceRow {
  id: string;
  work_item_id: string;
  label: string;
  url: string;
  created_by: string | null;
  created_by_agent: string | null;
  created_at: string;
  removed_at: string | null;
  removed_by: string | null;
}

export interface ObservatoryWorkItemClaimRow {
  id: string;
  work_item_id: string;
  agent_id: string;
  status: ObservatoryAgentClaimStatus;
  claim_version: number;
  started_at: string;
  last_heartbeat_at: string;
  lease_expires_at: string;
  ended_at: string | null;
  completion_summary: string | null;
  result_evidence_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ObservatoryDatabaseError {
  code?: string;
  message: string;
}

interface ObservatoryOrderedSnapshotQuery {
  order(
    column: "generated_at" | "created_at",
    options: { ascending: false },
  ): ObservatoryOrderedSnapshotQuery;
  limit(count: 1): {
    maybeSingle(): PromiseLike<{
      data: ObservatorySnapshotRow | null;
      error: ObservatoryDatabaseError | null;
    }>;
  };
}

interface ObservatorySnapshotQuery {
  select(columns: string): {
    eq(column: "status", value: "success"): ObservatoryOrderedSnapshotQuery;
  };
}

interface ObservatoryWorkTrackerQuery
  extends PromiseLike<{
    data: unknown[] | null;
    error: ObservatoryDatabaseError | null;
  }> {
  select(columns: string): ObservatoryWorkTrackerQuery;
  eq(column: string, value: string): ObservatoryWorkTrackerQuery;
  is(column: "removed_at", value: null): ObservatoryWorkTrackerQuery;
  order(
    column: "created_at" | "updated_at",
    options: { ascending: boolean },
  ): ObservatoryWorkTrackerQuery;
  maybeSingle(): PromiseLike<{
    data: unknown | null;
    error: ObservatoryDatabaseError | null;
  }>;
}

export interface ObservatoryRepositoryClient {
  from(table: "observatory_snapshots"): ObservatorySnapshotQuery;
  from(
    table:
      | "observatory_work_items"
      | "observatory_work_item_events"
      | "observatory_work_item_evidence"
      | "observatory_work_item_claims",
  ): ObservatoryWorkTrackerQuery;
  rpc(
    functionName:
      | "create_observatory_work_item"
      | "update_observatory_work_item"
      | "transition_observatory_work_item"
      | "add_observatory_work_item_evidence"
      | "remove_observatory_work_item_evidence"
      | "configure_observatory_agent_claim_policy"
      | "cancel_observatory_work_item_claim",
    arguments_: Record<string, unknown>,
  ): PromiseLike<{
    data: ObservatoryWorkItemRow | null;
    error: ObservatoryDatabaseError | null;
  }>;
}

export type ObservatoryRepositoryErrorCode =
  | "FORBIDDEN"
  | "SNAPSHOT_READ_FAILED"
  | "WORK_ITEM_CREATE_FAILED"
  | "WORK_ITEM_READ_FAILED"
  | "WORK_ITEM_UPDATE_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "VERSION_CONFLICT"
  | "WORK_ITEM_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "READY_GATE_FAILED"
  | "EVIDENCE_NOT_FOUND"
  | "CLAIM_ACTIVE"
  | "CLAIM_POLICY_INVALID"
  | "CLAIM_VERSION_CONFLICT";

export class ObservatoryRepositoryError extends Error {
  readonly code: ObservatoryRepositoryErrorCode;

  constructor(code: ObservatoryRepositoryErrorCode, message: string) {
    super(message);
    this.name = "ObservatoryRepositoryError";
    this.code = code;
  }
}

function mutationError(
  operation: "create" | "update",
  error: ObservatoryDatabaseError,
) {
  const marker = error.message.toUpperCase();
  if (error.code === "42501") {
    return new ObservatoryRepositoryError(
      "FORBIDDEN",
      "Administrator access is required.",
    );
  }
  if (marker.includes("OBSERVATORY_IDEMPOTENCY_CONFLICT")) {
    return new ObservatoryRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for different content.",
    );
  }
  if (marker.includes("OBSERVATORY_CLAIM_VERSION_CONFLICT")) {
    return new ObservatoryRepositoryError(
      "CLAIM_VERSION_CONFLICT",
      "The agent claim changed after it was loaded.",
    );
  }
  if (
    error.code === "40001" ||
    marker.includes("OBSERVATORY_VERSION_CONFLICT")
  ) {
    return new ObservatoryRepositoryError(
      "VERSION_CONFLICT",
      "The work item changed after it was loaded.",
    );
  }
  if (marker.includes("OBSERVATORY_INVALID_TRANSITION")) {
    return new ObservatoryRepositoryError(
      "INVALID_TRANSITION",
      "That state transition is not allowed.",
    );
  }
  if (marker.includes("OBSERVATORY_READY_GATE_FAILED")) {
    return new ObservatoryRepositoryError(
      "READY_GATE_FAILED",
      "Acceptance criteria, priority, and owner are required.",
    );
  }
  if (marker.includes("OBSERVATORY_EVIDENCE_NOT_FOUND")) {
    return new ObservatoryRepositoryError(
      "EVIDENCE_NOT_FOUND",
      "The evidence link is no longer active.",
    );
  }
  if (
    error.code === "P0002" ||
    marker.includes("OBSERVATORY_WORK_ITEM_NOT_FOUND")
  ) {
    return new ObservatoryRepositoryError(
      "WORK_ITEM_NOT_FOUND",
      "The work item no longer exists.",
    );
  }
  if (marker.includes("OBSERVATORY_CLAIM_ACTIVE")) {
    return new ObservatoryRepositoryError(
      "CLAIM_ACTIVE",
      "The work item has an active agent claim.",
    );
  }
  if (marker.includes("OBSERVATORY_CLAIM_POLICY_INVALID")) {
    return new ObservatoryRepositoryError(
      "CLAIM_POLICY_INVALID",
      "The Agent Claim policy is invalid.",
    );
  }

  return operation === "create"
    ? new ObservatoryRepositoryError(
        "WORK_ITEM_CREATE_FAILED",
        "The work item could not be captured.",
      )
    : new ObservatoryRepositoryError(
        "WORK_ITEM_UPDATE_FAILED",
        "The work item could not be updated.",
      );
}

export function createObservatoryRepository(
  client: ObservatoryRepositoryClient,
) {
  async function readRows<T>(
    query: PromiseLike<{
      data: unknown[] | null;
      error: ObservatoryDatabaseError | null;
    }>,
  ): Promise<T[]> {
    const { data, error } = await query;
    if (error) {
      throw new ObservatoryRepositoryError(
        error.code === "42501" ? "FORBIDDEN" : "WORK_ITEM_READ_FAILED",
        error.code === "42501"
          ? "Administrator access is required."
          : "Work Tracker data could not be loaded.",
      );
    }
    return (data ?? []) as T[];
  }

  return {
    async getLatestSuccessfulSnapshot(): Promise<ObservatorySnapshotRow | null> {
      const { data, error } = await client
        .from("observatory_snapshots")
        .select(
          "id,schema_version,generated_at,source_digest,payload,summary,collector_version,status,created_at",
        )
        .eq("status", "success")
        .order("generated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        if (error.code === "42501") {
          throw new ObservatoryRepositoryError(
            "FORBIDDEN",
            "Administrator access is required.",
          );
        }
        throw new ObservatoryRepositoryError(
          "SNAPSHOT_READ_FAILED",
          "The latest Observatory snapshot could not be loaded.",
        );
      }

      return data;
    },

    async listWorkItems(): Promise<ObservatoryWorkItemRow[]> {
      return readRows<ObservatoryWorkItemRow>(
        client
          .from("observatory_work_items")
          .select(
            "id,type,title,description,state,priority,owner_id,acceptance_criteria,project_ref,milestone_ref,idempotency_key,version,created_by,created_at,updated_at,risk_level,agent_claim_enabled,authorized_paths,allowed_action_classes,claim_approved_by,claim_approved_at",
          )
          .order("updated_at", { ascending: false }),
      );
    },

    async getWorkItem(id: string): Promise<ObservatoryWorkItemRow | null> {
      const { data, error } = await client
        .from("observatory_work_items")
        .select(
          "id,type,title,description,state,priority,owner_id,acceptance_criteria,project_ref,milestone_ref,idempotency_key,version,created_by,created_at,updated_at,risk_level,agent_claim_enabled,authorized_paths,allowed_action_classes,claim_approved_by,claim_approved_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) {
        throw new ObservatoryRepositoryError(
          error.code === "42501" ? "FORBIDDEN" : "WORK_ITEM_READ_FAILED",
          error.code === "42501"
            ? "Administrator access is required."
            : "The work item could not be loaded.",
        );
      }
      return data as ObservatoryWorkItemRow | null;
    },

    async listWorkItemEvents(
      workItemId: string,
    ): Promise<ObservatoryWorkItemEventRow[]> {
      return readRows<ObservatoryWorkItemEventRow>(
        client
          .from("observatory_work_item_events")
          .select(
            "id,work_item_id,event_type,actor_id,agent_id,data,created_at",
          )
          .eq("work_item_id", workItemId)
          .order("created_at", { ascending: true }),
      );
    },

    async listWorkItemEvidence(
      workItemId: string,
    ): Promise<ObservatoryWorkItemEvidenceRow[]> {
      return readRows<ObservatoryWorkItemEvidenceRow>(
        client
          .from("observatory_work_item_evidence")
          .select(
            "id,work_item_id,label,url,created_by,created_by_agent,created_at,removed_at,removed_by",
          )
          .eq("work_item_id", workItemId)
          .is("removed_at", null)
          .order("created_at", { ascending: true }),
      );
    },

    async listWorkItemClaims(
      workItemId: string,
    ): Promise<ObservatoryWorkItemClaimRow[]> {
      return readRows<ObservatoryWorkItemClaimRow>(
        client
          .from("observatory_work_item_claims")
          .select(
            "id,work_item_id,agent_id,status,claim_version,started_at,last_heartbeat_at,lease_expires_at,ended_at,completion_summary,result_evidence_url,created_at,updated_at",
          )
          .eq("work_item_id", workItemId)
          .order("created_at", { ascending: true }),
      );
    },

    async createQuickCapture(
      input: ObservatoryQuickCaptureInput,
    ): Promise<ObservatoryWorkItemRow> {
      const { data, error } = await client.rpc(
        "create_observatory_work_item",
        {
          p_type: input.type,
          p_title: input.title,
          p_description: input.description,
          p_idempotency_key: input.idempotencyKey,
        },
      );

      if (error) {
        throw mutationError("create", error);
      }
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_CREATE_FAILED",
          "The work item could not be captured.",
        );
      }

      return data;
    },

    async updateWorkItem(
      input: ObservatoryWorkItemUpdateInput,
    ): Promise<ObservatoryWorkItemRow> {
      const { data, error } = await client.rpc(
        "update_observatory_work_item",
        {
          p_work_item_id: input.workItemId,
          p_expected_version: input.expectedVersion,
          p_type: input.type,
          p_title: input.title,
          p_description: input.description,
          p_acceptance_criteria: input.acceptanceCriteria,
          p_priority: input.priority,
          p_owner_id: input.ownerId,
          p_project_ref: input.projectRef,
          p_milestone_ref: input.milestoneRef,
        },
      );

      if (error) {
        throw mutationError("update", error);
      }
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_UPDATE_FAILED",
          "The work item could not be updated.",
        );
      }

      return data;
    },

    async transitionWorkItem(
      input: ObservatoryWorkItemTransitionInput,
    ): Promise<ObservatoryWorkItemRow> {
      const { data, error } = await client.rpc(
        "transition_observatory_work_item",
        {
          p_work_item_id: input.workItemId,
          p_expected_version: input.expectedVersion,
          p_target_state: input.targetState,
        },
      );
      if (error) throw mutationError("update", error);
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_UPDATE_FAILED",
          "The work item could not be moved.",
        );
      }
      return data;
    },

    async addWorkItemEvidence(
      input: ObservatoryEvidenceInput,
    ): Promise<ObservatoryWorkItemRow> {
      const { data, error } = await client.rpc(
        "add_observatory_work_item_evidence",
        {
          p_work_item_id: input.workItemId,
          p_expected_version: input.expectedVersion,
          p_label: input.label,
          p_url: input.url,
        },
      );
      if (error) throw mutationError("update", error);
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_UPDATE_FAILED",
          "The evidence link could not be added.",
        );
      }
      return data;
    },

    async removeWorkItemEvidence(
      input: ObservatoryEvidenceRemovalInput,
    ): Promise<ObservatoryWorkItemRow> {
      const { data, error } = await client.rpc(
        "remove_observatory_work_item_evidence",
        {
          p_work_item_id: input.workItemId,
          p_evidence_id: input.evidenceId,
          p_expected_version: input.expectedVersion,
        },
      );
      if (error) throw mutationError("update", error);
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_UPDATE_FAILED",
          "The evidence link could not be removed.",
        );
      }
      return data;
    },

    async configureAgentClaimPolicy(
      input: ObservatoryAgentClaimPolicyInput,
    ): Promise<ObservatoryWorkItemRow> {
      const { data, error } = await client.rpc(
        "configure_observatory_agent_claim_policy",
        {
          p_work_item_id: input.workItemId,
          p_expected_version: input.expectedVersion,
          p_risk_level: input.riskLevel,
          p_enabled: input.enabled,
          p_authorized_paths: input.authorizedPaths,
          p_allowed_action_classes: input.allowedActionClasses,
        },
      );
      if (error) throw mutationError("update", error);
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_UPDATE_FAILED",
          "The Agent Claim policy could not be updated.",
        );
      }
      return data;
    },

    async cancelAgentClaim(
      input: ObservatoryAgentClaimCancellationInput,
    ): Promise<unknown> {
      const { data, error } = await client.rpc(
        "cancel_observatory_work_item_claim",
        {
          p_claim_id: input.claimId,
          p_expected_claim_version: input.expectedClaimVersion,
          p_expected_work_item_version: input.expectedWorkItemVersion,
        },
      );
      if (error) throw mutationError("update", error);
      if (!data) {
        throw new ObservatoryRepositoryError(
          "WORK_ITEM_UPDATE_FAILED",
          "The agent claim could not be cancelled.",
        );
      }
      return data;
    },
  };
}
