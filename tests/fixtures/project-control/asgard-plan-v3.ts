import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

const at = "2026-08-23T20:00:00Z";
const planHash =
  "e4e3062bff73a50fbbbbfbfe0467a7111a875da3a6e76735f11e064ce1b212d9";

type Seed = {
  id: string;
  title: string;
  status: string;
  deps: string[];
  owner: string;
  mode?: "project_executor" | "independent_owner_line";
  critical?: boolean;
};

const seeds: Seed[] = [
  { id: "stage-01-04d", title: "Historical foundations", status: "completed", deps: [], owner: "socrates", critical: true },
  { id: "stage-05a", title: "Science story and character selection", status: "active", deps: ["stage-01-04d"], owner: "aristotle", mode: "independent_owner_line", critical: true },
  { id: "stage-05b", title: "3D board interaction prototype", status: "active", deps: ["stage-01-04d"], owner: "plato", mode: "independent_owner_line", critical: true },
  { id: "stage-06a", title: "Narrative and character text", status: "dependency_blocked", deps: ["stage-05a"], owner: "herodotus", critical: true },
  { id: "stage-06b", title: "Character visual design", status: "dependency_blocked", deps: ["stage-05a"], owner: "alfred" },
  { id: "stage-06c", title: "Board and UI visual design", status: "dependency_blocked", deps: ["stage-05b", "stage-01-04d"], owner: "alfred", critical: true },
  { id: "stage-07a", title: "Cross-domain prototype package", status: "planned", deps: ["stage-06a", "stage-06b", "stage-06c"], owner: "socrates", critical: true },
  { id: "stage-08", title: "Playable implementation", status: "planned", deps: ["stage-07a"], owner: "plato", critical: true },
  { id: "stage-09", title: "Independent verification", status: "planned", deps: ["stage-08"], owner: "socrates", critical: true },
  { id: "stage-10", title: "Playtest and outcome review", status: "planned", deps: ["stage-09"], owner: "socrates", critical: true },
];

function stage(seed: Seed) {
  const mode = seed.mode ?? "project_executor";
  const completed = seed.status === "completed";
  const blocked = seed.status === "dependency_blocked" || seed.status === "planned";
  return {
    stage_id: seed.id,
    plan_revision: 3,
    title: seed.title,
    status: seed.status,
    provenance: completed ? "imported_baseline" : "project_run",
    accountable_owner_agent_id: seed.owner,
    executing_agent_id: seed.status === "active" ? seed.owner : null,
    functional_role: null,
    transfer_mode: mode,
    return_trigger: mode === "independent_owner_line" ? "explicit_user_return" : "terminal_signal",
    current_controller: mode === "independent_owner_line" ? "user_and_owner" : "project_manager",
    execution_line_id: mode === "independent_owner_line" ? "line-" + seed.id : null,
    dependency_ids: seed.deps,
    work_package_ids: seed.id === "stage-05b" ? ["wp-05b-coordinate-slice"] : [],
    artifact_contract_ids: ["artifact-contract-" + seed.id],
    verification_ids: [],
    gate_ids: seed.id === "stage-07a" ? ["gate-3"] : [],
    admission: {
      eligible: seed.status === "active",
      evaluation: completed ? "terminal" : blocked ? "blocked" : "admitted",
      reason_codes: completed ? ["terminal"] : blocked ? ["dependency_missing"] : ["already_admitted"],
      missing_dependency_ids: blocked ? seed.deps : [],
      missing_artifact_contract_ids: [],
      missing_verification_ids: [],
      missing_gate_ids: seed.id === "stage-07a" ? ["gate-3"] : [],
      computed_by: "orchestrator",
      evaluated_at: at,
    },
    critical_path: Boolean(seed.critical),
    started_at: seed.status === "active" ? at : null,
    completed_at: completed ? at : null,
    updated_at: at,
  };
}

export function asgardProjectControlFixture() {
  const stages = seeds.map(stage);
  const artifacts = stages.map((record) => {
    const current = record.status === "completed";
    return {
      artifact_id: "artifact-" + record.stage_id,
      artifact_contract_id: "artifact-contract-" + record.stage_id,
      stage_id: record.stage_id,
      logical_ref: current ? "asgard/" + record.stage_id + "/result" : null,
      sha256: current ? "a".repeat(64) : null,
      version: current ? "v0.1" : null,
      producer_agent_id: current ? record.accountable_owner_agent_id : null,
      status: current ? "current_canonical" : "expected",
      predecessor_artifact_id: null,
      accepted_by_agent_id: current ? "socrates" : null,
      produced_at: current ? at : null,
      accepted_at: current ? at : null,
    };
  });
  const project = {
    project: {
      project_key: "asgard/archaea-gacha-game",
      project_slug: "asgard-archaea-gacha-game",
      title: "Asgard Archaea Game",
      objective: "Build and validate a three-dimensional ecology tactics prototype.",
      authority_source: "openclaw_orchestrator",
      project_manager_agent_id: "socrates",
      accountable_owner_agent_id: "socrates",
      status: "active",
      approved_plan_revision: 3,
      current_plan_revision: 3,
      approved_plan_hash: planHash,
      source_revision: 3,
      freshness: "fresh",
      revision_drift: false,
      current_stage_ids: ["stage-05a", "stage-05b"],
      current_gate_id: "gate-2",
      next_admissible_stage_ids: [],
      updated_at: at,
    },
    plan_revisions: [{ plan_revision: 3, canonical_hash: planHash, approval_status: "approved", approved_at: at, approved_by: "user", source_revision: 3, current: true }],
    stages,
    work_packages: [{
      work_package_id: "wp-05b-coordinate-slice",
      stage_id: "stage-05b",
      plan_revision: 3,
      title: "Coordinate interaction slice",
      scope_summary: "Validate point, edge, and cross-layer selection.",
      acceptance_summary: "Selection, preview, confirmation, and recovery remain deterministic.",
      accountable_owner_agent_id: "plato",
      status: "active",
      evidence_refs: [],
      updated_at: at,
    }],
    execution_lines: ["stage-05a", "stage-05b"].map((stageId) => {
      const record = stages.find((candidate) => candidate.stage_id === stageId)!;
      return {
        execution_line_id: "line-" + stageId,
        stage_id: stageId,
        run_id: null,
        title: record.title,
        accountable_owner_agent_id: record.accountable_owner_agent_id,
        executing_agent_id: record.accountable_owner_agent_id,
        functional_role: null,
        transfer_mode: "independent_owner_line",
        return_trigger: "explicit_user_return",
        current_controller: "user_and_owner",
        status: "transferred",
        user_returned_at: null,
        updated_at: at,
      };
    }),
    dependencies: stages.flatMap((record) =>
      record.dependency_ids.map((from) => ({
        dependency_id: "dep-" + from + "-" + record.stage_id,
        from_stage_id: from,
        to_stage_id: record.stage_id,
        dependency_type: "stage",
        required_ref_id: from,
        status: stages.find((candidate) => candidate.stage_id === from)?.status === "completed" ? "satisfied" : "pending",
        reason_summary: "Requires " + from + ".",
        updated_at: at,
      })),
    ),
    artifacts,
    verifications: [],
    gates: [
      { gate_id: "gate-2", plan_revision: 3, title: "Core direction", stage_id: "stage-01-04d", decision_authority: "user", status: "passed", required_artifact_contract_ids: ["artifact-contract-stage-01-04d"], required_verification_ids: [], missing_artifact_contract_ids: [], missing_verification_ids: [], decision_id: "decision-gate-2", evaluated_at: at },
      { gate_id: "gate-3", plan_revision: 3, title: "Prototype freeze", stage_id: "stage-07a", decision_authority: "user", status: "blocked", required_artifact_contract_ids: ["artifact-contract-stage-05a", "artifact-contract-stage-05b", "artifact-contract-stage-06a", "artifact-contract-stage-06b", "artifact-contract-stage-06c", "artifact-contract-stage-07a"], required_verification_ids: [], missing_artifact_contract_ids: ["artifact-contract-stage-05a", "artifact-contract-stage-05b"], missing_verification_ids: [], decision_id: "decision-gate-3", evaluated_at: at },
    ],
    user_decisions: [
      { decision_id: "decision-gate-2", project_key: "asgard/archaea-gacha-game", stage_id: "stage-01-04d", gate_id: "gate-2", title: "Choose the core direction", question: "Which gameplay direction should become canonical?", status: "recorded", options: [{ option_id: "mutualism-network", label: "Mutualism network", impact_summary: "Freeze the ecology-network direction." }], evidence_complete: true, missing_evidence_refs: [], downstream_stage_ids: ["stage-05a", "stage-05b"], selected_option_id: "mutualism-network", decided_by: "user", decided_at: at, audit_summary: "User selected the mutualism-network direction." },
      { decision_id: "decision-gate-3", project_key: "asgard/archaea-gacha-game", stage_id: "stage-07a", gate_id: "gate-3", title: "Freeze prototype interfaces", question: "Are all six prototype interfaces ready to freeze?", status: "evidence_blocked", options: [{ option_id: "accept", label: "Accept", impact_summary: "Admit playable implementation." }], evidence_complete: false, missing_evidence_refs: ["artifact-contract-stage-05a", "artifact-contract-stage-05b"], downstream_stage_ids: ["stage-08"], selected_option_id: null, decided_by: null, decided_at: null, audit_summary: null },
    ],
    outcome_reviews: [{ outcome_review_id: "outcome-stage-10", stage_id: "stage-10", title: "Prototype outcome", status: "planned", decision: null, evidence_summary: "", reviewed_by: null, reviewed_at: null, follow_up_stage_ids: [] }],
    summary: {
      stage_count: stages.length,
      completed_stage_count: stages.filter((record) => record.status === "completed").length,
      active_stage_count: stages.filter((record) => record.status === "active").length,
      blocked_stage_count: stages.filter((record) => record.status === "dependency_blocked").length,
      ready_stage_count: stages.filter((record) => record.status === "ready").length,
      artifact_count: artifacts.length,
      missing_artifact_count: artifacts.filter((record) => record.status === "expected").length,
      pending_verification_count: 0,
      failed_verification_count: 0,
      pending_decision_count: 1,
    },
    collected_at: at,
  };
  const payload = { schema_version: "1.0.0" as const, collected_at: at, summary: { project_count: 1, ...project.summary }, projects: [project] };
  return { ...payload, digest: createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex") };
}
