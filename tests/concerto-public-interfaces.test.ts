import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionBindingSchema, OperationQuerySchema } from '@/lib/observatory/concerto-public-api';
import { createConcertoPublicRepository } from '@/lib/observatory/concerto-public-repository';
import { createConcertoOperationHandler } from '@/app/api/concerto/operations/route';
import { createExecutionBindingHandler } from '@/app/api/concerto/work-items/[id]/execution-binding/route';

const id = '11111111-1111-4111-8111-111111111111';
const mutation = { expectedVersion: 2, expectedProjectRevision: 'a'.repeat(32), planRevision: 1, stageId: 'build', workPackageId: 'wp-1', idempotencyKey: 'intake:tracker', intakeFingerprint: 'b'.repeat(64) };
const config = JSON.stringify([{ agentId: 'plato', tokenSha256: createHash('sha256').update('test-token').digest('hex') }]);
function fixture(owner = 'Plato') {
  const bind = vi.fn().mockResolvedValue({ workItem: { id, state: 'ready', assigned_agent_id: 'plato', project_key: 'shared/test', project_ref: 'shared/test', version: 3, plan_revision: 1, stage_id: 'build', work_package_id: 'wp-1' }, operation: { idempotencyKey: mutation.idempotencyKey } });
  const readOperation = vi.fn().mockResolvedValue(null);
  const get = vi.fn().mockResolvedValue({ id, project_key: 'shared/test', project_ref: 'shared/test' });
  return { bind, readOperation, get, dependencies: { keyConfiguration: () => config, projects: async () => ({ projects: [{ projectKey: 'shared/test', title: 'test', owner, status: 'active' }], agentIds: ['plato'] }), repository: () => ({ bind, readOperation }), items: () => ({ get }) } };
}
function request(body?: unknown, query = '') {
  return new Request(`https://example.test/api/concerto/operations${query}`, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
describe('Concerto public interface contracts', () => {
  it('requires complete exact binding and both concurrency tokens; rejects authority injection', () => {
    expect(ExecutionBindingSchema.safeParse(mutation).success).toBe(true);
    for (const field of ['expectedVersion', 'expectedProjectRevision', 'planRevision', 'stageId', 'workPackageId', 'idempotencyKey']) {
      const incomplete = { ...mutation }; delete incomplete[field as keyof typeof incomplete];
      expect(ExecutionBindingSchema.safeParse(incomplete).success).toBe(false);
    }
    expect(ExecutionBindingSchema.safeParse({ ...mutation, isProjectOwner: true }).success).toBe(false);
    expect(ExecutionBindingSchema.safeParse({ ...mutation, stageId: ' ' }).success).toBe(false);
    expect(ExecutionBindingSchema.safeParse({ ...mutation, intakeFingerprint: 'bad' }).success).toBe(false);
    expect(ExecutionBindingSchema.safeParse({ ...mutation, planRevision: 2147483648 }).success).toBe(false);
    expect(ExecutionBindingSchema.safeParse({ ...mutation, expectedVersion: 2147483648 }).success).toBe(false);
    expect(OperationQuerySchema.safeParse({ projectRef: 'shared/test', operationKey: 'k', operationAgentId: 'aristotle' }).success).toBe(true);
  });
  it('uses current Registry owner and server principal for binding, preserving intake fingerprint', async () => {
    const f = fixture();
    const response = await createExecutionBindingHandler(f.dependencies)(request(mutation), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(f.bind).toHaveBeenCalledWith({ agentId: 'plato', isProjectOwner: true, projectRef: 'shared/test', workItemId: id, mutation });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).workItem).toMatchObject({ planRevision: 1, stageId: 'build', workPackageId: 'wp-1' });
  });
  it('rejects non-owner binding and ignores no caller-provided authority', async () => {
    const f = fixture('Socrates');
    expect((await createExecutionBindingHandler(f.dependencies)(request(mutation), { params: Promise.resolve({ id }) })).status).toBe(403);
    expect(f.bind).not.toHaveBeenCalled();
    expect((await createExecutionBindingHandler(f.dependencies)(request({ ...mutation, agentId: 'socrates' }), { params: Promise.resolve({ id }) })).status).toBe(400);
  });
  it('allows exact actor lookup and current owner selector; non-owner cannot query another actor', async () => {
    const f = fixture();
    const GET = createConcertoOperationHandler(f.dependencies);
    expect((await GET(request(undefined, '?projectRef=shared/test&operationKey=k&operationAgentId=aristotle'))).status).toBe(200);
    expect(f.readOperation).toHaveBeenCalledWith({ agentId: 'plato', isProjectOwner: true, projectRef: 'shared/test', operationKey: 'k', operationAgentId: 'aristotle' });
    const denied = fixture('Socrates');
    expect((await createConcertoOperationHandler(denied.dependencies)(request(undefined, '?projectRef=shared/test&operationKey=k&operationAgentId=aristotle'))).status).toBe(403);
    expect(denied.readOperation).not.toHaveBeenCalled();
  });
  it('fails closed on unknown project, bad auth, unknown query keys and repository errors', async () => {
    const f = fixture(); const GET = createConcertoOperationHandler(f.dependencies);
    expect((await GET(request(undefined, '?projectRef=shared/unknown&operationKey=k'))).status).toBe(404);
    expect((await GET(new Request('https://example.test/api/concerto/operations'))).status).toBe(401);
    expect((await GET(request(undefined, '?projectRef=shared/test&operationKey=k&isProjectOwner=true'))).status).toBe(400);
    f.readOperation.mockRejectedValue(new Error('secret internal DB details'));
    const response = await GET(request(undefined, '?projectRef=shared/test&operationKey=k'));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret');
  });
  it('hashes original request including intake decision identity and forwards concurrency tokens', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { workItem: { id } }, error: null });
    const repo = createConcertoPublicRepository({ rpc });
    const input = { agentId: 'plato', isProjectOwner: true, projectRef: 'shared/test', workItemId: id, mutation };
    await repo.bind(input);
    const args = rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_expected_version: 2, p_expected_project_revision: mutation.expectedProjectRevision, p_intake_fingerprint: mutation.intakeFingerprint, p_agent_id: 'plato', p_is_project_owner: true });
    expect(args.p_request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await repo.bind({ ...input, mutation: { ...mutation, intakeFingerprint: 'c'.repeat(64) } });
    expect(rpc.mock.calls[1][1].p_request_fingerprint).not.toBe(args.p_request_fingerprint);
    await repo.readOperation({ agentId: 'plato', isProjectOwner: false, projectRef: 'shared/test', operationKey: 'key', operationAgentId: 'plato' });
    expect(rpc.mock.calls[2]).toEqual(['read_observatory_agent_work_item_operation', { p_agent_id: 'plato', p_is_project_owner: false, p_project_ref: 'shared/test', p_idempotency_key: 'key', p_operation_agent_id: 'plato' }]);
  });
  it.each(['SNAPSHOT_DRIFT', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'INVALID_TRANSITION', 'FORBIDDEN', 'NOT_FOUND'])('maps database %s without leaking internals', async (code) => {
    const repo = createConcertoPublicRepository({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: `OBSERVATORY_${code}: secret` } }) });
    await expect(repo.bind({ agentId: 'plato', isProjectOwner: true, projectRef: 'shared/test', workItemId: id, mutation })).rejects.toMatchObject({ code });
  });
  it('migration protects atomic snapshot, idempotency replay, history and service-only boundaries', () => {
    const sql = readFileSync('supabase/migrations/20261027000100_concerto_public_execution_interfaces.sql', 'utf8');
    expect(sql).toContain('lock table public.observatory_work_items in share row exclusive mode');
    expect(sql.indexOf('lock table public.observatory_work_items')).toBeLessThan(sql.indexOf('snapshot_revision'));
    expect(sql).toContain('read_observatory_project_work_snapshot(p_project_ref)');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("existing_operation.request_fingerprint is distinct from p_request_fingerprint");
    expect(sql).toContain("current_item.state in ('in_progress', 'review', 'done')");
    expect(sql).toContain("selected_version.status in ('released', 'archived', 'cancelled')");
    expect(sql).toContain('insert into public.observatory_work_item_events');
    expect(sql).toContain('insert into public.observatory_agent_work_item_operations');
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain('from public, anon, authenticated, service_role');
    expect(sql).toContain('to service_role');
    expect(sql).toContain("'intakeFingerprint', p_intake_fingerprint");
  });
});
