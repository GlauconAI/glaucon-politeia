import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import {
  AgentWorkItemCreateSchema,
  AgentWorkItemListQuerySchema,
  evaluateAgentWorkItemAccess,
  normalizeRegistryOwnerAgentId,
} from "@/lib/observatory/agent-work-item-api";
import {
  AgentWorkItemRepositoryError,
  createAgentWorkItemRepository,
  type AgentWorkItemRepositoryClient,
} from "@/lib/observatory/agent-work-item-repository";
import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import { buildWorkTrackerProjectOptions } from "@/lib/observatory/work-tracker-projects";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  authenticate,
  jsonResponse,
  readBoundedJson,
} from "@/app/api/dashboard/work-items/claims/route";

export type AgentWorkItemApiRepository = ReturnType<
  typeof createAgentWorkItemRepository
>;

export interface AgentWorkItemApiDependencies {
  keyConfiguration(): string | undefined;
  projects(): Promise<{
    projects: Array<{
      projectKey: string;
      title: string;
      owner: string;
      status: string;
    }>;
    agentIds: string[];
  }>;
  repository(): AgentWorkItemApiRepository;
}

export const defaultAgentWorkItemApiDependencies: AgentWorkItemApiDependencies = {
  keyConfiguration: () => process.env.OBSERVATORY_AGENT_CLAIM_KEYS,
  projects: async () => {
    const state = await loadObservatoryOverviewState();
    if (state.status !== "ready") throw new Error("Registry unavailable");
    return {
      projects: buildWorkTrackerProjectOptions(state.snapshot.registry),
      agentIds: state.snapshot.agents?.map((agent) => agent.id) ?? [],
    };
  },
  repository: () =>
    createAgentWorkItemRepository(
      createSupabaseAdminClient() as unknown as AgentWorkItemRepositoryClient,
    ),
};

export function agentApiError(error: unknown) {
  if (!(error instanceof AgentWorkItemRepositoryError)) {
    return jsonResponse({ error: "UNAVAILABLE" }, 503);
  }
  const status = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    VERSION_CONFLICT: 409,
    INVALID_TRANSITION: 409,
    READY_GATE_FAILED: 409,
    IDEMPOTENCY_CONFLICT: 409,
    INVALID_REQUEST: 400,
    UNAVAILABLE: 503,
  }[error.code];
  return jsonResponse({ error: error.code }, status);
}

export function projectFor(
  item: Pick<ObservatoryWorkItemRow, "project_key" | "project_ref">,
  projects: Awaited<ReturnType<AgentWorkItemApiDependencies["projects"]>>["projects"],
) {
  const projectRef = item.project_key ?? item.project_ref ?? "";
  return projects.find((project) => project.projectKey === projectRef) ?? null;
}

export function projectItem(
  item: ObservatoryWorkItemRow,
  agentId: string,
  projectOwnerAgentId: string | null,
) {
  const access = evaluateAgentWorkItemAccess({
    agentId,
    projectOwnerAgentId,
    item,
  });
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    state: item.state,
    priority: item.priority,
    ownerId: item.owner_id,
    assignedAgentId: item.assigned_agent_id,
    acceptanceCriteria: item.acceptance_criteria,
    projectRef: item.project_key ?? item.project_ref,
    projectVersionId: item.project_version_id,
    versionBindingKind: item.version_binding_kind,
    milestoneRef: item.milestone_ref,
    dueOn: item.due_on,
    version: item.version,
    updatedAt: item.updated_at,
    allowedActions: access.allowedActions,
    allowedTransitions: access.allowedTransitions,
  };
}

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

export function createAgentWorkItemCollectionHandlers(
  dependencies: AgentWorkItemApiDependencies,
) {
  return {
    async GET(request: Request) {
      const authenticated = authenticateRequest(request, dependencies);
      if (authenticated.response) return authenticated.response;
      const url = new URL(request.url);
      const raw = {
        state: url.searchParams.get("state") ?? undefined,
        projectRef: url.searchParams.get("projectRef") ?? undefined,
        limit: url.searchParams.has("limit")
          ? Number(url.searchParams.get("limit"))
          : undefined,
      };
      const parsed = AgentWorkItemListQuerySchema.safeParse(raw);
      if (!parsed.success) return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      try {
        const context = await dependencies.projects();
        const agentId = authenticated.principal!.agentId;
        const ownerProjectRefs = context.projects
          .filter(
            (project) =>
              normalizeRegistryOwnerAgentId(project.owner) === agentId,
          )
          .map((project) => project.projectKey);
        const items = await dependencies.repository().listVisible({
          agentId,
          ownerProjectRefs,
          state: parsed.data.state,
          projectRef: parsed.data.projectRef,
          limit: parsed.data.limit,
        });
        return jsonResponse(
          {
            items: items.map((item) => {
              const project = projectFor(item, context.projects);
              return projectItem(
                item,
                agentId,
                project ? normalizeRegistryOwnerAgentId(project.owner) : null,
              );
            }),
          },
          200,
        );
      } catch (error) {
        return agentApiError(error);
      }
    },

    async POST(request: Request) {
      const authenticated = authenticateRequest(request, dependencies);
      if (authenticated.response) return authenticated.response;
      const parsed = AgentWorkItemCreateSchema.safeParse(
        await readBoundedJson(request),
      );
      if (!parsed.success) return jsonResponse({ error: "INVALID_REQUEST" }, 400);
      try {
        const context = await dependencies.projects();
        if (
          !context.projects.some(
            (project) =>
              project.projectKey === parsed.data.projectRef &&
              !["retired", "archived"].includes(project.status),
          )
        ) {
          return jsonResponse({ error: "INVALID_REQUEST" }, 400);
        }
        const result = await dependencies.repository().create({
          ...parsed.data,
          agentId: authenticated.principal!.agentId,
        });
        const project = projectFor(result.workItem, context.projects);
        return jsonResponse(
          {
            workItem: projectItem(
              result.workItem,
              authenticated.principal!.agentId,
              project ? normalizeRegistryOwnerAgentId(project.owner) : null,
            ),
          },
          200,
        );
      } catch (error) {
        return agentApiError(error);
      }
    },
  };
}

const handlers = createAgentWorkItemCollectionHandlers(
  defaultAgentWorkItemApiDependencies,
);
export const GET = handlers.GET;
export const POST = handlers.POST;
