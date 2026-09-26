import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createAgentWorkItemCollectionHandlers,
  type AgentWorkItemApiDependencies,
} from "@/app/api/concerto/work-items/route";
import { createAgentWorkItemHandlers } from "@/app/api/concerto/work-items/[id]/route";

const token = "owner-supplied-concerto-token";
const config = JSON.stringify([
  {
    agentId: "aristotle",
    tokenSha256: createHash("sha256").update(token).digest("hex"),
  },
]);
const ownerToken = "owner-supplied-project-owner-token";
const ownerConfig = JSON.stringify([
  {
    agentId: "plato",
    tokenSha256: createHash("sha256").update(ownerToken).digest("hex"),
  },
]);
const workItemId = "11111111-1111-4111-8111-111111111111";
const projectVersionId = "22222222-2222-4222-8222-222222222222";
const item = {
  id: workItemId,
  type: "feature",
  title: "Agent API",
  description: "",
  state: "in_progress",
  priority: "high",
  owner_id: null,
  assigned_agent_id: "aristotle",
  acceptance_criteria: "Tools work without Chrome.",
  project_ref: "plato/dashboard",
  project_key: "plato/dashboard",
  project_version_id: projectVersionId,
  version_binding_kind: "required",
  milestone_ref: null,
  due_on: null,
  plan_revision: null,
  stage_id: null,
  work_package_id: null,
  version: 4,
  created_at: "2026-09-26T00:00:00.000Z",
  updated_at: "2026-09-26T00:00:00.000Z",
};

function dependencies(
  overrides: Partial<AgentWorkItemApiDependencies> = {},
): AgentWorkItemApiDependencies {
  return {
    keyConfiguration: () => config,
    projects: async () => ({
      projects: [
        {
          projectKey: "plato/dashboard",
          title: "Dashboard",
          owner: "Plato",
          status: "active",
        },
      ],
      agentIds: ["plato", "aristotle", "amou"],
    }),
    repository: () => ({
      listVisible: vi.fn().mockResolvedValue([item]),
      get: vi.fn().mockResolvedValue(item),
      create: vi.fn().mockResolvedValue({ workItem: item }),
      execute: vi.fn().mockResolvedValue({ workItem: item, evidence: null }),
    }),
    ...overrides,
  };
}

function jsonRequest(url: string, body: unknown, bearer = token) {
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Concerto Agent Work Item routes", () => {
  it("lists only the repository projection visible to the authenticated Agent", async () => {
    const repository = dependencies().repository();
    const { GET } = createAgentWorkItemCollectionHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await GET(
      new Request("https://402v.com/api/concerto/work-items?limit=20", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.listVisible).toHaveBeenCalledWith({
      agentId: "aristotle",
      ownerProjectRefs: [],
      limit: 20,
      projectRef: undefined,
      state: undefined,
    });
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      id: workItemId,
      assignedAgentId: "aristotle",
      allowedActions: expect.arrayContaining(["update", "transition"]),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("creates an Inbox item assigned by the server to the authenticated Agent", async () => {
    const repository = dependencies().repository();
    const { POST } = createAgentWorkItemCollectionHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await POST(
      jsonRequest("https://402v.com/api/concerto/work-items", {
        type: "feature",
        title: "Agent API",
        description: "",
        projectRef: "plato/dashboard",
        projectVersionId,
        versionBindingKind: "required",
        idempotencyKey: "aristotle:create:1",
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "aristotle" }),
    );
  });

  it("rejects ordinary cross-Agent assignment before repository mutation", async () => {
    const repository = dependencies().repository();
    const { PATCH } = createAgentWorkItemHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await PATCH(
      jsonRequest(
        `https://402v.com/api/concerto/work-items/${workItemId}`,
        {
          action: "assign",
          expectedVersion: 4,
          assignedAgentId: "amou",
          idempotencyKey: "aristotle:assign:1",
        },
      ),
      { params: Promise.resolve({ id: workItemId }) },
    );

    expect(response.status).toBe(403);
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it("allows the canonical Project Owner to assign a registered Agent", async () => {
    const repository = dependencies().repository();
    const { PATCH } = createAgentWorkItemHandlers(
      dependencies({
        keyConfiguration: () => ownerConfig,
        repository: () => repository,
      }),
    );
    const response = await PATCH(
      jsonRequest(
        `https://402v.com/api/concerto/work-items/${workItemId}`,
        {
          action: "assign",
          expectedVersion: 4,
          assignedAgentId: "amou",
          idempotencyKey: "plato:assign:1",
        },
        ownerToken,
      ),
      { params: Promise.resolve({ id: workItemId }) },
    );

    expect(response.status).toBe(200);
    expect(repository.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "plato",
        isProjectOwner: true,
        projectRef: "plato/dashboard",
      }),
    );
  });

  it("rejects an ordinary Agent attempting the final done transition", async () => {
    const repository = dependencies().repository();
    const { PATCH } = createAgentWorkItemHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await PATCH(
      jsonRequest(
        `https://402v.com/api/concerto/work-items/${workItemId}`,
        {
          action: "transition",
          expectedVersion: 4,
          targetState: "done",
          idempotencyKey: "aristotle:done:1",
        },
      ),
      { params: Promise.resolve({ id: workItemId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_TRANSITION",
    });
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it("allows the assignee to attach bounded HTTP evidence", async () => {
    const repository = dependencies().repository();
    const { PATCH } = createAgentWorkItemHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await PATCH(
      jsonRequest(
        `https://402v.com/api/concerto/work-items/${workItemId}`,
        {
          action: "add_evidence",
          expectedVersion: 4,
          label: "CI run",
          url: "https://github.com/example/repository/actions/runs/1",
          idempotencyKey: "aristotle:evidence:1",
        },
      ),
      { params: Promise.resolve({ id: workItemId }) },
    );

    expect(response.status).toBe(200);
    expect(repository.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "aristotle",
        mutation: expect.objectContaining({ action: "add_evidence" }),
      }),
    );
  });

  it("rejects unknown fields so callers cannot smuggle identity or ownership", async () => {
    const repository = dependencies().repository();
    const { PATCH } = createAgentWorkItemHandlers(
      dependencies({ repository: () => repository }),
    );
    const response = await PATCH(
      jsonRequest(
        `https://402v.com/api/concerto/work-items/${workItemId}`,
        {
          action: "update",
          expectedVersion: 4,
          description: "legitimate update",
          actorAgentId: "plato",
          idempotencyKey: "aristotle:update:1",
        },
      ),
      { params: Promise.resolve({ id: workItemId }) },
    );

    expect(response.status).toBe(400);
    expect(repository.execute).not.toHaveBeenCalled();
  });

  it("authenticates before disclosing whether an item exists", async () => {
    const { GET } = createAgentWorkItemHandlers(dependencies());
    const response = await GET(
      new Request(
        `https://402v.com/api/concerto/work-items/${workItemId}`,
        { headers: { authorization: "Bearer wrong" } },
      ),
      { params: Promise.resolve({ id: workItemId }) },
    );
    expect(response.status).toBe(401);
  });
});
