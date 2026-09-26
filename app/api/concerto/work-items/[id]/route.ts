import { z } from "zod";

import {
  AgentWorkItemMutationSchema,
  evaluateAgentWorkItemAccess,
  normalizeRegistryOwnerAgentId,
} from "@/lib/observatory/agent-work-item-api";
import {
  agentApiError,
  defaultAgentWorkItemApiDependencies,
  projectFor,
  projectItem,
  type AgentWorkItemApiDependencies,
} from "@/app/api/concerto/work-items/route";
import {
  authenticate,
  jsonResponse,
  readBoundedJson,
} from "@/app/api/dashboard/work-items/claims/route";

const WorkItemIdSchema = z.uuid();

function authenticateRequest(
  request: Request,
  dependencies: AgentWorkItemApiDependencies,
) {
  return authenticate(request, {
    keyConfiguration: dependencies.keyConfiguration,
    repository: () => {
      throw new Error("Claim repository is not used");
    },
  });
}

export function createAgentWorkItemHandlers(
  dependencies: AgentWorkItemApiDependencies,
) {
  return {
    async GET(
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) {
      const authenticated = authenticateRequest(request, dependencies);
      if (authenticated.response) return authenticated.response;
      const id = WorkItemIdSchema.safeParse((await context.params).id);
      if (!id.success) return jsonResponse({ error: "NOT_FOUND" }, 404);
      try {
        const [item, registry] = await Promise.all([
          dependencies.repository().get(id.data),
          dependencies.projects(),
        ]);
        if (!item) return jsonResponse({ error: "NOT_FOUND" }, 404);
        const project = projectFor(item, registry.projects);
        const agentId = authenticated.principal!.agentId;
        const ownerAgentId = project
          ? normalizeRegistryOwnerAgentId(project.owner)
          : null;
        const access = evaluateAgentWorkItemAccess({
          agentId,
          projectOwnerAgentId: ownerAgentId,
          item,
        });
        if (!access.visible) return jsonResponse({ error: "NOT_FOUND" }, 404);
        return jsonResponse(
          { workItem: projectItem(item, agentId, ownerAgentId) },
          200,
        );
      } catch (error) {
        return agentApiError(error);
      }
    },

    async PATCH(
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) {
      const authenticated = authenticateRequest(request, dependencies);
      if (authenticated.response) return authenticated.response;
      const id = WorkItemIdSchema.safeParse((await context.params).id);
      const mutation = AgentWorkItemMutationSchema.safeParse(
        await readBoundedJson(request),
      );
      if (!id.success || !mutation.success) {
        return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      }
      try {
        const [item, registry] = await Promise.all([
          dependencies.repository().get(id.data),
          dependencies.projects(),
        ]);
        if (!item) return jsonResponse({ error: "NOT_FOUND" }, 404);
        const project = projectFor(item, registry.projects);
        if (!project) return jsonResponse({ error: "FORBIDDEN" }, 403);
        const agentId = authenticated.principal!.agentId;
        const ownerAgentId = normalizeRegistryOwnerAgentId(project.owner);
        const access = evaluateAgentWorkItemAccess({
          agentId,
          projectOwnerAgentId: ownerAgentId,
          item,
        });
        if (!access.allowedActions.includes(mutation.data.action)) {
          return jsonResponse({ error: "FORBIDDEN" }, 403);
        }
        if (
          mutation.data.action === "transition" &&
          !access.allowedTransitions.includes(mutation.data.targetState)
        ) {
          return jsonResponse({ error: "INVALID_TRANSITION" }, 409);
        }
        if (
          mutation.data.action === "assign" &&
          !registry.agentIds.includes(mutation.data.assignedAgentId)
        ) {
          return jsonResponse({ error: "INVALID_REQUEST" }, 400);
        }
        const result = await dependencies.repository().execute({
          agentId,
          isProjectOwner: access.isProjectOwner,
          projectRef: project.projectKey,
          workItemId: id.data,
          mutation: mutation.data,
        });
        return jsonResponse(
          {
            workItem: projectItem(
              result.workItem,
              agentId,
              ownerAgentId,
            ),
            evidence: result.evidence,
          },
          200,
        );
      } catch (error) {
        return agentApiError(error);
      }
    },
  };
}

const handlers = createAgentWorkItemHandlers(
  defaultAgentWorkItemApiDependencies,
);
export const GET = handlers.GET;
export const PATCH = handlers.PATCH;
