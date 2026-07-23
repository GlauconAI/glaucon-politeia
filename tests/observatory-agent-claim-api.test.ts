import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createAgentClaimCollectionHandlers,
  type AgentClaimApiDependencies,
} from "@/app/api/dashboard/work-items/claims/route";
import { createAgentClaimItemHandlers } from "@/app/api/dashboard/work-items/claims/[id]/route";
import { AgentClaimRepositoryError } from "@/lib/observatory/claim-repository";

const token = "owner-supplied-pilot-token";
const config = JSON.stringify([
  {
    agentId: "plato-pilot",
    tokenSha256: createHash("sha256").update(token).digest("hex"),
  },
]);
const claimId = "10000000-0000-4000-8000-000000000001";
const workItemId = "20000000-0000-4000-8000-000000000001";

const result = {
  claim: {
    id: claimId,
    workItemId,
    agentId: "plato-pilot",
    status: "active" as const,
    claimVersion: 1,
    startedAt: "2026-07-23T20:00:00.000Z",
    lastHeartbeatAt: "2026-07-23T20:00:00.000Z",
    leaseExpiresAt: "2026-07-23T20:15:00.000Z",
    endedAt: null,
  },
  workItem: {
    id: workItemId,
    type: "feature" as const,
    title: "Claim badge",
    description: "Show a bounded badge.",
    state: "in_progress" as const,
    version: 8,
    authorizedPaths: ["components/observatory/WorkTrackerBoard.tsx"],
    allowedActionClasses: ["code_edit", "test"],
  },
};

function request(
  url: string,
  body: unknown,
  options?: { authorization?: string; contentLength?: string },
) {
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: options?.authorization ?? `Bearer ${token}`,
      "content-type": "application/json",
      ...(options?.contentLength
        ? { "content-length": options.contentLength }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides?: Partial<AgentClaimApiDependencies>,
): AgentClaimApiDependencies {
  return {
    keyConfiguration: () => config,
    repository: () => ({
      claim: vi.fn().mockResolvedValue(result),
      heartbeat: vi.fn().mockResolvedValue(result.claim),
      release: vi.fn().mockResolvedValue(result),
      complete: vi.fn().mockResolvedValue(result),
      sweep: vi.fn().mockResolvedValue(0),
    }),
    ...overrides,
  };
}

describe("Agent Claim API", () => {
  it.each([
    [undefined, 503, "unavailable"],
    [config, 401, "unauthorized"],
  ] as const)("fails closed for configuration/auth", async (raw, status, code) => {
    const { POST } = createAgentClaimCollectionHandlers(
      dependencies({ keyConfiguration: () => raw }),
    );
    const response = await POST(
      request(
        "https://402v.com/api/dashboard/work-items/claims",
        { idempotencyKey: "claim-1" },
        { authorization: status === 401 ? "Bearer wrong" : `Bearer ${token}` },
      ),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: code });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    [{ idempotencyKey: "" }, undefined],
    [{ idempotencyKey: "claim-1", extra: "private" }, undefined],
    [{ idempotencyKey: "claim-1" }, "9000"],
  ])("rejects invalid or oversized JSON", async (body, contentLength) => {
    const { POST } = createAgentClaimCollectionHandlers(dependencies());
    const response = await POST(
      request("https://402v.com/api/dashboard/work-items/claims", body, {
        contentLength,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
    });
  });

  it("returns only the bounded projection on a successful claim", async () => {
    const claim = vi.fn().mockResolvedValue(result);
    const { POST } = createAgentClaimCollectionHandlers(
      dependencies({
        repository: () => ({
          claim,
          heartbeat: vi.fn(),
          release: vi.fn(),
          complete: vi.fn(),
          sweep: vi.fn(),
        }),
      }),
    );
    const response = await POST(
      request("https://402v.com/api/dashboard/work-items/claims", {
        idempotencyKey: "claim-1",
        workItemId,
        leaseSeconds: 900,
      }),
    );

    expect(response.status).toBe(200);
    expect(claim).toHaveBeenCalledWith({
      agentId: "plato-pilot",
      idempotencyKey: "claim-1",
      workItemId,
      leaseSeconds: 900,
    });
    const json = await response.json();
    expect(json).toEqual(result);
    expect(JSON.stringify(json)).not.toMatch(
      /authorization|supabase|secret|Users\/glaucon/iu,
    );
  });

  it.each([
    ["NO_ELIGIBLE_WORK", 204],
    ["VERSION_CONFLICT", 409],
    ["IDEMPOTENCY_CONFLICT", 409],
    ["DEPENDENCY_FAILED", 503],
  ] as const)("maps %s to HTTP %s", async (code, status) => {
    const { POST } = createAgentClaimCollectionHandlers(
      dependencies({
        repository: () => ({
          claim: vi
            .fn()
            .mockRejectedValue(
              new AgentClaimRepositoryError(code, "safe message"),
            ),
          heartbeat: vi.fn(),
          release: vi.fn(),
          complete: vi.fn(),
          sweep: vi.fn(),
        }),
      }),
    );
    const response = await POST(
      request("https://402v.com/api/dashboard/work-items/claims", {
        idempotencyKey: "claim-1",
      }),
    );

    expect(response.status).toBe(status);
  });

  it("authenticates before parsing a dynamic claim id", async () => {
    const { PATCH } = createAgentClaimItemHandlers(dependencies());
    const response = await PATCH(
      request(
        "https://402v.com/api/dashboard/work-items/claims/not-a-uuid",
        { action: "heartbeat", expectedClaimVersion: 1, leaseSeconds: 900 },
        { authorization: "Bearer wrong" },
      ),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );

    expect(response.status).toBe(401);
  });

  it.each([
    [
      "heartbeat",
      { action: "heartbeat", expectedClaimVersion: 1, leaseSeconds: 900 },
    ],
    [
      "release",
      {
        action: "release",
        expectedClaimVersion: 1,
        expectedWorkItemVersion: 8,
      },
    ],
    [
      "complete",
      {
        action: "complete",
        expectedClaimVersion: 1,
        expectedWorkItemVersion: 8,
        summary: "Focused tests pass.",
        evidenceUrl: "https://github.com/example/repo/commit/abc",
      },
    ],
  ] as const)("dispatches strict %s mutations", async (method, body) => {
    const repository = dependencies().repository();
    const { PATCH } = createAgentClaimItemHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await PATCH(
      request(
        `https://402v.com/api/dashboard/work-items/claims/${claimId}`,
        body,
      ),
      { params: Promise.resolve({ id: claimId }) },
    );

    expect(response.status).toBe(200);
    expect(repository[method]).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId,
        agentId: "plato-pilot",
      }),
    );
  });

  it("runs an authenticated expiry sweep without accepting body controls", async () => {
    const repository = dependencies().repository();
    const { PUT } = createAgentClaimCollectionHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await PUT(
      new Request("https://402v.com/api/dashboard/work-items/claims", {
        method: "PUT",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ swept: 0 });
    expect(repository.sweep).toHaveBeenCalledOnce();
  });
});
