import { describe, expect, it } from "vitest";

import {
  AgentWorkItemCreateSchema,
  AgentWorkItemMutationSchema,
  evaluateAgentWorkItemAccess,
  normalizeRegistryOwnerAgentId,
} from "@/lib/observatory/agent-work-item-api";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  project_ref: "plato/dashboard",
  project_key: "plato/dashboard",
  assigned_agent_id: "aristotle",
  state: "in_progress" as const,
  version: 4,
};

describe("Concerto Agent Work Item API contract", () => {
  it("normalizes canonical registry owners into runtime Agent IDs", () => {
    expect(normalizeRegistryOwnerAgentId("Plato")).toBe("plato");
    expect(normalizeRegistryOwnerAgentId("Lord Guan")).toBe("lord-guan");
    expect(normalizeRegistryOwnerAgentId("  Socrates  ")).toBe("socrates");
  });

  it("gives an assigned ordinary Agent only non-terminal self operations", () => {
    const access = evaluateAgentWorkItemAccess({
      agentId: "aristotle",
      projectOwnerAgentId: "plato",
      item,
    });
    expect(access.visible).toBe(true);
    expect(access.allowedActions).toEqual([
      "get",
      "update",
      "transition",
      "add_evidence",
      "claim",
      "complete_claim",
    ]);
    expect(access.allowedTransitions).toEqual(["review", "blocked", "waiting"]);
  });

  it("lets the Project Owner assign and perform final acceptance transitions", () => {
    const access = evaluateAgentWorkItemAccess({
      agentId: "plato",
      projectOwnerAgentId: "plato",
      item: { ...item, state: "review" },
    });
    expect(access.visible).toBe(true);
    expect(access.allowedActions).toContain("assign");
    expect(access.allowedTransitions).toEqual([
      "in_progress",
      "done",
      "blocked",
      "waiting",
    ]);
  });

  it("hides unrelated items from ordinary Agents", () => {
    expect(
      evaluateAgentWorkItemAccess({
        agentId: "amou",
        projectOwnerAgentId: "plato",
        item,
      }),
    ).toEqual({
      visible: false,
      isProjectOwner: false,
      isAssignee: false,
      allowedActions: [],
      allowedTransitions: [],
    });
  });

  it("accepts a bounded self-assigned Inbox create request", () => {
    const result = AgentWorkItemCreateSchema.safeParse({
      type: "feature",
      title: "Provide Agent Work Item API",
      description: "",
      projectRef: "plato/dashboard",
      projectVersionId: "22222222-2222-4222-8222-222222222222",
      versionBindingKind: "required",
      idempotencyKey: "plato:concerto-tools:v1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects caller-controlled identity and unknown mutation fields", () => {
    expect(
      AgentWorkItemCreateSchema.safeParse({
        type: "feature",
        title: "Spoof",
        description: "",
        projectRef: "plato/dashboard",
        projectVersionId: "22222222-2222-4222-8222-222222222222",
        versionBindingKind: "required",
        idempotencyKey: "spoof",
        assignedAgentId: "plato",
      }).success,
    ).toBe(false);
    expect(
      AgentWorkItemMutationSchema.safeParse({
        action: "assign",
        expectedVersion: 4,
        assignedAgentId: "amou",
        actorAgentId: "plato",
      }).success,
    ).toBe(false);
  });
});
