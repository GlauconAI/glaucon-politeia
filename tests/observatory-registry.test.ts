import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OrchestrationRegistryError,
  extractOrchestrationRegistryPayload,
  parseOrchestrationRegistryHtml,
} from "@/lib/observatory/registry";

const fixturePath = join(
  process.cwd(),
  "tests/fixtures/observatory-registry.html",
);
const fixtureHtml = readFileSync(fixturePath, "utf8");
const expectedFixturePayload = `{
  "schema_version": "2.0.0",
  "registry_version": "fixture-2026-07-21.v2",
  "source_policy": {
    "canonical_file": "orchestration-system-design.html",
    "edit_direction": "html_to_yaml_only",
    "generated_files_do_not_edit": true
  },
  "execution_flows": [
    {
      "id": "fast",
      "name": "Fast Flow",
      "tier_label": "Executor direct",
      "merged_note": null,
      "use_when": "The task is bounded.",
      "controller": "The executor controls the task.",
      "subagent_structure": "No subagent is required.",
      "core_output": "One artifact.",
      "topology": "executor_direct",
      "team_allowed": false,
      "completion_requirements": [
        "artifact",
        "verification"
      ]
    },
    {
      "id": "project",
      "name": "Project Flow",
      "tier_label": "Approved stage DAG",
      "merged_note": null,
      "use_when": "The goal spans approved stages.",
      "controller": "The project manager maintains the plan.",
      "subagent_structure": "Approved stages create stage runs.",
      "core_output": "Plan, artifacts, and gate evidence.",
      "topology": "approved_plan_stage_dag",
      "team_allowed": true,
      "completion_requirements": [
        "approved_plan_hash",
        "verification"
      ]
    }
  ],
  "scene_groups": [
    {
      "owner": "Socrates",
      "focus": "System governance",
      "shared": false,
      "scenes": [
        {
          "id": "S01",
          "name": "Product strategy",
          "flow": "Deep Task Flow",
          "description": "Define product boundaries.",
          "recommended_stage_owner": "main"
        }
      ]
    },
    {
      "owner": "Owner Team",
      "focus": "Engineering",
      "scenes": [
        {
          "id": "S13",
          "name": "Software implementation",
          "flow": "Project Flow",
          "stageModel": "product-project",
          "description": "Turn approved artifacts into tested code.",
          "recommended_stage_owner": "plato",
          "shared": true
        }
      ]
    }
  ],
  "product_project_stages": [
    {
      "id": "S36.1",
      "key": "problem",
      "title": "Problem framing",
      "recommended_stage_owner": "socrates",
      "scene_refs": [
        "S01"
      ],
      "recommended_flows": [
        "Deep Task Flow"
      ]
    }
  ],
  "project_groups": [
    {
      "owner": "Socrates",
      "focus": "System governance",
      "root": "/Users/private/Glaucon Vault/socrates-agora/projects",
      "projects": [
        {
          "name": "governance",
          "title": "Governance",
          "status": "active",
          "description": "Maintain governance baselines.",
          "scenes": [
            "S01"
          ],
          "private_runtime_field": "must-not-escape"
        }
      ]
    },
    {
      "owner": "Owner Team",
      "focus": "Engineering",
      "root": "/Users/private/Glaucon Vault/plato-academy/projects",
      "projects": [
        {
          "name": "alpha",
          "status": "maintained",
          "description": "Build Alpha.",
          "scenes": [
            "S13",
            "S01"
          ],
          "review_scenes": {
            "S01": "Review this declared mapping."
          }
        },
        {
          "name": "beta",
          "title": "Beta",
          "status": "reference",
          "description": "Keep Beta as a reference.",
          "scenes": [
            "S13"
          ],
          "mapping_incomplete": true,
          "mapping_review_note": "No inferred mapping is allowed."
        }
      ]
    }
  ],
  "policy": {
    "private_runtime_details": "must-not-escape"
  },
  "model_tiers": [
    {
      "id": "private-model",
      "model": "must-not-escape"
    }
  ],
  "functional_roles": {
    "base": [],
    "aliases": []
  },
  "agents": [
    {
      "id": "private-agent-runtime",
      "session": "must-not-escape"
    }
  ]
}`;

type MutableFixtureRegistry = {
  project_groups: Array<{
    owner: string;
    projects: Array<{ name: string; [key: string]: unknown }>;
  }>;
  scene_groups: Array<{
    scenes: Array<{ id: string; [key: string]: unknown }>;
  }>;
};

function fixtureHtmlWith(
  mutate: (registry: MutableFixtureRegistry) => void,
): string {
  const registry = JSON.parse(expectedFixturePayload) as MutableFixtureRegistry;
  mutate(registry);
  return `<script id="orchestration-registry" type="application/json">${JSON.stringify(registry)}</script>`;
}

const provenance = {
  collected_at: "2026-07-21T22:45:00.000Z",
  digest: "a".repeat(64),
} as const;

function captureRegistryError(action: () => unknown): OrchestrationRegistryError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(OrchestrationRegistryError);
    if (error instanceof OrchestrationRegistryError) {
      return error;
    }
    throw error;
  }

  throw new Error("Expected an OrchestrationRegistryError.");
}

describe("extractOrchestrationRegistryPayload", () => {
  it("extracts the exact application/json script payload with the canonical id", () => {
    expect(extractOrchestrationRegistryPayload(fixtureHtml)).toBe(
      expectedFixturePayload,
    );
  });

  it("does not truncate JSON string content that only starts like a closing tag", () => {
    const payload = '{"value":"</scripture>"}';
    const html = `<script id="orchestration-registry" type="application/json">${payload}</script>`;

    expect(extractOrchestrationRegistryPayload(html)).toBe(payload);
  });

  it("reports an explicit error when the canonical script is missing", () => {
    const error = captureRegistryError(() =>
      extractOrchestrationRegistryPayload(
        '<script type="application/json" id="other">{}</script>',
      ),
    );

    expect(error.code).toBe("REGISTRY_SCRIPT_MISSING");
    expect(error.message).toBe(
      'Missing <script id="orchestration-registry" type="application/json">.',
    );
  });

  it("rejects duplicate complete canonical registry scripts", () => {
    const script =
      '<script id="orchestration-registry" type="application/json">{}</script>';
    const error = captureRegistryError(() =>
      extractOrchestrationRegistryPayload(`${script}${script}`),
    );

    expect(error.code).toBe("REGISTRY_SCRIPT_DUPLICATE");
    expect(error.message).toMatch(/exactly one.*found 2/i);
  });

  it("rejects duplicate id or type attributes on a relevant script", () => {
    const htmlCases = [
      '<script id="orchestration-registry" id="other" type="application/json">{}</script>',
      '<script id="orchestration-registry" type="application/json" type="text/plain">{}</script>',
    ];

    for (const html of htmlCases) {
      const error = captureRegistryError(() =>
        extractOrchestrationRegistryPayload(html),
      );
      expect(error.code).toBe("REGISTRY_SCRIPT_ATTRIBUTES_DUPLICATE");
      expect(error.message).toMatch(/duplicate (id|type) attribute/i);
    }
  });

  it("reports an unterminated canonical registry script separately", () => {
    const error = captureRegistryError(() =>
      extractOrchestrationRegistryPayload(
        '<script id="orchestration-registry" type="application/json">{}',
      ),
    );

    expect(error.code).toBe("REGISTRY_SCRIPT_UNTERMINATED");
    expect(error.message).toMatch(/unterminated/i);
  });
});

describe("parseOrchestrationRegistryHtml", () => {
  it("returns correct project, primary/secondary scene, and flow summaries", () => {
    const snapshot = parseOrchestrationRegistryHtml(fixtureHtml, provenance);

    expect(snapshot.summary).toEqual({
      project_count: 3,
      primary_scene_count: 2,
      secondary_scene_count: 1,
      execution_flow_count: 2,
    });
  });

  it("preserves canonical scene and flow ids and only explicit scene relationships", () => {
    const snapshot = parseOrchestrationRegistryHtml(fixtureHtml, provenance);

    expect(snapshot.scenes.map((scene) => scene.id)).toEqual(["S01", "S13"]);
    expect(snapshot.execution_flows.map((flow) => flow.id)).toEqual([
      "fast",
      "project",
    ]);
    expect(snapshot.project_groups[1].projects[0].scene_ids).toEqual([
      "S13",
      "S01",
    ]);
  });

  it("derives deterministic project keys without representing them as canonical ids", () => {
    const snapshot = parseOrchestrationRegistryHtml(fixtureHtml, provenance);

    expect(snapshot.project_groups[1].projects.map((project) => project.project_key)).toEqual(
      ["owner-team/alpha", "owner-team/beta"],
    );
    expect(snapshot.project_groups[1].projects[0]).not.toHaveProperty("id");
  });

  it("preserves Unicode project names in deterministic derived keys", () => {
    const html = fixtureHtmlWith((registry) => {
      registry.project_groups[1].projects[0].name = "长期健康资料";
    });
    const snapshot = parseOrchestrationRegistryHtml(html, provenance);

    expect(snapshot.project_groups[1].projects[0].project_key).toBe(
      "owner-team/长期健康资料",
    );
    expect(snapshot.project_groups[1].projects[0].name).toBe("长期健康资料");
  });

  it("preserves canonical leading whitespace in original project names", () => {
    const html = fixtureHtmlWith((registry) => {
      registry.project_groups[1].projects[0].name = " Dream Builder Daycare";
    });
    const snapshot = parseOrchestrationRegistryHtml(html, provenance);

    expect(snapshot.project_groups[1].projects[0].project_key).toBe(
      "owner-team/ Dream Builder Daycare",
    );
    expect(snapshot.project_groups[1].projects[0].name).toBe(
      " Dream Builder Daycare",
    );
  });

  it("rejects project keys when owner normalization is empty", () => {
    const html = fixtureHtmlWith((registry) => {
      registry.project_groups[1].owner = "---";
    });
    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(html, provenance),
    );

    expect(error.code).toBe("REGISTRY_PROJECT_KEY_INVALID");
    expect(error.message).toMatch(/owner cannot produce a project key/i);
  });

  it("rejects slash-delimited owner or project-name key inputs", () => {
    for (const html of [
      fixtureHtmlWith((registry) => {
        registry.project_groups[1].owner = "Owner/Team";
      }),
      fixtureHtmlWith((registry) => {
        registry.project_groups[1].projects[0].name = "alpha/child";
      }),
    ]) {
      const error = captureRegistryError(() =>
        parseOrchestrationRegistryHtml(html, provenance),
      );
      expect(error.code).toBe("REGISTRY_PROJECT_KEY_INVALID");
      expect(error.message).toMatch(/slash/i);
    }
  });

  it("rejects collisions between deterministic derived project keys", () => {
    const html = fixtureHtmlWith((registry) => {
      registry.project_groups[1].projects[1].name = "alpha";
    });
    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(html, provenance),
    );

    expect(error.code).toBe("REGISTRY_PROJECT_KEY_COLLISION");
    expect(error.message).toContain('"owner-team/alpha"');
  });

  it("excludes absolute roots and unrelated private registry fields", () => {
    const snapshot = parseOrchestrationRegistryHtml(fixtureHtml, provenance);
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain("/Users/private");
    expect(serialized).not.toContain("private_runtime_field");
    expect(serialized).not.toContain("private-model");
    expect(serialized).not.toContain("private-agent-runtime");
    expect(snapshot.project_groups[0]).not.toHaveProperty("root");
  });

  it("reports malformed registry JSON explicitly", () => {
    const html =
      '<script id="orchestration-registry" type="application/json">{"broken":</script>';
    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(html, provenance),
    );

    expect(error.code).toBe("REGISTRY_JSON_MALFORMED");
    expect(error.message).toBe(
      "The orchestration registry script contains malformed JSON.",
    );
  });

  it("reports unsupported canonical registry schema versions explicitly", () => {
    const html = fixtureHtml.replace(
      '"schema_version": "2.0.0"',
      '"schema_version": "3.0.0"',
    );

    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(html, provenance),
    );

    expect(error.code).toBe("REGISTRY_SCHEMA_UNSUPPORTED");
    expect(error.message).toBe(
      'Unsupported orchestration registry schema version "3.0.0"; expected "2.0.0".',
    );
  });

  it("reports invalid canonical registry structure explicitly", () => {
    const html = fixtureHtml.replace('"status": "active",', "");

    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(html, provenance),
    );

    expect(error.code).toBe("REGISTRY_SCHEMA_INVALID");
    expect(error.message).toMatch(/canonical registry structure is invalid/i);
  });

  it("reports invalid provenance with a stable public code and message", () => {
    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(fixtureHtml, {
        ...provenance,
        collected_at: "2026-02-30T22:45:00.000Z",
      }),
    );

    expect(error.code).toBe("REGISTRY_PROVENANCE_INVALID");
    expect(error.message).toMatch(/registry provenance is invalid/i);
  });

  it("wraps final snapshot validation with a stable public code and message", () => {
    const html = fixtureHtmlWith((registry) => {
      registry.scene_groups[1].scenes[0].id = "S01";
    });
    const error = captureRegistryError(() =>
      parseOrchestrationRegistryHtml(html, provenance),
    );

    expect(error.code).toBe("REGISTRY_SNAPSHOT_INVALID");
    expect(error.message).toMatch(/generated registry snapshot is invalid/i);
    expect(error.message).toContain("scenes.1.id");
  });
});
