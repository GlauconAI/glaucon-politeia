import 'server-only';
import { createHash } from 'node:crypto';
import type { ExecutionBindingInput } from '@/lib/observatory/concerto-public-api';
import type { ObservatoryWorkItemRow } from '@/lib/observatory/repository';
import { AgentWorkItemRepositoryError } from '@/lib/observatory/agent-work-item-repository';

export interface ConcertoOperationReceipt {
  operationId: string;
  operationKind: string;
  actorAgentId: string;
  projectRef: string;
  idempotencyKey: string;
  requestFingerprint: string;
  workItemId: string;
  result: { workItem: ObservatoryWorkItemRow; intakeFingerprint?: string | null; [key: string]: unknown };
  createdAt: string;
}
export interface ConcertoPublicClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
export class ConcertoSnapshotDriftError extends Error {
  readonly code = 'SNAPSHOT_DRIFT';
}
function databaseError(message: string): Error {
  if (message.includes('SNAPSHOT_DRIFT')) return new ConcertoSnapshotDriftError('SNAPSHOT_DRIFT');
  for (const code of ['NOT_FOUND', 'FORBIDDEN', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_TRANSITION'] as const) {
    if (message.includes(code)) return new AgentWorkItemRepositoryError(code);
  }
  if (/BOUNDARY_INVALID|PROJECT_VERSION|VERSION_SCOPE/u.test(message)) return new AgentWorkItemRepositoryError('INVALID_REQUEST');
  return new AgentWorkItemRepositoryError('UNAVAILABLE');
}
export function createConcertoPublicRepository(client: ConcertoPublicClient) {
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw databaseError(error.message);
    return data;
  }
  return {
    async readOperation(input: { agentId: string; isProjectOwner: boolean; projectRef: string; operationKey: string; operationAgentId: string }): Promise<ConcertoOperationReceipt | null> {
      return await call('read_observatory_agent_work_item_operation', {
        p_agent_id: input.agentId, p_is_project_owner: input.isProjectOwner,
        p_project_ref: input.projectRef, p_idempotency_key: input.operationKey,
        p_operation_agent_id: input.operationAgentId,
      }) as ConcertoOperationReceipt | null;
    },
    async bind(input: { agentId: string; isProjectOwner: boolean; projectRef: string; workItemId: string; mutation: ExecutionBindingInput }) {
      const m = input.mutation;
      // Explicit stable field order: the fingerprint binds the full original request,
      // including concurrency tokens and the optional immutable intake decision hash.
      const canonicalRequest = { agentId: input.agentId, projectRef: input.projectRef,
        workItemId: input.workItemId, expectedVersion: m.expectedVersion,
        expectedProjectRevision: m.expectedProjectRevision, planRevision: m.planRevision,
        stageId: m.stageId, workPackageId: m.workPackageId,
        intakeFingerprint: m.intakeFingerprint ?? null };
      return await call('bind_observatory_work_item_execution_as_agent', {
        p_agent_id: input.agentId, p_is_project_owner: input.isProjectOwner,
        p_project_ref: input.projectRef, p_work_item_id: input.workItemId,
        p_expected_version: m.expectedVersion, p_expected_project_revision: m.expectedProjectRevision,
        p_plan_revision: m.planRevision, p_stage_id: m.stageId, p_work_package_id: m.workPackageId,
        p_idempotency_key: m.idempotencyKey, p_intake_fingerprint: m.intakeFingerprint ?? null,
        p_request_fingerprint: createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex'),
      }) as { workItem: ObservatoryWorkItemRow; operation: ConcertoOperationReceipt };
    },
  };
}
