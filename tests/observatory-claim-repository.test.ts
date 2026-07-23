import { describe, expect, it, vi } from "vitest";

import {
  AgentClaimRepositoryError,
  createAgentClaimRepository,
  type AgentClaimRepositoryClient,
} from "@/lib/observatory/claim-repository";

const claimId = "10000000-0000-4000-8000-000000000001";
const workItemId = "20000000-0000-4000-8000-000000000001";

function clientResult(input?: {
  data?: unknown;
  error?: { code?: string; message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue({
    data: input?.data ?? null,
    error: input?.error ?? null,
  });
  return {
    client: { rpc } as AgentClaimRepositoryClient,
    rpc,
  };
}

describe("Agent Claim service repository", () => {
  it("uses the exact bounded claim RPC arguments", async () => {
    const { client, rpc } = clientResult({
      data: {
        claim: {
          id: claimId,
          work_item_id: workItemId,
          agent_id: "codex-runner",
          status: "active",
          claim_version: 1,
          started_at: "2026-07-23T20:00:00.000Z",
          last_heartbeat_at: "2026-07-23T20:00:00.000Z",
          lease_expires_at: "2026-07-23T20:15:00.000Z",
          ended_at: null,
        },
        work_item: {
          id: workItemId,
          type: "feature",
          title: "Claimable Feature",
          description: "Bounded change.",
          version: 7,
          state: "in_progress",
          authorized_paths: ["components/observatory"],
          allowed_action_classes: ["code_edit", "test"],
        },
      },
    });

    await expect(
      createAgentClaimRepository(client).claim({
        agentId: "codex-runner",
        idempotencyKey: "claim-001",
        workItemId,
        leaseSeconds: 900,
      }),
    ).resolves.toMatchObject({
      claim: { id: claimId, claimVersion: 1, status: "active" },
      workItem: {
        id: workItemId,
        version: 7,
        state: "in_progress",
        authorizedPaths: ["components/observatory"],
        allowedActionClasses: ["code_edit", "test"],
      },
    });
    expect(rpc).toHaveBeenCalledWith("claim_observatory_work_item", {
      p_agent_id: "codex-runner",
      p_idempotency_key: "claim-001",
      p_work_item_id: workItemId,
      p_lease_seconds: 900,
    });
  });

  it("uses exact heartbeat, release, completion, and sweep RPC contracts", async () => {
    const claim = {
      id: claimId,
      work_item_id: workItemId,
      agent_id: "codex-runner",
      status: "active",
      claim_version: 2,
      started_at: "2026-07-23T20:00:00.000Z",
      last_heartbeat_at: "2026-07-23T20:05:00.000Z",
      lease_expires_at: "2026-07-23T20:20:00.000Z",
      ended_at: null,
    };
    const workItem = {
      id: workItemId,
      type: "feature",
      title: "Claimable Feature",
      description: "Bounded change.",
      version: 8,
      state: "in_progress",
      authorized_paths: ["components/observatory"],
      allowed_action_classes: ["code_edit", "test"],
    };
    const { client, rpc } = clientResult();
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "renew_observatory_work_item_claim"
          ? claim
          : name === "sweep_observatory_work_item_claims"
            ? 0
            : { claim, work_item: workItem },
      error: null,
    }));
    const repository = createAgentClaimRepository(client);

    await repository.heartbeat({
      claimId,
      agentId: "codex-runner",
      expectedClaimVersion: 1,
      leaseSeconds: 900,
    });
    await repository.release({
      claimId,
      agentId: "codex-runner",
      expectedClaimVersion: 2,
      expectedWorkItemVersion: 8,
    });
    await repository.complete({
      claimId,
      agentId: "codex-runner",
      expectedClaimVersion: 2,
      expectedWorkItemVersion: 8,
      summary: "Focused tests passed.",
      evidenceUrl: "https://github.com/example/repo/commit/abc",
    });
    await repository.sweep();

    expect(rpc.mock.calls).toEqual([
      [
        "renew_observatory_work_item_claim",
        {
          p_claim_id: claimId,
          p_agent_id: "codex-runner",
          p_expected_claim_version: 1,
          p_lease_seconds: 900,
        },
      ],
      [
        "release_observatory_work_item_claim",
        {
          p_claim_id: claimId,
          p_agent_id: "codex-runner",
          p_expected_claim_version: 2,
          p_expected_work_item_version: 8,
        },
      ],
      [
        "complete_observatory_work_item_claim",
        {
          p_claim_id: claimId,
          p_agent_id: "codex-runner",
          p_expected_claim_version: 2,
          p_expected_work_item_version: 8,
          p_summary: "Focused tests passed.",
          p_evidence_url: "https://github.com/example/repo/commit/abc",
        },
      ],
      ["sweep_observatory_work_item_claims", {}],
    ]);
  });

  it.each([
    ["42501", "service role required", "FORBIDDEN"],
    ["P0002", "observatory_claim_not_eligible", "NO_ELIGIBLE_WORK"],
    ["40001", "observatory_claim_version_conflict", "VERSION_CONFLICT"],
    ["23505", "observatory_claim_idempotency_conflict", "IDEMPOTENCY_CONFLICT"],
    ["55000", "observatory_claim_expired", "LEASE_EXPIRED"],
    ["42501", "observatory_claim_owner_mismatch", "OWNER_MISMATCH"],
    ["22023", "observatory_claim_boundary_invalid", "INVALID_BOUNDARY"],
    ["08006", "private connection detail", "DEPENDENCY_FAILED"],
  ] as const)(
    "maps %s/%s to stable %s without leaking dependency detail",
    async (code, message, expectedCode) => {
      const { client } = clientResult({ error: { code, message } });

      const error = await createAgentClaimRepository(client)
        .claim({
          agentId: "codex-runner",
          idempotencyKey: "claim-001",
          workItemId,
          leaseSeconds: 900,
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AgentClaimRepositoryError);
      expect(error).toMatchObject({ code: expectedCode });
      expect((error as Error).message).not.toContain("private");
    },
  );

  it("rejects malformed database projections as a dependency failure", async () => {
    const { client } = clientResult({ data: { claim: { id: claimId } } });

    await expect(
      createAgentClaimRepository(client).claim({
        agentId: "codex-runner",
        idempotencyKey: "claim-001",
        workItemId,
        leaseSeconds: 900,
      }),
    ).rejects.toMatchObject({
      code: "DEPENDENCY_FAILED",
      message: "Agent Claim is temporarily unavailable.",
    });
  });
});
