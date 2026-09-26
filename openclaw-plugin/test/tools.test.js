import assert from "node:assert/strict";
import test from "node:test";

import {
  CONCERTO_TOOL_NAMES,
  createConcertoTools,
} from "../src/tools.js";

const agentId = "plato";
const token = "owner-supplied-token";

test("registers the exact Concerto V1 tool inventory", () => {
  assert.deepEqual(CONCERTO_TOOL_NAMES, [
    "concerto_list_work_items",
    "concerto_get_work_item",
    "concerto_create_work_item",
    "concerto_update_work_item",
    "concerto_transition_work_item",
    "concerto_assign_work_item",
    "concerto_add_evidence",
    "concerto_claim_work_item",
    "concerto_complete_claim",
  ]);
});

test("derives identity from tool context and never accepts caller identity", async () => {
  const requests = [];
  const tools = createConcertoTools({
    baseUrl: "https://402v.com",
    tokenForAgent: (id) => (id === agentId ? token : null),
    request: async (input) => {
      requests.push(input);
      return { items: [] };
    },
  }).forContext({ agentId });
  const list = tools.find((tool) => tool.name === "concerto_list_work_items");
  assert.ok(list);
  assert.equal(list.label, "List Concerto Work Items");
  assert.equal(
    Object.hasOwn(list.parameters.properties, "agentId"),
    false,
  );

  await list.execute("call-1", { limit: 20 });
  assert.equal(requests[0].agentId, agentId);
  assert.equal(requests[0].token, token);
});

test("hides all tools when the current Agent has no protected token", () => {
  const tools = createConcertoTools({
    baseUrl: "https://402v.com",
    tokenForAgent: () => null,
    request: async () => {
      throw new Error("must not run");
    },
  }).forContext({ agentId: "unknown" });
  assert.deepEqual(tools, []);
});

test("maps assignment to the item command endpoint without exposing secrets", async () => {
  const requests = [];
  const tools = createConcertoTools({
    baseUrl: "https://402v.com",
    tokenForAgent: () => token,
    request: async (input) => {
      requests.push(input);
      return { workItem: { id: input.params.work_item_id, version: 6 } };
    },
  }).forContext({ agentId });
  const assign = tools.find(
    (tool) => tool.name === "concerto_assign_work_item",
  );
  const output = await assign.execute("call-2", {
    work_item_id: "11111111-1111-4111-8111-111111111111",
    expected_version: 5,
    assigned_agent_id: "aristotle",
    idempotency_key: "plato:assign:5",
  });

  assert.deepEqual(requests[0], {
    method: "PATCH",
    path: "/api/concerto/work-items/11111111-1111-4111-8111-111111111111",
    agentId,
    token,
    body: {
      action: "assign",
      expectedVersion: 5,
      assignedAgentId: "aristotle",
      idempotencyKey: "plato:assign:5",
    },
    params: {
      work_item_id: "11111111-1111-4111-8111-111111111111",
    },
  });
  assert.doesNotMatch(JSON.stringify(output), /owner-supplied-token/u);
});
