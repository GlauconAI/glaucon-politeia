import { describe, expect, it, vi } from "vitest";

import {
  createAgentWorkItemRepository,
  type AgentWorkItemRepositoryClient,
} from "@/lib/observatory/agent-work-item-repository";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  assigned_agent_id: "aristotle",
  project_key: "plato/dashboard",
  project_ref: "plato/dashboard",
  state: "in_progress",
  updated_at: "2026-09-26T00:00:00.000Z",
};

function client(input?: {
  rows?: unknown[];
  rpcData?: unknown;
  rpcError?: { message: string } | null;
}) {
  const limit = vi.fn().mockResolvedValue({
    data: input?.rows ?? [item],
    error: null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({ data: item, error: null });
  const rpc = vi.fn().mockResolvedValue({
    data: input?.rpcData ?? { workItem: item },
    error: input?.rpcError ?? null,
  });
  const value = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({ limit })),
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    rpc,
  } as unknown as AgentWorkItemRepositoryClient;
  return { value, rpc };
}

describe("Concerto Agent Work Item repository", () => {
  it("filters list results to the assignee or canonical Project Owner scope", async () => {
    const { value } = client({
      rows: [
        item,
        { ...item, id: "owner-visible", assigned_agent_id: "amou" },
        {
          ...item,
          id: "hidden",
          assigned_agent_id: "amou",
          project_key: "shared/other",
          project_ref: "shared/other",
        },
      ],
    });
    const repository = createAgentWorkItemRepository(value);

    await expect(
      repository.listVisible({
        agentId: "aristotle",
        ownerProjectRefs: ["plato/dashboard"],
        limit: 10,
      }),
    ).resolves.toMatchObject([{ id: item.id }, { id: "owner-visible" }]);
  });

  it("passes server-derived identity and hashes the create request", async () => {
    const { value, rpc } = client();
    const repository = createAgentWorkItemRepository(value);
    await repository.create({
      agentId: "aristotle",
      type: "feature",
      title: "Agent API",
      description: "",
      projectRef: "plato/dashboard",
      projectVersionId: "22222222-2222-4222-8222-222222222222",
      versionBindingKind: "required",
      idempotencyKey: "aristotle:create:1",
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_observatory_work_item_as_agent",
      expect.objectContaining({
        p_agent_id: "aristotle",
        p_request_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
  });

  it("maps database version conflicts to the stable API error", async () => {
    const { value } = client({
      rpcError: { message: "VERSION_CONFLICT" },
    });
    const repository = createAgentWorkItemRepository(value);

    await expect(
      repository.execute({
        agentId: "aristotle",
        isProjectOwner: false,
        projectRef: "plato/dashboard",
        workItemId: item.id,
        mutation: {
          action: "update",
          expectedVersion: 3,
          description: "new",
          idempotencyKey: "aristotle:update:1",
        },
      }),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });
});
