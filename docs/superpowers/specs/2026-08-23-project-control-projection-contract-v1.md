# Project Control Public Projection Contract 1.0.0

**Producer:** OpenClaw Orchestrator

**Consumer:** 402V Observatory

**Transport:** one bounded JSON file, `project-control-snapshot.json`

**Authority:** producer facts are read-only in 402V

## 1. Envelope

```ts
interface ProjectControlSnapshotV1 {
  schema_version: "1.0.0";
  collected_at: IsoTimestamp;
  summary: ProjectControlSummary;
  projects: ProjectControlProject[];
  digest: Sha256;
}
```

`digest` is SHA-256 over canonical JSON of the complete envelope excluding `digest`. Canonical JSON recursively sorts object keys and preserves array order.

Limits:

- file: 10 MiB;
- Projects: 128;
- per-Project Stages, Work Packages, Execution Lines, Dependencies, Artifacts, Verifications, Gates, Decisions, and Outcomes: 512 each;
- safe display text: 1–1024 characters unless a smaller field limit is stated;
- summaries: 0–4096 characters;
- IDs: 1–128 characters matching `[A-Za-z0-9][A-Za-z0-9._:-]*`;
- arrays contain no duplicate IDs.

## 2. Project

```ts
interface ProjectControlProject {
  project: {
    project_key: SafeProjectKey;
    project_slug: SafeId;
    title: SafeText;
    objective: SafeSummary;
    authority_source: "openclaw_orchestrator";
    project_manager_agent_id: SafeId;
    accountable_owner_agent_id: SafeId;
    status: "planned" | "active" | "paused" | "completed" | "cancelled";
    approved_plan_revision: number;
    current_plan_revision: number;
    approved_plan_hash: Sha256;
    source_revision: number;
    freshness: "fresh" | "stale";
    revision_drift: boolean;
    current_stage_ids: SafeId[];
    current_gate_id: SafeId | null;
    next_admissible_stage_ids: SafeId[];
    updated_at: IsoTimestamp;
  };
  plan_revisions: PlanRevision[];
  stages: Stage[];
  work_packages: WorkPackageContract[];
  execution_lines: AgentExecutionLine[];
  dependencies: Dependency[];
  artifacts: Artifact[];
  verifications: Verification[];
  gates: Gate[];
  user_decisions: UserDecision[];
  outcome_reviews: OutcomeReview[];
  summary: ProjectSummary;
  collected_at: IsoTimestamp;
}
```

Invariants:

- `project_slug` and `project_key` are unique across the envelope;
- `approved_plan_revision` references one `plan_revisions` entry with `approval_status=approved` and matching hash;
- `revision_drift` equals `current_plan_revision !== approved_plan_revision`;
- every current/next Stage and current Gate ID resolves inside the Project;
- `collected_at` equals the envelope timestamp.

## 3. Plan Revision

```ts
interface PlanRevision {
  plan_revision: number;
  canonical_hash: Sha256;
  approval_status: "draft" | "approved" | "superseded" | "rejected";
  approved_at: IsoTimestamp | null;
  approved_by: "user" | null;
  source_revision: number;
  current: boolean;
}
```

Exactly one revision is `current=true`. Exactly one revision matches `approved_plan_revision` unless the Project is still `planned` without an approved plan; P0 production adoption requires an approved revision.

## 4. Stage

```ts
type StageStatus =
  | "planned"
  | "dependency_blocked"
  | "ready"
  | "admitted"
  | "active"
  | "waiting_input"
  | "verifying"
  | "completed"
  | "cancelled";

interface Stage {
  stage_id: SafeId;
  plan_revision: number;
  title: SafeText;
  status: StageStatus;
  provenance: "project_run" | "imported_baseline";
  accountable_owner_agent_id: SafeId;
  executing_agent_id: SafeId | null;
  functional_role: SafeText | null;
  transfer_mode: "project_executor" | "independent_owner_line";
  return_trigger: "terminal_signal" | "explicit_user_return";
  current_controller:
    | "project_manager"
    | "executing_agent"
    | "user_and_owner"
    | "user";
  execution_line_id: SafeId | null;
  dependency_ids: SafeId[];
  work_package_ids: SafeId[];
  artifact_contract_ids: SafeId[];
  verification_ids: SafeId[];
  gate_ids: SafeId[];
  admission: StageAdmission;
  critical_path: boolean;
  started_at: IsoTimestamp | null;
  completed_at: IsoTimestamp | null;
  updated_at: IsoTimestamp;
}

interface StageAdmission {
  eligible: boolean;
  evaluation: "blocked" | "candidate" | "admitted" | "terminal";
  reason_codes: Array<
    | "dependency_missing"
    | "artifact_missing"
    | "verification_missing"
    | "gate_missing"
    | "user_return_missing"
    | "revision_drift"
    | "already_admitted"
    | "terminal"
  >;
  missing_dependency_ids: SafeId[];
  missing_artifact_contract_ids: SafeId[];
  missing_verification_ids: SafeId[];
  missing_gate_ids: SafeId[];
  computed_by: "orchestrator";
  evaluated_at: IsoTimestamp;
}
```

Transfer invariants:

- `project_executor` requires `return_trigger=terminal_signal`; controller is `project_manager` while planned/ready and `executing_agent` while admitted/active/waiting/verifying, then returns to `project_manager` after the terminal signal;
- `independent_owner_line` requires `return_trigger=explicit_user_return` and controller `user_and_owner` until a formal User return is recorded;
- 402V does not reinterpret these combinations.

Status invariants:

- `completed` requires `completed_at`;
- non-completed status has `completed_at=null`;
- `imported_baseline` may be completed without a current Run but must not claim a fabricated start time;
- `eligible=true` requires no missing arrays and no blocking reason code;
- `evaluation=terminal` requires `status` completed or cancelled.

## 5. Work Package contract

```ts
interface WorkPackageContract {
  work_package_id: SafeId;
  stage_id: SafeId;
  plan_revision: number;
  title: SafeText;
  scope_summary: SafeSummary;
  acceptance_summary: SafeSummary;
  accountable_owner_agent_id: SafeId;
  status: "planned" | "ready" | "active" | "review" | "completed" | "cancelled";
  evidence_refs: LogicalRef[];
  updated_at: IsoTimestamp;
}
```

This is the Orchestrator's public Work Package contract. A 402V Work Item may bind to it, but its local nine-state workflow remains separate.

## 6. Agent Execution Line

```ts
interface AgentExecutionLine {
  execution_line_id: SafeId;
  stage_id: SafeId;
  run_id: SafeId | null;
  title: SafeText;
  accountable_owner_agent_id: SafeId;
  executing_agent_id: SafeId | null;
  functional_role: SafeText | null;
  transfer_mode: "project_executor" | "independent_owner_line";
  return_trigger: "terminal_signal" | "explicit_user_return";
  current_controller:
    | "project_manager"
    | "executing_agent"
    | "user_and_owner"
    | "user";
  status:
    | "planned"
    | "ready"
    | "active"
    | "waiting_input"
    | "verifying"
    | "completed"
    | "blocked"
    | "cancelled"
    | "transferred"
    | "returned";
  user_returned_at: IsoTimestamp | null;
  updated_at: IsoTimestamp;
}
```

An independent line may be `transferred` without being terminal for the parent Project. It becomes `returned` only after an explicit User return fact.

## 7. Dependency

```ts
interface Dependency {
  dependency_id: SafeId;
  from_stage_id: SafeId;
  to_stage_id: SafeId;
  dependency_type: "stage" | "artifact" | "verification" | "gate" | "user_return";
  required_ref_id: SafeId;
  status: "pending" | "satisfied" | "waived";
  reason_summary: SafeSummary;
  updated_at: IsoTimestamp;
}
```

Stage dependency edges must be acyclic. `waived` requires a recorded Decision reference through the related Gate or Decision model; P0 does not create waivers.

## 8. Artifact

```ts
interface Artifact {
  artifact_id: SafeId;
  artifact_contract_id: SafeId;
  stage_id: SafeId;
  logical_ref: LogicalRef | null;
  sha256: Sha256 | null;
  version: SafeText | null;
  producer_agent_id: SafeId | null;
  status: "expected" | "candidate" | "current_canonical" | "superseded" | "rejected";
  predecessor_artifact_id: SafeId | null;
  accepted_by_agent_id: SafeId | null;
  produced_at: IsoTimestamp | null;
  accepted_at: IsoTimestamp | null;
}
```

Invariants:

- at most one `current_canonical` per `artifact_contract_id`;
- current canonical requires `logical_ref`, `sha256`, producer, produced time, accepter, and accepted time;
- `expected` has no digest and no acceptance facts;
- predecessor references remain within the same contract.

## 9. Verification

```ts
interface Verification {
  verification_id: SafeId;
  stage_id: SafeId;
  artifact_ids: SafeId[];
  mode: "producer" | "machine" | "independent";
  verifier_agent_id: SafeId | null;
  status: "pending" | "passed" | "failed";
  evidence_summary: SafeSummary;
  failure_reason: SafeSummary | null;
  verified_at: IsoTimestamp | null;
}
```

`passed` requires verifier and timestamp and has no failure reason. `failed` requires verifier, timestamp, and failure reason. `pending` has no verification timestamp.

## 10. Gate

```ts
interface Gate {
  gate_id: SafeId;
  plan_revision: number;
  title: SafeText;
  stage_id: SafeId | null;
  decision_authority: "user" | "project_manager";
  status: "blocked" | "ready" | "passed" | "failed";
  required_artifact_contract_ids: SafeId[];
  required_verification_ids: SafeId[];
  missing_artifact_contract_ids: SafeId[];
  missing_verification_ids: SafeId[];
  decision_id: SafeId | null;
  evaluated_at: IsoTimestamp;
}
```

`ready` means evidence complete. A User-owned Gate can be `passed` or `failed` only with a linked recorded User Decision.

## 11. User Decision

```ts
interface UserDecision {
  decision_id: SafeId;
  project_key: SafeProjectKey;
  stage_id: SafeId | null;
  gate_id: SafeId | null;
  title: SafeText;
  question: SafeSummary;
  status: "evidence_blocked" | "pending" | "ready" | "recorded";
  options: Array<{
    option_id: SafeId;
    label: SafeText;
    impact_summary: SafeSummary;
  }>;
  evidence_complete: boolean;
  missing_evidence_refs: SafeId[];
  downstream_stage_ids: SafeId[];
  selected_option_id: SafeId | null;
  decided_by: "user" | null;
  decided_at: IsoTimestamp | null;
  audit_summary: SafeSummary | null;
}
```

`recorded` requires selected option, `decided_by=user`, decision time, and audit summary. Non-recorded decisions have all four fields null. A decision with missing evidence cannot be `ready`.

## 12. Outcome Review

```ts
interface OutcomeReview {
  outcome_review_id: SafeId;
  stage_id: SafeId | null;
  title: SafeText;
  status: "planned" | "recorded";
  decision: "continue" | "revise_and_retest" | "change_framework" | "stop" | null;
  evidence_summary: SafeSummary;
  reviewed_by: "user" | null;
  reviewed_at: IsoTimestamp | null;
  follow_up_stage_ids: SafeId[];
}
```

Recorded outcomes require decision, reviewer, and timestamp. Planned outcomes keep those fields null.

## 13. Summary

```ts
interface ProjectControlSummary {
  project_count: number;
  stage_count: number;
  completed_stage_count: number;
  active_stage_count: number;
  blocked_stage_count: number;
  ready_stage_count: number;
  artifact_count: number;
  missing_artifact_count: number;
  pending_verification_count: number;
  failed_verification_count: number;
  pending_decision_count: number;
}

interface ProjectSummary extends Omit<ProjectControlSummary, "project_count"> {}
```

All summary counts are derived from validated records and must match exactly.

## 14. Public text and reference safety

`SafeText`, `SafeSummary`, and `LogicalRef` reject:

- control characters;
- POSIX, Windows drive, UNC, home, `file://`, workspace, Vault, and private path forms;
- Telegram/session identifiers;
- private Thin Work IDs and operation IDs;
- credentials, cookies, tokens, and raw message fields.

`LogicalRef` is a bounded logical identifier such as `asgard/stage-05b/prototype-v0.1`; it is not a filesystem path. Unknown object fields fail strict validation.

## 15. Asgard v3 exact adoption requirements

The first production payload must encode:

- approved Plan revision `3` and its canonical hash;
- Stage 01–04D as completed imported baseline where applicable;
- Gate 2 passed with its recorded User decision;
- Stage 05A and 05B as `independent_owner_line`, `explicit_user_return`, and `user_and_owner`, without implying that the PM is waiting;
- Stage 06A blocked by 05A User return;
- Stage 06B blocked by 05A role-selection return;
- Stage 06C blocked by 05B plus frozen 04D input;
- Stage 07A, Gate 3, 08, 09, and 10 as planned according to the approved DAG;
- Gate 3's six frozen interfaces as required Artifact contracts or decision evidence;
- no Stage 06 admission before the actual dependencies are returned and accepted;
- no private Work ID, session key, absolute path, raw message, or credential.
