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
  concerto_get_project_association_snapshot: {
    label: "Get Complete Concerto Project Association Snapshot",
    description: "Read all Versions and Items for an approved historical/current Project pair in one revision. Current target Owner only; preserves original and effective keys.",
    parameters: schema(["source_project_key", "target_project_key"], {
      source_project_key: { type: "string", minLength: 3, maxLength: 160 },
      target_project_key: { type: "string", minLength: 3, maxLength: 160 },
      expected_revision: { type: "string", pattern: "^[a-f0-9]{32}$" },
    }),
  },
  concerto_associate_project: {
    label: "Associate Historical Concerto Project",
    description: "Register a pre-approved historical Project association without rewriting frozen Versions/Items or IDs. Current target Owner only; requires exact full snapshot revision and idempotency key. Not a Catalog or directory move.",
    parameters: schema(["source_project_key", "target_project_key", "expected_revision", "idempotency_key"], {
      source_project_key: { type: "string", minLength: 3, maxLength: 160 },
      target_project_key: { type: "string", minLength: 3, maxLength: 160 },
      expected_revision: { type: "string", pattern: "^[a-f0-9]{32}$" },
      idempotency_key: idempotencyKey,
    }),
  },
  concerto_get_operation: {
    label: "Get Concerto Operation Receipt",
    description: "Read an immutable operation receipt in exact actor/project scope; only the current Project Owner may select another actor.",
    parameters: schema(["project_ref", "operation_key"], {
      project_ref: { type: "string", minLength: 3, maxLength: 160 },
      operation_key: idempotencyKey,
      operation_agent_id: agentId,
    }),
  },
  concerto_bind_work_item_execution: {
    label: "Bind Concerto Work Item Execution",
    description: "Bind an eligible Work Item to an exact Plan/Stage/Work Package. Current Project Owner only, atomically checks the complete Project snapshot revision.",
    parameters: schema(["work_item_id", "expected_version", "expected_project_revision", "plan_revision", "stage_id", "work_package_id", "idempotency_key"], {
      work_item_id: uuid,
      expected_version: { ...version, maximum: 2147483647 },
      expected_project_revision: { type: "string", pattern: "^[a-f0-9]{32}$" },
      plan_revision: { type: "integer", minimum: 0, maximum: 2147483647 },
      stage_id: { type: "string", minLength: 1, maxLength: 128 },
      work_package_id: { type: "string", minLength: 1, maxLength: 128 },
      idempotency_key: idempotencyKey,
      intake_fingerprint: { type: "string", pattern: "^[a-f0-9]{64}$" },
    }),
  },
  concerto_get_project_work_snapshot: {
    label: "Get Complete Concerto Project Work Snapshot",
    description: "Read a complete Project Work snapshot with its authoritative revision; current Project Owner only.",
    parameters: schema(["project_key"], {
      project_key: { type: "string", minLength: 3, maxLength: 160 },
      expected_revision: { type: "string", pattern: "^[a-f0-9]{32}$" },
    }),
  },
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
  if (name === "concerto_get_project_association_snapshot") return {
    method: "GET", path: "/api/concerto/project-associations/snapshot",
    query: { sourceProjectKey: params.source_project_key, targetProjectKey: params.target_project_key, expectedRevision: params.expected_revision },
  };
  if (name === "concerto_associate_project") return {
    method: "POST", path: "/api/concerto/project-associations",
    body: { sourceProjectKey: params.source_project_key, targetProjectKey: params.target_project_key, expectedRevision: params.expected_revision, idempotencyKey: params.idempotency_key },
  };
  if (name === "concerto_get_operation") return {
    method: "GET", path: "/api/concerto/operations",
    query: { projectRef: params.project_ref, operationKey: params.operation_key, operationAgentId: params.operation_agent_id },
  };
  if (name === "concerto_get_project_work_snapshot") return {
    method: "GET", path: "/api/concerto/project-work-snapshot",
    query: { projectKey: params.project_key, expectedRevision: params.expected_revision },
  };
  if (name === "concerto_bind_work_item_execution") return {
    method: "POST", path: `/api/concerto/work-items/${params.work_item_id}/execution-binding`,
    body: { expectedVersion: params.expected_version, expectedProjectRevision: params.expected_project_revision,
      planRevision: params.plan_revision, stageId: params.stage_id, workPackageId: params.work_package_id,
      idempotencyKey: params.idempotency_key,
      ...(params.intake_fingerprint === undefined ? {} : { intakeFingerprint: params.intake_fingerprint }),
    },
  };
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
