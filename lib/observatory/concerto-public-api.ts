import { z } from 'zod';

const ProjectRef = z.string().max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const AgentId = z.string().max(80).regex(/^[a-z][a-z0-9-]*$/u);
const Key = z.string().max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
export const OperationQuerySchema = z.strictObject({
  projectRef: ProjectRef,
  operationKey: Key,
  operationAgentId: AgentId.optional(),
});
export const ExecutionBindingSchema = z.strictObject({
  expectedVersion: z.number().int().positive().max(2147483647),
  expectedProjectRevision: z.string().regex(/^[a-f0-9]{32}$/u),
  planRevision: z.number().int().nonnegative().max(2147483647),
  stageId: z.string().trim().min(1).max(128),
  workPackageId: z.string().trim().min(1).max(128),
  idempotencyKey: Key,
  intakeFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
});
export type ExecutionBindingInput = z.infer<typeof ExecutionBindingSchema>;
