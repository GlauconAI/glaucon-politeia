import {
  AgentClaimAuthError,
  authenticateAgentClaimRequest,
} from "@/lib/observatory/agent-claim-auth";
import { AgentClaimRequestSchema } from "@/lib/observatory/agent-claims";
import {
  AgentClaimRepositoryError,
  createAgentClaimRepository,
  type AgentClaimRepositoryClient,
} from "@/lib/observatory/claim-repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 8_192;
const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json",
};

export type AgentClaimApiRepository = ReturnType<
  typeof createAgentClaimRepository
>;

export interface AgentClaimApiDependencies {
  keyConfiguration(): string | undefined;
  repository(): AgentClaimApiRepository;
}

export const defaultAgentClaimApiDependencies: AgentClaimApiDependencies = {
  keyConfiguration: () => process.env.OBSERVATORY_AGENT_CLAIM_KEYS,
  repository: () =>
    createAgentClaimRepository(
      createSupabaseAdminClient() as unknown as AgentClaimRepositoryClient,
    ),
};

export function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function readBoundedJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_BODY_BYTES
  ) {
    return null;
  }
  try {
    const text = await request.text();
    if (
      text.length === 0 ||
      new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES
    ) {
      return null;
    }
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function authenticate(
  request: Request,
  dependencies: AgentClaimApiDependencies,
) {
  try {
    return {
      principal: authenticateAgentClaimRequest(
        request.headers.get("authorization"),
        dependencies.keyConfiguration(),
      ),
      response: null,
    };
  } catch (error) {
    if (error instanceof AgentClaimAuthError) {
      return {
        principal: null,
        response:
          error.code === "UNCONFIGURED"
            ? jsonResponse({ error: "unavailable" }, 503)
            : jsonResponse({ error: "unauthorized" }, 401),
      };
    }
    return {
      principal: null,
      response: jsonResponse({ error: "unavailable" }, 503),
    };
  }
}

export function repositoryErrorResponse(error: unknown) {
  if (!(error instanceof AgentClaimRepositoryError)) {
    return jsonResponse({ error: "unavailable" }, 503);
  }
  switch (error.code) {
    case "NO_ELIGIBLE_WORK":
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
    case "VERSION_CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
      return jsonResponse({ error: "conflict" }, 409);
    case "LEASE_EXPIRED":
      return jsonResponse({ error: "lease_expired" }, 410);
    case "OWNER_MISMATCH":
    case "FORBIDDEN":
      return jsonResponse({ error: "forbidden" }, 403);
    case "INVALID_BOUNDARY":
      return jsonResponse({ error: "invalid_request" }, 400);
    case "DEPENDENCY_FAILED":
      return jsonResponse({ error: "unavailable" }, 503);
  }
}

export function createAgentClaimCollectionHandlers(
  dependencies: AgentClaimApiDependencies,
) {
  return {
    async POST(request: Request) {
      const authenticated = authenticate(request, dependencies);
      if (authenticated.response) return authenticated.response;

      const parsed = AgentClaimRequestSchema.safeParse(
        await readBoundedJson(request),
      );
      if (!parsed.success) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }

      try {
        const result = await dependencies.repository().claim({
          ...parsed.data,
          agentId: authenticated.principal!.agentId,
        });
        return jsonResponse(result, 200);
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async PUT(request: Request) {
      const authenticated = authenticate(request, dependencies);
      if (authenticated.response) return authenticated.response;
      try {
        const swept = await dependencies.repository().sweep();
        return jsonResponse({ swept }, 200);
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },
  };
}

const handlers = createAgentClaimCollectionHandlers(
  defaultAgentClaimApiDependencies,
);

export const POST = handlers.POST;
export const PUT = handlers.PUT;
