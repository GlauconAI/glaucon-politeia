function result(details) {
  return {
    content: [{ type: "text", text: JSON.stringify(details) }],
    details,
  };
}

function schema(required, properties) {
  return { type: "object", additionalProperties: false, required, properties };
}

const uuid = { type: "string", format: "uuid" };
const version = { type: "integer", minimum: 1 };
const idempotencyKey = {
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
};
const agentId = {
  type: "string",
  minLength: 1,
  maxLength: 80,
  pattern: "^[a-z][a-z0-9-]*$",
};

export const CONCERTO_TOOL_DEFINITIONS = {
  concerto_list_work_items: {
    label: "List Concerto Work Items",
    description: "List Concerto Work Items visible to the current Agent.",
    parameters: schema([], {
      state: { enum: ["inbox", "triage", "ready", "in_progress", "review", "done", "blocked", "waiting", "reopened"] },
      project_ref: { type: "string", minLength: 3, maxLength: 160 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    }),
  },
  concerto_get_work_item: {
    label: "Get Concerto Work Item",
    description: "Read one Concerto Work Item visible to the current Agent.",
    parameters: schema(["work_item_id"], { work_item_id: uuid }),
  },
  concerto_create_work_item: {
    label: "Create Concerto Work Item",
    description: "Create a Concerto Inbox Work Item assigned to the current Agent.",
    parameters: schema(
      ["type", "title", "project_ref", "project_version_id", "version_binding_kind", "idempotency_key"],
      {
        type: { enum: ["idea", "feature", "bug"] },
        title: { type: "string", minLength: 1, maxLength: 200 },
        description: { type: "string", maxLength: 4000 },
        project_ref: { type: "string", minLength: 3, maxLength: 160 },
        project_version_id: uuid,
        version_binding_kind: { enum: ["required", "optional"] },
        idempotency_key: idempotencyKey,
      },
    ),
  },
  concerto_update_work_item: {
    label: "Update Concerto Work Item",
    description: "Update mutable fields on a Concerto Work Item the current Agent may manage.",
    parameters: schema(["work_item_id", "expected_version", "idempotency_key"], {
      work_item_id: uuid,
      expected_version: version,
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: "string", maxLength: 4000 },
      acceptance_criteria: { type: "string", maxLength: 4000 },
      priority: { enum: ["low", "medium", "high", "urgent", null] },
      idempotency_key: idempotencyKey,
    }),
  },
  concerto_transition_work_item: {
    label: "Transition Concerto Work Item",
    description: "Move a Concerto Work Item through an allowed lifecycle transition.",
    parameters: schema(["work_item_id", "expected_version", "target_state", "idempotency_key"], {
      work_item_id: uuid,
      expected_version: version,
      target_state: { enum: ["inbox", "triage", "ready", "in_progress", "review", "done", "blocked", "waiting", "reopened"] },
      idempotency_key: idempotencyKey,
    }),
  },
  concerto_assign_work_item: {
    label: "Assign Concerto Work Item",
    description: "Assign a Concerto Work Item to a registered Agent; Project Owner authority is required.",
    parameters: schema(["work_item_id", "expected_version", "assigned_agent_id", "idempotency_key"], {
      work_item_id: uuid,
      expected_version: version,
      assigned_agent_id: agentId,
      idempotency_key: idempotencyKey,
    }),
  },
  concerto_add_evidence: {
    label: "Add Concerto Evidence",
    description: "Attach HTTP(S) evidence to a Concerto Work Item.",
    parameters: schema(["work_item_id", "expected_version", "label", "url", "idempotency_key"], {
      work_item_id: uuid,
      expected_version: version,
      label: { type: "string", minLength: 1, maxLength: 200 },
      url: { type: "string", format: "uri", maxLength: 2048 },
      idempotency_key: idempotencyKey,
    }),
  },
  concerto_claim_work_item: {
    label: "Claim Concerto Work Item",
    description: "Self-claim an eligible Concerto Work Item for the current Agent.",
    parameters: schema(["idempotency_key"], {
      work_item_id: uuid,
      lease_seconds: { type: "integer", minimum: 300, maximum: 3600 },
      idempotency_key: idempotencyKey,
    }),
  },
  concerto_complete_claim: {
    label: "Submit Concerto Work Item for Review",
    description: "Complete the current Agent's active claim, attach evidence, and submit the Work Item to Review.",
    parameters: schema(
      ["claim_id", "expected_claim_version", "expected_work_item_version", "summary", "evidence_url"],
      {
        claim_id: uuid,
        expected_claim_version: version,
        expected_work_item_version: version,
        summary: { type: "string", minLength: 1, maxLength: 2000 },
        evidence_url: { type: "string", format: "uri", maxLength: 2048 },
      },
    ),
  },
};

export const CONCERTO_TOOL_NAMES = Object.freeze(
  Object.keys(CONCERTO_TOOL_DEFINITIONS),
);

function requestFor(name, params) {
  const itemPath = params.work_item_id
    ? `/api/concerto/work-items/${params.work_item_id}`
    : null;
  if (name === "concerto_list_work_items") {
    return {
      method: "GET",
      path: "/api/concerto/work-items",
      query: {
        state: params.state,
        projectRef: params.project_ref,
        limit: params.limit,
      },
    };
  }
  if (name === "concerto_get_work_item") {
    return { method: "GET", path: itemPath };
  }
  if (name === "concerto_create_work_item") {
    return {
      method: "POST",
      path: "/api/concerto/work-items",
      body: {
        type: params.type,
        title: params.title,
        description: params.description ?? "",
        projectRef: params.project_ref,
        projectVersionId: params.project_version_id,
        versionBindingKind: params.version_binding_kind,
        idempotencyKey: params.idempotency_key,
      },
    };
  }
  if (name === "concerto_claim_work_item") {
    return {
      method: "POST",
      path: "/api/dashboard/work-items/claims",
      body: {
        idempotencyKey: params.idempotency_key,
        ...(params.work_item_id ? { workItemId: params.work_item_id } : {}),
        leaseSeconds: params.lease_seconds ?? 900,
      },
    };
  }
  if (name === "concerto_complete_claim") {
    return {
      method: "PATCH",
      path: `/api/dashboard/work-items/claims/${params.claim_id}`,
      body: {
        action: "complete",
        expectedClaimVersion: params.expected_claim_version,
        expectedWorkItemVersion: params.expected_work_item_version,
        summary: params.summary,
        evidenceUrl: params.evidence_url,
      },
    };
  }
  const common = {
    expectedVersion: params.expected_version,
    idempotencyKey: params.idempotency_key,
  };
  const bodies = {
    concerto_update_work_item: {
      action: "update",
      ...common,
      ...(params.title === undefined ? {} : { title: params.title }),
      ...(params.description === undefined ? {} : { description: params.description }),
      ...(params.acceptance_criteria === undefined ? {} : { acceptanceCriteria: params.acceptance_criteria }),
      ...(params.priority === undefined ? {} : { priority: params.priority }),
    },
    concerto_transition_work_item: {
      action: "transition",
      ...common,
      targetState: params.target_state,
    },
    concerto_assign_work_item: {
      action: "assign",
      ...common,
      assignedAgentId: params.assigned_agent_id,
    },
    concerto_add_evidence: {
      action: "add_evidence",
      ...common,
      label: params.label,
      url: params.url,
    },
  };
  return { method: "PATCH", path: itemPath, body: bodies[name] };
}

export function createConcertoTools({ baseUrl, tokenForAgent, request }) {
  void baseUrl;
  return {
    forContext(context = {}) {
      const agent = context.agentId;
      const token = typeof agent === "string" ? tokenForAgent(agent) : null;
      if (!agent || !token) return [];
      return CONCERTO_TOOL_NAMES.map((name) => ({
        name,
        ...CONCERTO_TOOL_DEFINITIONS[name],
        execute: async (_callId, params) => {
          const spec = requestFor(name, params);
          const details = await request({
            ...spec,
            agentId: agent,
            token,
            params:
              params.work_item_id === undefined
                ? undefined
                : { work_item_id: params.work_item_id },
          });
          return result(details);
        },
      }));
    },
  };
}
