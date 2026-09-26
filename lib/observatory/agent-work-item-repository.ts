import "server-only";

import { createHash } from "node:crypto";

import type {
  AgentWorkItemCreateInput,
  AgentWorkItemMutationInput,
} from "@/lib/observatory/agent-work-item-api";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";

const WORK_ITEM_COLUMNS =
  "id,type,title,description,state,priority,owner_id,assigned_agent_id,acceptance_criteria,project_ref,milestone_ref,due_on,project_key,project_version_id,version_binding_kind,plan_revision,stage_id,work_package_id,idempotency_key,version,created_at,updated_at";

type DatabaseError = { code?: string; message: string };

export interface AgentWorkItemRepositoryClient {
  from(table: "observatory_work_items"): {
    select(columns: string): {
      order(column: string, options: { ascending: boolean }): {
        limit(count: number): PromiseLike<{
          data: unknown[] | null;
          error: DatabaseError | null;
        }>;
      };
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{
          data: unknown | null;
          error: DatabaseError | null;
        }>;
      };
    };
  };
  rpc(
    functionName:
      | "create_observatory_work_item_as_agent"
      | "execute_observatory_agent_work_item_command",
    arguments_: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: DatabaseError | null }>;
}

export type AgentWorkItemRepositoryErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "READY_GATE_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_REQUEST"
  | "UNAVAILABLE";

export class AgentWorkItemRepositoryError extends Error {
  readonly code: AgentWorkItemRepositoryErrorCode;

  constructor(code: AgentWorkItemRepositoryErrorCode) {
    super(code);
    this.name = "AgentWorkItemRepositoryError";
    this.code = code;
  }
}

function mapError(error: DatabaseError): AgentWorkItemRepositoryError {
  const message = error.message ?? "";
  if (/NOT_FOUND/u.test(message)) return new AgentWorkItemRepositoryError("NOT_FOUND");
  if (/FORBIDDEN/u.test(message)) return new AgentWorkItemRepositoryError("FORBIDDEN");
  if (/VERSION_CONFLICT/u.test(message)) return new AgentWorkItemRepositoryError("VERSION_CONFLICT");
  if (/INVALID_TRANSITION/u.test(message)) return new AgentWorkItemRepositoryError("INVALID_TRANSITION");
  if (/READY_GATE_FAILED/u.test(message)) return new AgentWorkItemRepositoryError("READY_GATE_FAILED");
  if (/IDEMPOTENCY_CONFLICT/u.test(message)) return new AgentWorkItemRepositoryError("IDEMPOTENCY_CONFLICT");
  if (
    /BOUNDARY_INVALID|COMMAND_[A-Z_]+_INVALID|ASSIGNED_AGENT_INVALID|PROJECT_VERSION/iu.test(
      message,
    )
  ) {
    return new AgentWorkItemRepositoryError("INVALID_REQUEST");
  }
  return new AgentWorkItemRepositoryError("UNAVAILABLE");
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createAgentWorkItemRepository(
  client: AgentWorkItemRepositoryClient,
) {
  return {
    async listVisible(input: {
      agentId: string;
      ownerProjectRefs: string[];
      state?: string;
      projectRef?: string;
      limit: number;
    }): Promise<ObservatoryWorkItemRow[]> {
      const { data, error } = await client
        .from("observatory_work_items")
        .select(WORK_ITEM_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw mapError(error);
      return ((data ?? []) as ObservatoryWorkItemRow[])
        .filter(
          (item) =>
            item.assigned_agent_id === input.agentId ||
            input.ownerProjectRefs.includes(
              item.project_key ?? item.project_ref ?? "",
            ),
        )
        .filter((item) => !input.state || item.state === input.state)
        .filter(
          (item) =>
            !input.projectRef ||
            (item.project_key ?? item.project_ref) === input.projectRef,
        )
        .slice(0, input.limit);
    },

    async get(id: string): Promise<ObservatoryWorkItemRow | null> {
      const { data, error } = await client
        .from("observatory_work_items")
        .select(WORK_ITEM_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw mapError(error);
      return (data as ObservatoryWorkItemRow | null) ?? null;
    },

    async create(input: AgentWorkItemCreateInput & { agentId: string }) {
      const request = {
        ...input,
        agentId: input.agentId,
      };
      const { data, error } = await client.rpc(
        "create_observatory_work_item_as_agent",
        {
          p_agent_id: input.agentId,
          p_type: input.type,
          p_title: input.title,
          p_description: input.description,
          p_project_ref: input.projectRef,
          p_project_version_id: input.projectVersionId,
          p_version_binding_kind: input.versionBindingKind,
          p_idempotency_key: input.idempotencyKey,
          p_request_fingerprint: fingerprint(request),
        },
      );
      if (error) throw mapError(error);
      return data as { workItem: ObservatoryWorkItemRow };
    },

    async execute(input: {
      agentId: string;
      isProjectOwner: boolean;
      projectRef: string;
      workItemId: string;
      mutation: AgentWorkItemMutationInput;
    }) {
      const { idempotencyKey, expectedVersion, action, ...payload } =
        input.mutation;
      const request = {
        agentId: input.agentId,
        projectRef: input.projectRef,
        workItemId: input.workItemId,
        expectedVersion,
        action,
        payload,
      };
      const { data, error } = await client.rpc(
        "execute_observatory_agent_work_item_command",
        {
          p_agent_id: input.agentId,
          p_is_project_owner: input.isProjectOwner,
          p_project_ref: input.projectRef,
          p_work_item_id: input.workItemId,
          p_expected_version: expectedVersion,
          p_action: action,
          p_payload: payload,
          p_idempotency_key: idempotencyKey,
          p_request_fingerprint: fingerprint(request),
        },
      );
      if (error) throw mapError(error);
      return data as {
        workItem: ObservatoryWorkItemRow;
        evidence: unknown | null;
      };
    },
  };
}
