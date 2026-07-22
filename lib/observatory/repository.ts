import "server-only";

import type {
  ObservatoryQuickCaptureInput,
  ObservatoryWorkItemType,
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
  state: "inbox";
  idempotency_key: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ObservatoryWorkItemUpdateInput {
  workItemId: string;
  expectedVersion: number;
  type: ObservatoryWorkItemType;
  title: string;
  description: string;
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

export interface ObservatoryRepositoryClient {
  from(table: "observatory_snapshots"): ObservatorySnapshotQuery;
  rpc(
    functionName:
      | "create_observatory_work_item"
      | "update_observatory_work_item",
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
  | "WORK_ITEM_UPDATE_FAILED"
  | "IDEMPOTENCY_CONFLICT"
  | "VERSION_CONFLICT"
  | "WORK_ITEM_NOT_FOUND";

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
  if (error.code === "42501") {
    return new ObservatoryRepositoryError(
      "FORBIDDEN",
      "Administrator access is required.",
    );
  }
  if (error.message.includes("OBSERVATORY_IDEMPOTENCY_CONFLICT")) {
    return new ObservatoryRepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for different content.",
    );
  }
  if (
    error.code === "40001" ||
    error.message.includes("OBSERVATORY_VERSION_CONFLICT")
  ) {
    return new ObservatoryRepositoryError(
      "VERSION_CONFLICT",
      "The work item changed after it was loaded.",
    );
  }
  if (
    error.code === "P0002" ||
    error.message.includes("OBSERVATORY_WORK_ITEM_NOT_FOUND")
  ) {
    return new ObservatoryRepositoryError(
      "WORK_ITEM_NOT_FOUND",
      "The work item no longer exists.",
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
  };
}
