import { defaultSnapshotRouteDependencies } from '@/app/api/concerto/project-work-snapshot/route';
import { agentApiError, defaultAgentWorkItemApiDependencies } from '@/app/api/concerto/work-items/route';
import { authenticate, jsonResponse } from '@/app/api/dashboard/work-items/claims/route';
import { createConcertoPublicRepository, ConcertoSnapshotDriftError, type ConcertoPublicClient } from '@/lib/observatory/concerto-public-repository';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface ConcertoPublicDependencies {
  keyConfiguration: typeof defaultAgentWorkItemApiDependencies.keyConfiguration;
  projects: typeof defaultAgentWorkItemApiDependencies.projects;
  repository(): ReturnType<typeof createConcertoPublicRepository>;
  items(): Pick<ReturnType<typeof defaultAgentWorkItemApiDependencies.repository>, 'get'>;
}
export const defaultConcertoPublicDependencies: ConcertoPublicDependencies = {
  keyConfiguration: defaultAgentWorkItemApiDependencies.keyConfiguration,
  // Snapshot Registry mapping respects explicit project_owner before group owner.
  projects: defaultSnapshotRouteDependencies.projects,
  repository: () => createConcertoPublicRepository(createSupabaseAdminClient() as unknown as ConcertoPublicClient),
  items: defaultAgentWorkItemApiDependencies.repository,
};
export function authenticatePublic(request: Request, dependencies: ConcertoPublicDependencies) {
  return authenticate(request, { keyConfiguration: dependencies.keyConfiguration, repository: () => { throw new Error('Unused claim repository'); } });
}
export function publicApiError(error: unknown) {
  return error instanceof ConcertoSnapshotDriftError
    ? jsonResponse({ error: 'SNAPSHOT_DRIFT' }, 409) : agentApiError(error);
}
