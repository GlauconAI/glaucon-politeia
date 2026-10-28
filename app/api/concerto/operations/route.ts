import { OperationQuerySchema } from '@/lib/observatory/concerto-public-api';
import { authenticatePublic, defaultConcertoPublicDependencies, publicApiError, type ConcertoPublicDependencies } from '@/lib/observatory/concerto-public-route';
import { normalizeRegistryOwnerAgentId } from '@/lib/observatory/agent-work-item-api';
import { jsonResponse } from '@/app/api/dashboard/work-items/claims/route';

export function createConcertoOperationHandler(dependencies: ConcertoPublicDependencies) {
  return async function GET(request: Request) {
    const authenticated = authenticatePublic(request, dependencies);
    if (authenticated.response) return authenticated.response;
    const parsed = OperationQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return jsonResponse({ error: 'INVALID_REQUEST' }, 400);
    try {
      const registry = await dependencies.projects();
      const project = registry.projects.find((p) => p.projectKey === parsed.data.projectRef);
      if (!project) return jsonResponse({ error: 'NOT_FOUND' }, 404);
      const agentId = authenticated.principal!.agentId;
      const isProjectOwner = normalizeRegistryOwnerAgentId(project.owner) === agentId;
      const operationAgentId = parsed.data.operationAgentId ?? agentId;
      if (operationAgentId !== agentId && !isProjectOwner) return jsonResponse({ error: 'FORBIDDEN' }, 403);
      const operation = await dependencies.repository().readOperation({ agentId, isProjectOwner, projectRef: project.projectKey, operationKey: parsed.data.operationKey, operationAgentId });
      return jsonResponse({ operation }, 200);
    } catch (error) { return publicApiError(error); }
  };
}
export const GET = createConcertoOperationHandler(defaultConcertoPublicDependencies);
