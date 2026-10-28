import { z } from 'zod';
import { ExecutionBindingSchema } from '@/lib/observatory/concerto-public-api';
import { authenticatePublic, defaultConcertoPublicDependencies, publicApiError, type ConcertoPublicDependencies } from '@/lib/observatory/concerto-public-route';
import { normalizeRegistryOwnerAgentId } from '@/lib/observatory/agent-work-item-api';
import { jsonResponse, readBoundedJson } from '@/app/api/dashboard/work-items/claims/route';
import { projectItem } from '@/app/api/concerto/work-items/route';

export function createExecutionBindingHandler(dependencies: ConcertoPublicDependencies) {
  return async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const authenticated = authenticatePublic(request, dependencies);
    if (authenticated.response) return authenticated.response;
    const id = z.uuid().safeParse((await context.params).id);
    const mutation = ExecutionBindingSchema.safeParse(await readBoundedJson(request));
    if (!id.success || !mutation.success) return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
    try {
      const [item, registry] = await Promise.all([dependencies.items().get(id.data), dependencies.projects()]);
      if (!item) return jsonResponse({ error: 'NOT_FOUND' }, 404);
      const project = registry.projects.find((p) => p.projectKey === (item.project_key ?? item.project_ref));
      const agentId = authenticated.principal!.agentId;
      if (!project || normalizeRegistryOwnerAgentId(project.owner) !== agentId || ['retired', 'archived'].includes(project.status)) return jsonResponse({ error: 'FORBIDDEN' }, 403);
      const result = await dependencies.repository().bind({ agentId, isProjectOwner: true, projectRef: project.projectKey, workItemId: id.data, mutation: mutation.data });
      return jsonResponse({ workItem: projectItem(result.workItem, agentId, agentId), operation: result.operation }, 200);
    } catch (error) { return publicApiError(error); }
  };
}
export const POST = createExecutionBindingHandler(defaultConcertoPublicDependencies);
