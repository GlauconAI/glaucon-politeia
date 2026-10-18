import {
  defaultAgentWorkItemApiDependencies,
} from "@/app/api/concerto/work-items/route";
import { jsonResponse } from "@/app/api/dashboard/work-items/claims/route";
import { AgentClaimAuthError, authenticateAgentClaimRequest } from "@/lib/observatory/agent-claim-auth";
import { normalizeRegistryOwnerAgentId } from "@/lib/observatory/agent-work-item-api";
import {
  createProjectWorkSnapshotRepository,
  type ProjectWorkSnapshotClient,
} from "@/lib/observatory/project-work-snapshot-repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PROJECT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface SnapshotRouteDependencies {
  keyConfiguration(): string | undefined;
  projects: typeof defaultAgentWorkItemApiDependencies.projects;
  repository(): ReturnType<typeof createProjectWorkSnapshotRepository>;
}

export const defaultSnapshotRouteDependencies: SnapshotRouteDependencies = {
  keyConfiguration: defaultAgentWorkItemApiDependencies.keyConfiguration,
  projects: defaultAgentWorkItemApiDependencies.projects,
  repository: () => createProjectWorkSnapshotRepository(
    createSupabaseAdminClient() as unknown as ProjectWorkSnapshotClient,
  ),
};

export function createProjectWorkSnapshotHandler(
  dependencies: SnapshotRouteDependencies,
) {
  return async function GET(request: Request) {
    let agentId: string;
    try {
      agentId = authenticateAgentClaimRequest(
        request.headers.get("authorization"), dependencies.keyConfiguration(),
      ).agentId;
    } catch (error) {
      return jsonResponse({ error: error instanceof AgentClaimAuthError && error.code !== "UNCONFIGURED"
        ? "UNAUTHORIZED" : "UNAVAILABLE" }, error instanceof AgentClaimAuthError && error.code !== "UNCONFIGURED" ? 401 : 503);
    }
    const url = new URL(request.url);
    const projectKey = url.searchParams.get("projectKey");
    const expectedRevision = url.searchParams.get("expectedRevision");
    if (!projectKey || !PROJECT_KEY.test(projectKey) ||
        (expectedRevision !== null && !/^[a-f0-9]{32}$/u.test(expectedRevision))) {
      return jsonResponse({ error: "INVALID_REQUEST" }, 400);
    }
    try {
      const registry = await dependencies.projects();
      const project = registry.projects.find((entry) => entry.projectKey === projectKey);
      if (!project || normalizeRegistryOwnerAgentId(project.owner) !== agentId) {
        return jsonResponse({ error: "FORBIDDEN" }, 403);
      }
      const snapshot = await dependencies.repository().read(projectKey);
      if (expectedRevision !== null &&
          snapshot.snapshot_revision !== expectedRevision) {
        return jsonResponse({ error: "SNAPSHOT_DRIFT" }, 409);
      }
      return jsonResponse(snapshot, 200);
    } catch {
      return jsonResponse({ error: "UNAVAILABLE" }, 503);
    }
  };
}

export const GET = createProjectWorkSnapshotHandler(
  defaultSnapshotRouteDependencies,
);
