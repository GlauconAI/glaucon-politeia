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
    "concerto_get_project_association_snapshot",
    "concerto_associate_project",
    "concerto_get_operation",
    "concerto_bind_work_item_execution",
    "concerto_get_project_work_snapshot",
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

test("association ports bind exact pair/revision but never accept actor or catalog proof", async () => {
  const requests = [];
  const tools = createConcertoTools({baseUrl:"https://402v.com",tokenForAgent:(id)=>id==="main"?token:null,request:async(input)=>{requests.push(input);return {ok:true};}}).forContext({agentId:"main"});
  const read=tools.find((tool)=>tool.name==="concerto_get_project_association_snapshot");
  const write=tools.find((tool)=>tool.name==="concerto_associate_project");
  assert.ok(read); assert.ok(write);
  const params={source_project_key:"socrates/fixture",target_project_key:"shared/fixture",expected_revision:"a".repeat(32)};
  await read.execute("read",params);
  await write.execute("write",{...params,idempotency_key:"fixture:associate"});
  assert.deepEqual(requests[0],{method:"GET",path:"/api/concerto/project-associations/snapshot",query:{sourceProjectKey:params.source_project_key,targetProjectKey:params.target_project_key,expectedRevision:params.expected_revision},token,agentId:"main",params:undefined});
  assert.deepEqual(requests[1],{method:"POST",path:"/api/concerto/project-associations",body:{sourceProjectKey:params.source_project_key,targetProjectKey:params.target_project_key,expectedRevision:params.expected_revision,idempotencyKey:"fixture:associate"},token,agentId:"main",params:undefined});
  for(const tool of [read,write])for(const forbidden of ["actor","agentId","catalog_receipt_sha256","catalog_operation_id"])assert.equal(Object.hasOwn(tool.parameters.properties,forbidden),false);
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

test('public ports expose exact typed binding, operation receipt and complete snapshot requests', async () => {
  const calls = [];
  const tools = createConcertoTools({ tokenForAgent: () => token, request: async (call) => { calls.push(call); return {}; } }).forContext({ agentId });
  for (const name of ['concerto_get_operation', 'concerto_bind_work_item_execution', 'concerto_get_project_work_snapshot']) {
    const tool = tools.find((entry) => entry.name === name);
    assert.ok(tool, name);
    assert.equal(tool.parameters.additionalProperties, false);
    assert.equal(Object.hasOwn(tool.parameters.properties, 'is_project_owner'), false);
  }
  await tools.find((entry) => entry.name === 'concerto_get_operation').execute('op', { project_ref: 'shared/test', operation_key: 'key', operation_agent_id: 'aristotle' });
  assert.equal(calls[0].path, '/api/concerto/operations');
  assert.deepEqual(calls[0].query, { projectRef: 'shared/test', operationKey: 'key', operationAgentId: 'aristotle' });
  await tools.find((entry) => entry.name === 'concerto_bind_work_item_execution').execute('bind', { work_item_id: 'id', expected_version: 1, expected_project_revision: 'a'.repeat(32), plan_revision: 2, stage_id: 's', work_package_id: 'wp', idempotency_key: 'key', intake_fingerprint: 'b'.repeat(64) });
  assert.equal(calls[1].path, '/api/concerto/work-items/id/execution-binding');
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].body, { expectedVersion: 1, expectedProjectRevision: 'a'.repeat(32), planRevision: 2, stageId: 's', workPackageId: 'wp', idempotencyKey: 'key', intakeFingerprint: 'b'.repeat(64) });
  await tools.find((entry) => entry.name === 'concerto_get_project_work_snapshot').execute('snapshot', { project_key: 'shared/test', expected_revision: 'c'.repeat(32) });
  assert.equal(calls[2].path, '/api/concerto/project-work-snapshot');
  assert.deepEqual(calls[2].query, { projectKey: 'shared/test', expectedRevision: 'c'.repeat(32) });
});

test('plugin activation manifest advertises the implemented tool inventory', async () => {
  const { readFile } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../openclaw.plugin.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.contracts.tools, CONCERTO_TOOL_NAMES);
});
