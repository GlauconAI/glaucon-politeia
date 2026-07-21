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

const provenance = {
  collected_at: "2026-07-21T22:45:00.000Z",
  digest: "a".repeat(64),
} as const;

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
    expect(() =>
      extractOrchestrationRegistryPayload(
        '<script type="application/json" id="other">{}</script>',
      ),
    ).toThrowError(
      new OrchestrationRegistryError(
        "REGISTRY_SCRIPT_MISSING",
        'Missing <script id="orchestration-registry" type="application/json">.',
      ),
    );
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

    expect(() => parseOrchestrationRegistryHtml(html, provenance)).toThrowError(
      new OrchestrationRegistryError(
        "REGISTRY_JSON_MALFORMED",
        "The orchestration registry script contains malformed JSON.",
      ),
    );
  });

  it("reports unsupported canonical registry schema versions explicitly", () => {
    const html = fixtureHtml.replace(
      '"schema_version": "2.0.0"',
      '"schema_version": "3.0.0"',
    );

    expect(() => parseOrchestrationRegistryHtml(html, provenance)).toThrowError(
      new OrchestrationRegistryError(
        "REGISTRY_SCHEMA_UNSUPPORTED",
        'Unsupported orchestration registry schema version "3.0.0"; expected "2.0.0".',
      ),
    );
  });

  it("reports invalid canonical registry structure explicitly", () => {
    const html = fixtureHtml.replace('"status": "active",', "");

    expect(() => parseOrchestrationRegistryHtml(html, provenance)).toThrowError(
      OrchestrationRegistryError,
    );
    expect(() => parseOrchestrationRegistryHtml(html, provenance)).toThrow(
      /canonical registry structure is invalid/i,
    );
  });
});
