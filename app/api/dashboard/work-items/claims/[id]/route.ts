import { z } from "zod";

import { AgentClaimMutationRequestSchema } from "@/lib/observatory/agent-claims";
import {
  authenticate,
  defaultAgentClaimApiDependencies,
  jsonResponse,
  readBoundedJson,
  repositoryErrorResponse,
  type AgentClaimApiDependencies,
} from "@/app/api/dashboard/work-items/claims/route";

const ClaimIdSchema = z.uuid();

export function createAgentClaimItemHandlers(
  dependencies: AgentClaimApiDependencies,
) {
  return {
    async PATCH(
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) {
      const authenticated = authenticate(request, dependencies);
      if (authenticated.response) return authenticated.response;

      const claimId = ClaimIdSchema.safeParse((await context.params).id);
      const body = AgentClaimMutationRequestSchema.safeParse(
        await readBoundedJson(request),
      );
      if (!claimId.success || !body.success) {
        return jsonResponse({ error: "invalid_request" }, 400);
      }

      const principal = authenticated.principal!;
      const repository = dependencies.repository();
      try {
        if (body.data.action === "heartbeat") {
          return jsonResponse(
            await repository.heartbeat({
              claimId: claimId.data,
              agentId: principal.agentId,
              expectedClaimVersion: body.data.expectedClaimVersion,
              leaseSeconds: body.data.leaseSeconds,
            }),
            200,
          );
        }
        if (body.data.action === "release") {
          return jsonResponse(
            await repository.release({
              claimId: claimId.data,
              agentId: principal.agentId,
              expectedClaimVersion: body.data.expectedClaimVersion,
              expectedWorkItemVersion: body.data.expectedWorkItemVersion,
            }),
            200,
          );
        }
        return jsonResponse(
          await repository.complete({
            claimId: claimId.data,
            agentId: principal.agentId,
            expectedClaimVersion: body.data.expectedClaimVersion,
            expectedWorkItemVersion: body.data.expectedWorkItemVersion,
            summary: body.data.summary,
            evidenceUrl: body.data.evidenceUrl,
          }),
          200,
        );
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },
  };
}

const handlers = createAgentClaimItemHandlers(
  defaultAgentClaimApiDependencies,
);

export const PATCH = handlers.PATCH;
