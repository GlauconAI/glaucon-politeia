import { z } from 'zod';
import { normalizeRegistryOwnerAgentId } from '@/lib/observatory/agent-work-item-api';

const projectKey = z.string().min(3).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const agentId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const operationKey = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
export const AssociationPairSchema = z.strictObject({ sourceProjectKey: projectKey, targetProjectKey: projectKey });
export const AssociationInputSchema = AssociationPairSchema.extend({
  expectedRevision: z.string().regex(/^[a-f0-9]{32}$/u), idempotencyKey: operationKey,
});
const approvalSchema = AssociationPairSchema.extend({
  ownerAgentId: agentId, catalogOperationId: operationKey, catalogReceiptSha256: z.string().regex(/^[a-f0-9]{64}$/u),
}).refine((p) => p.sourceProjectKey !== p.targetProjectKey);
export type AssociationApproval = z.infer<typeof approvalSchema>;
export type AssociationInput = z.infer<typeof AssociationInputSchema>;
export class ProjectAssociationError extends Error {
  constructor(readonly code: 'UNAVAILABLE' | 'FORBIDDEN' | 'INVALID_REQUEST' | 'SNAPSHOT_DRIFT' | 'ASSOCIATION_CONFLICT' | 'IDEMPOTENCY_CONFLICT') { super(code); }
}
export function parseAssociationApprovals(raw: string | undefined): AssociationApproval[] {
  try {
    const approvals = z.array(approvalSchema).min(1).max(128).parse(JSON.parse(raw ?? ''));
    const keys = approvals.flatMap((p) => [p.sourceProjectKey, p.targetProjectKey]);
    // V1 permits disjoint one-to-one scopes, never chains, merges or ambiguous grants.
    if (new Set(keys).size !== keys.length) throw new Error('Overlapping approvals');
    return approvals;
  } catch { throw new ProjectAssociationError('UNAVAILABLE'); }
}
export function authorizeAssociation(actor: string, source: string, target: string, approvals: AssociationApproval[], projects: Array<{projectKey: string; owner: string; status: string}>): AssociationApproval {
  const approval = approvals.find((p) => p.sourceProjectKey === source && p.targetProjectKey === target);
  const targets = projects.filter((p) => p.projectKey === target);
  const sources = projects.filter((p) => p.projectKey === source);
  if (!approval || approval.ownerAgentId !== actor || targets.length !== 1 || sources.length > 1 ||
      ['retired', 'archived', 'cancelled'].includes(targets[0].status.toLowerCase()) ||
      normalizeRegistryOwnerAgentId(targets[0].owner) !== actor ||
      sources.some((p) => normalizeRegistryOwnerAgentId(p.owner) !== actor)) {
    throw new ProjectAssociationError('FORBIDDEN');
  }
  return approval;
}

const associationSchema = z.strictObject({
  source_project_key: projectKey, target_project_key: projectKey, actor_agent_id: agentId,
  catalog_operation_id: operationKey, catalog_receipt_sha256: z.string().regex(/^[a-f0-9]{64}$/u), created_at: z.iso.datetime({ offset: true }),
});
const recordBase = z.object({ id: z.uuid(), original_project_key: projectKey, effective_project_key: projectKey });
const versionSchema = recordBase.extend({ project_key: projectKey, row_version: z.number().int().positive(), status: z.string().min(1) }).passthrough();
const itemSchema = recordBase.extend({ project_key: projectKey.nullable(), project_ref: z.string().nullable().optional(), project_version_id: z.uuid().nullable(), version: z.number().int().positive(), state: z.string().min(1) }).passthrough();
const snapshotSchema = z.strictObject({
  schema_version: z.literal('concerto-project-association-snapshot-v1'),
  source_project_key: projectKey, target_project_key: projectKey,
  snapshot_revision: z.string().regex(/^[a-f0-9]{32}$/u), snapshot_as_of: z.iso.datetime({ offset: true }),
  complete: z.literal(true), next_cursor: z.null(), page_count: z.literal(1),
  version_count: z.number().int().nonnegative(), item_count: z.number().int().nonnegative(),
  association: associationSchema.nullable(), versions: z.array(versionSchema), items: z.array(itemSchema),
});
export type AssociationSnapshot = z.infer<typeof snapshotSchema>;
export function validateAssociationSnapshot(raw: unknown, source: string, target: string): AssociationSnapshot {
  const value = snapshotSchema.parse(raw);
  if (source === target || value.source_project_key !== source || value.target_project_key !== target ||
      value.version_count !== value.versions.length || value.item_count !== value.items.length ||
      new Set(value.versions.map((r) => r.id)).size !== value.version_count ||
      new Set(value.items.map((r) => r.id)).size !== value.item_count ||
      (value.association && (value.association.source_project_key !== source || value.association.target_project_key !== target))) throw new Error('Invalid association snapshot');
  const versions = new Set(value.versions.map((r) => r.id));
  for (const row of [...value.versions, ...value.items]) {
    if (![source, target].includes(row.original_project_key) || row.effective_project_key !== (value.association ? target : row.original_project_key)) throw new Error('Foreign association scope');
    const originalKey = row.project_key ?? ('project_ref' in row ? row.project_ref : null);
    if (originalKey !== row.original_project_key) throw new Error('Original association mismatch');
  }
  if (value.items.some((r) => r.project_version_id && !versions.has(r.project_version_id))) throw new Error('Missing version in complete snapshot');
  return value;
}
