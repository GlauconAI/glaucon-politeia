import { createHash } from "node:crypto";

import { z } from "zod";

import { containsAbsoluteOrPrivatePath } from "#observatory-privacy-path";
import { scanObservatoryPrivacy } from "#observatory-privacy-scan";

export const PROJECT_CONTROL_SCHEMA_VERSION = "1.0.0" as const;
export const PROJECT_CONTROL_MAX_PROJECTS = 128;
export const PROJECT_CONTROL_MAX_RECORDS = 512;

const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const SafeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/iu);
const SafeProjectKeySchema = z
  .string()
  .min(3)
  .max(256)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const forbiddenReference =
  /(?:^|[^a-z])work_[a-f0-9]{24}(?:$|[^a-z])|telegram:direct|owner_session_key|operation_id/iu;
const safeString = (max: number, allowEmpty = false) =>
  z
    .string()
    .min(allowEmpty ? 0 : 1)
    .max(max)
    .refine(
      (value) =>
        !/[\u0000-\u001f\u007f]/u.test(value) &&
        !forbiddenReference.test(value) &&
        !containsAbsoluteOrPrivatePath(value) &&
        Object.values(scanObservatoryPrivacy(value)).every((count) => count === 0),
      "Expected privacy-safe public text.",
    );
const SafeTextSchema = safeString(1024);
const SafeSummarySchema = safeString(4096, true);
const LogicalRefSchema = safeString(1024);
const ids = () =>
  z
    .array(SafeIdSchema)
    .max(PROJECT_CONTROL_MAX_RECORDS)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: "Reference IDs must be unique." });
      }
    });

const PlanRevisionSchema = z.strictObject({
  plan_revision: z.number().int().nonnegative(),
  canonical_hash: Sha256Schema,
  approval_status: z.enum(["draft", "approved", "superseded", "rejected"]),
  approved_at: IsoTimestampSchema.nullable(),
  approved_by: z.literal("user").nullable(),
  source_revision: z.number().int().nonnegative(),
  current: z.boolean(),
}).superRefine((plan, context) => {
  const approvalFacts = [plan.approved_at, plan.approved_by];
  const completeApproval = approvalFacts.every(Boolean);
  const emptyApproval = approvalFacts.every((fact) => fact === null);
  if (
    (plan.approval_status === "approved" && !completeApproval) ||
    (!completeApproval && !emptyApproval)
  ) {
    context.addIssue({ code: "custom", message: "Plan approval facts drift." });
  }
});

export const StageStatusSchema = z.enum([
  "planned",
  "dependency_blocked",
  "ready",
  "admitted",
  "active",
  "waiting_input",
  "verifying",
  "completed",
  "cancelled",
]);

const AdmissionSchema = z
  .strictObject({
    eligible: z.boolean(),
    evaluation: z.enum(["blocked", "candidate", "admitted", "terminal"]),
    reason_codes: z
      .array(
        z.enum([
          "dependency_missing",
          "artifact_missing",
          "verification_missing",
          "gate_missing",
          "user_return_missing",
          "revision_drift",
          "already_admitted",
          "terminal",
        ]),
      )
      .max(16),
    missing_dependency_ids: ids(),
    missing_artifact_contract_ids: ids(),
    missing_verification_ids: ids(),
    missing_gate_ids: ids(),
    computed_by: z.literal("orchestrator"),
    evaluated_at: IsoTimestampSchema,
  })
  .superRefine((admission, context) => {
    const missing =
      admission.missing_dependency_ids.length +
      admission.missing_artifact_contract_ids.length +
      admission.missing_verification_ids.length +
      admission.missing_gate_ids.length;
    if (admission.eligible && missing > 0) {
      context.addIssue({ code: "custom", message: "Eligible admission cannot have missing contracts." });
    }
    if (
      admission.eligible &&
      admission.reason_codes.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["reason_codes"],
        message: "Eligible admission cannot carry a blocking reason.",
      });
    }
  });

const transferMode = z.enum(["project_executor", "independent_owner_line"]);
const returnTrigger = z.enum(["terminal_signal", "explicit_user_return"]);
const controller = z.enum([
  "project_manager",
  "executing_agent",
  "user_and_owner",
  "user",
]);

const StageSchema = z
  .strictObject({
    stage_id: SafeIdSchema,
    plan_revision: z.number().int().nonnegative(),
    title: SafeTextSchema,
    status: StageStatusSchema,
    provenance: z.enum(["project_run", "imported_baseline"]),
    accountable_owner_agent_id: SafeIdSchema,
    executing_agent_id: SafeIdSchema.nullable(),
    functional_role: SafeTextSchema.nullable(),
    transfer_mode: transferMode,
    return_trigger: returnTrigger,
    current_controller: controller,
    execution_line_id: SafeIdSchema.nullable(),
    dependency_ids: ids(),
    work_package_ids: ids(),
    artifact_contract_ids: ids(),
    verification_ids: ids(),
    gate_ids: ids(),
    admission: AdmissionSchema,
    critical_path: z.boolean(),
    started_at: IsoTimestampSchema.nullable(),
    completed_at: IsoTimestampSchema.nullable(),
    updated_at: IsoTimestampSchema,
  })
  .superRefine((stage, context) => {
    if (
      stage.transfer_mode === "independent_owner_line" &&
      (stage.return_trigger !== "explicit_user_return" ||
        stage.current_controller !== "user_and_owner")
    ) {
      context.addIssue({ code: "custom", message: "Independent owner control semantics are invalid." });
    }
    if (
      stage.transfer_mode === "project_executor" &&
      stage.return_trigger !== "terminal_signal"
    ) {
      context.addIssue({ code: "custom", message: "Project executor return semantics are invalid." });
    }
    if (stage.transfer_mode === "project_executor") {
      const agentControlled = [
        "admitted",
        "active",
        "waiting_input",
        "verifying",
      ].includes(stage.status);
      const expectedController = agentControlled
        ? "executing_agent"
        : "project_manager";
      if (stage.current_controller !== expectedController) {
        context.addIssue({
          code: "custom",
          path: ["current_controller"],
          message: "Project executor controller does not match Stage status.",
        });
      }
      if (agentControlled && !stage.executing_agent_id) {
        context.addIssue({
          code: "custom",
          path: ["executing_agent_id"],
          message: "Agent-controlled Stage requires an executing Agent.",
        });
      }
    }
    const terminal = ["completed", "cancelled"].includes(stage.status);
    if ((stage.admission.evaluation === "terminal") !== terminal) {
      context.addIssue({
        code: "custom",
        path: ["admission", "evaluation"],
        message: "Terminal admission evaluation does not match Stage status.",
      });
    }
    if ((stage.status === "completed") !== Boolean(stage.completed_at)) {
      context.addIssue({ code: "custom", path: ["completed_at"], message: "Completed timestamp drift." });
    }
  });

const WorkPackageSchema = z.strictObject({
  work_package_id: SafeIdSchema,
  stage_id: SafeIdSchema,
  plan_revision: z.number().int().nonnegative(),
  title: SafeTextSchema,
  scope_summary: SafeSummarySchema,
  acceptance_summary: SafeSummarySchema,
  accountable_owner_agent_id: SafeIdSchema,
  status: z.enum(["planned", "ready", "active", "review", "completed", "cancelled"]),
  evidence_refs: z.array(LogicalRefSchema).max(64),
  updated_at: IsoTimestampSchema,
});

const ExecutionLineSchema = z
  .strictObject({
    execution_line_id: SafeIdSchema,
    stage_id: SafeIdSchema,
    run_id: SafeIdSchema.nullable(),
    title: SafeTextSchema,
    accountable_owner_agent_id: SafeIdSchema,
    executing_agent_id: SafeIdSchema.nullable(),
    functional_role: SafeTextSchema.nullable(),
    transfer_mode: transferMode,
    return_trigger: returnTrigger,
    current_controller: controller,
    status: z.enum([
      "planned",
      "ready",
      "active",
      "waiting_input",
      "verifying",
      "completed",
      "blocked",
      "cancelled",
      "transferred",
      "returned",
    ]),
    user_returned_at: IsoTimestampSchema.nullable(),
    updated_at: IsoTimestampSchema,
  })
  .superRefine((line, context) => {
    if (
      line.transfer_mode === "independent_owner_line" &&
      (line.return_trigger !== "explicit_user_return" ||
        !["user_and_owner", "user"].includes(line.current_controller))
    ) {
      context.addIssue({ code: "custom", message: "Independent line semantics are invalid." });
    }
    if (
      line.transfer_mode === "project_executor" &&
      line.return_trigger !== "terminal_signal"
    ) {
      context.addIssue({ code: "custom", message: "Project executor line semantics are invalid." });
    }
    if ((line.status === "returned") !== Boolean(line.user_returned_at)) {
      context.addIssue({ code: "custom", path: ["user_returned_at"], message: "User return facts drift." });
    }
  });

const DependencySchema = z.strictObject({
  dependency_id: SafeIdSchema,
  from_stage_id: SafeIdSchema,
  to_stage_id: SafeIdSchema,
  dependency_type: z.enum(["stage", "artifact", "verification", "gate", "user_return"]),
  required_ref_id: SafeIdSchema,
  status: z.enum(["pending", "satisfied", "waived"]),
  reason_summary: SafeSummarySchema,
  updated_at: IsoTimestampSchema,
});

const ArtifactSchema = z
  .strictObject({
    artifact_id: SafeIdSchema,
    artifact_contract_id: SafeIdSchema,
    stage_id: SafeIdSchema,
    logical_ref: LogicalRefSchema.nullable(),
    sha256: Sha256Schema.nullable(),
    version: SafeTextSchema.nullable(),
    producer_agent_id: SafeIdSchema.nullable(),
    status: z.enum(["expected", "candidate", "current_canonical", "superseded", "rejected"]),
    predecessor_artifact_id: SafeIdSchema.nullable(),
    accepted_by_agent_id: SafeIdSchema.nullable(),
    produced_at: IsoTimestampSchema.nullable(),
    accepted_at: IsoTimestampSchema.nullable(),
  })
  .superRefine((artifact, context) => {
    const complete = [
      artifact.logical_ref,
      artifact.sha256,
      artifact.producer_agent_id,
      artifact.produced_at,
      artifact.accepted_by_agent_id,
      artifact.accepted_at,
    ].every(Boolean);
    if (artifact.status === "current_canonical" && !complete) {
      context.addIssue({ code: "custom", message: "Canonical Artifact requires complete provenance." });
    }
    if (
      artifact.status === "expected" &&
      (artifact.sha256 || artifact.accepted_by_agent_id || artifact.accepted_at)
    ) {
      context.addIssue({ code: "custom", message: "Expected Artifact cannot carry digest or acceptance facts." });
    }
  });

const VerificationSchema = z
  .strictObject({
    verification_id: SafeIdSchema,
    stage_id: SafeIdSchema,
    artifact_ids: ids(),
    mode: z.enum(["producer", "machine", "independent"]),
    verifier_agent_id: SafeIdSchema.nullable(),
    status: z.enum(["pending", "passed", "failed"]),
    evidence_summary: SafeSummarySchema,
    failure_reason: SafeSummarySchema.nullable(),
    verified_at: IsoTimestampSchema.nullable(),
  })
  .superRefine((verification, context) => {
    if (
      verification.status === "pending" &&
      (verification.verifier_agent_id || verification.verified_at)
    ) {
      context.addIssue({ code: "custom", message: "Pending Verification cannot be terminal." });
    }
    if (
      verification.status === "passed" &&
      (!verification.verifier_agent_id || !verification.verified_at || verification.failure_reason)
    ) {
      context.addIssue({ code: "custom", message: "Passed Verification facts are invalid." });
    }
    if (
      verification.status === "failed" &&
      (!verification.verifier_agent_id || !verification.verified_at || !verification.failure_reason)
    ) {
      context.addIssue({ code: "custom", message: "Failed Verification facts are invalid." });
    }
  });

const GateSchema = z.strictObject({
  gate_id: SafeIdSchema,
  plan_revision: z.number().int().nonnegative(),
  title: SafeTextSchema,
  stage_id: SafeIdSchema.nullable(),
  decision_authority: z.enum(["user", "project_manager"]),
  status: z.enum(["blocked", "ready", "passed", "failed"]),
  required_artifact_contract_ids: ids(),
  required_verification_ids: ids(),
  missing_artifact_contract_ids: ids(),
  missing_verification_ids: ids(),
  decision_id: SafeIdSchema.nullable(),
  evaluated_at: IsoTimestampSchema,
});

const DecisionSchema = z
  .strictObject({
    decision_id: SafeIdSchema,
    project_key: SafeProjectKeySchema,
    stage_id: SafeIdSchema.nullable(),
    gate_id: SafeIdSchema.nullable(),
    title: SafeTextSchema,
    question: SafeSummarySchema,
    status: z.enum(["evidence_blocked", "pending", "ready", "recorded"]),
    options: z
      .array(
        z.strictObject({
          option_id: SafeIdSchema,
          label: SafeTextSchema,
          impact_summary: SafeSummarySchema,
        }),
      )
      .min(1)
      .max(16)
      .superRefine((options, context) => {
        if (new Set(options.map((option) => option.option_id)).size !== options.length) {
          context.addIssue({ code: "custom", message: "Decision option IDs must be unique." });
        }
      }),
    evidence_complete: z.boolean(),
    missing_evidence_refs: ids(),
    downstream_stage_ids: ids(),
    selected_option_id: SafeIdSchema.nullable(),
    decided_by: z.literal("user").nullable(),
    decided_at: IsoTimestampSchema.nullable(),
    audit_summary: SafeSummarySchema.nullable(),
  })
  .superRefine((decision, context) => {
    const recorded = decision.status === "recorded";
    const auditFacts = [
      decision.selected_option_id,
      decision.decided_by,
      decision.decided_at,
      decision.audit_summary,
    ];
    const completeAudit = auditFacts.every(Boolean);
    const emptyAudit = auditFacts.every((fact) => fact === null);
    if ((recorded && !completeAudit) || (!recorded && !emptyAudit)) {
      context.addIssue({ code: "custom", message: "Decision audit facts drift." });
    }
    if (recorded && !decision.options.some((option) => option.option_id === decision.selected_option_id)) {
      context.addIssue({ code: "custom", path: ["selected_option_id"], message: "Unknown decision option." });
    }
    if (decision.status === "ready" && !decision.evidence_complete) {
      context.addIssue({ code: "custom", message: "Ready Decision requires complete evidence." });
    }
  });

const OutcomeReviewSchema = z
  .strictObject({
    outcome_review_id: SafeIdSchema,
    stage_id: SafeIdSchema.nullable(),
    title: SafeTextSchema,
    status: z.enum(["planned", "recorded"]),
    decision: z.enum(["continue", "revise_and_retest", "change_framework", "stop"]).nullable(),
    evidence_summary: SafeSummarySchema,
    reviewed_by: z.literal("user").nullable(),
    reviewed_at: IsoTimestampSchema.nullable(),
    follow_up_stage_ids: ids(),
  })
  .superRefine((review, context) => {
    const recorded = review.status === "recorded";
    const reviewFacts = [review.decision, review.reviewed_by, review.reviewed_at];
    const completeReview = reviewFacts.every(Boolean);
    const emptyReview = reviewFacts.every((fact) => fact === null);
    if ((recorded && !completeReview) || (!recorded && !emptyReview)) {
      context.addIssue({ code: "custom", message: "Outcome review facts drift." });
    }
  });

const projectSummaryShape = {
  stage_count: z.number().int().nonnegative(),
  completed_stage_count: z.number().int().nonnegative(),
  active_stage_count: z.number().int().nonnegative(),
  blocked_stage_count: z.number().int().nonnegative(),
  ready_stage_count: z.number().int().nonnegative(),
  artifact_count: z.number().int().nonnegative(),
  missing_artifact_count: z.number().int().nonnegative(),
  pending_verification_count: z.number().int().nonnegative(),
  failed_verification_count: z.number().int().nonnegative(),
  pending_decision_count: z.number().int().nonnegative(),
};
const ProjectSummarySchema = z.strictObject(projectSummaryShape);
const SnapshotSummarySchema = z.strictObject({
  project_count: z.number().int().nonnegative(),
  ...projectSummaryShape,
});

function unique(records: Array<Record<string, unknown>>, key: string): boolean {
  return new Set(records.map((record) => record[key])).size === records.length;
}

const ProjectSchema = z
  .strictObject({
    project: z.strictObject({
      project_key: SafeProjectKeySchema,
      project_slug: SafeIdSchema,
      title: SafeTextSchema,
      objective: SafeSummarySchema,
      authority_source: z.literal("openclaw_orchestrator"),
      project_manager_agent_id: SafeIdSchema,
      accountable_owner_agent_id: SafeIdSchema,
      status: z.enum(["planned", "active", "paused", "completed", "cancelled"]),
      approved_plan_revision: z.number().int().nonnegative(),
      current_plan_revision: z.number().int().nonnegative(),
      approved_plan_hash: Sha256Schema,
      source_revision: z.number().int().nonnegative(),
      freshness: z.enum(["fresh", "stale"]),
      revision_drift: z.boolean(),
      current_stage_ids: ids(),
      current_gate_id: SafeIdSchema.nullable(),
      next_admissible_stage_ids: ids(),
      updated_at: IsoTimestampSchema,
    }),
    plan_revisions: z.array(PlanRevisionSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    stages: z.array(StageSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    work_packages: z.array(WorkPackageSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    execution_lines: z.array(ExecutionLineSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    dependencies: z.array(DependencySchema).max(PROJECT_CONTROL_MAX_RECORDS),
    artifacts: z.array(ArtifactSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    verifications: z.array(VerificationSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    gates: z.array(GateSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    user_decisions: z.array(DecisionSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    outcome_reviews: z.array(OutcomeReviewSchema).max(PROJECT_CONTROL_MAX_RECORDS),
    summary: ProjectSummarySchema,
    collected_at: IsoTimestampSchema,
  })
  .superRefine((value, context) => {
    const groups: Array<[Array<Record<string, unknown>>, string]> = [
      [value.plan_revisions, "plan_revision"],
      [value.stages, "stage_id"],
      [value.work_packages, "work_package_id"],
      [value.execution_lines, "execution_line_id"],
      [value.dependencies, "dependency_id"],
      [value.artifacts, "artifact_id"],
      [value.verifications, "verification_id"],
      [value.gates, "gate_id"],
      [value.user_decisions, "decision_id"],
      [value.outcome_reviews, "outcome_review_id"],
    ];
    for (const [records, key] of groups) {
      if (!unique(records, key)) {
        context.addIssue({ code: "custom", message: "Duplicate " + key + "." });
      }
    }
    const stageIds = new Set(value.stages.map((stage) => stage.stage_id));
    const planRevisionIds = new Set(value.plan_revisions.map((plan) => plan.plan_revision));
    const gateIds = new Set(value.gates.map((gate) => gate.gate_id));
    const gateById = new Map(value.gates.map((gate) => [gate.gate_id, gate]));
    const decisionById = new Map(value.user_decisions.map((decision) => [decision.decision_id, decision]));
    const artifactIds = new Set(value.artifacts.map((artifact) => artifact.artifact_id));
    const verificationIds = new Set(value.verifications.map((verification) => verification.verification_id));
    const workPackagesById = new Map(
      value.work_packages.map((workPackage) => [workPackage.work_package_id, workPackage]),
    );
    const executionLinesById = new Map(
      value.execution_lines.map((line) => [line.execution_line_id, line]),
    );
    const artifactContractIds = new Set(
      value.artifacts.map((artifact) => artifact.artifact_contract_id),
    );
    for (const stage of value.stages) {
      if (stage.dependency_ids.some((id) => !stageIds.has(id))) {
        context.addIssue({ code: "custom", path: ["stages"], message: "Dangling Stage dependency." });
      }
    }
    const byStage = new Map(value.stages.map((stage) => [stage.stage_id, stage]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return false;
      if (visited.has(id)) return true;
      visiting.add(id);
      const valid = (byStage.get(id)?.dependency_ids ?? []).every(visit);
      visiting.delete(id);
      visited.add(id);
      return valid;
    };
    if (value.stages.some((stage) => !visit(stage.stage_id))) {
      context.addIssue({ code: "custom", path: ["stages"], message: "Stage DAG must be acyclic." });
    }
    if (
      value.project.current_stage_ids.some((id) => !stageIds.has(id)) ||
      value.project.next_admissible_stage_ids.some((id) => !stageIds.has(id)) ||
      (value.project.current_gate_id && !gateIds.has(value.project.current_gate_id))
    ) {
      context.addIssue({ code: "custom", path: ["project"], message: "Project carries dangling current references." });
    }
    if (
      value.project.revision_drift !==
      (value.project.current_plan_revision !== value.project.approved_plan_revision)
    ) {
      context.addIssue({ code: "custom", path: ["project", "revision_drift"], message: "Revision drift mismatch." });
    }
    const approved = value.plan_revisions.find(
      (plan) => plan.plan_revision === value.project.approved_plan_revision,
    );
    if (
      !approved ||
      approved.approval_status !== "approved" ||
      approved.canonical_hash !== value.project.approved_plan_hash
    ) {
      context.addIssue({ code: "custom", path: ["plan_revisions"], message: "Approved Plan mismatch." });
    }
    const currentPlans = value.plan_revisions.filter((plan) => plan.current);
    if (
      currentPlans.length !== 1 ||
      currentPlans[0]?.plan_revision !== value.project.current_plan_revision
    ) {
      context.addIssue({
        code: "custom",
        path: ["plan_revisions"],
        message: "Exactly one current Plan revision must match the Project.",
      });
    }
    for (const stage of value.stages) {
      if (
        !planRevisionIds.has(stage.plan_revision) ||
        stage.work_package_ids.some((id) =>
          workPackagesById.get(id)?.stage_id !== stage.stage_id) ||
        (stage.execution_line_id &&
          executionLinesById.get(stage.execution_line_id)?.stage_id !== stage.stage_id) ||
        stage.artifact_contract_ids.some((id) => !artifactContractIds.has(id)) ||
        stage.verification_ids.some((id) => !verificationIds.has(id)) ||
        stage.gate_ids.some((id) => !gateIds.has(id))
      ) {
        context.addIssue({
          code: "custom",
          path: ["stages"],
          message: "Stage carries dangling control references.",
        });
      }
    }
    for (const workPackage of value.work_packages) {
      const stage = byStage.get(workPackage.stage_id);
      if (
        !stage ||
        workPackage.plan_revision !== stage.plan_revision ||
        !stage.work_package_ids.includes(workPackage.work_package_id)
      ) {
        context.addIssue({
          code: "custom",
          path: ["work_packages"],
          message: "Work Package Stage binding is invalid.",
        });
      }
    }
    for (const line of value.execution_lines) {
      const stage = byStage.get(line.stage_id);
      if (!stage || stage.execution_line_id !== line.execution_line_id) {
        context.addIssue({
          code: "custom",
          path: ["execution_lines"],
          message: "Execution Line Stage binding is invalid.",
        });
      }
    }
    for (const dependency of value.dependencies) {
      if (
        !stageIds.has(dependency.from_stage_id) ||
        !stageIds.has(dependency.to_stage_id) ||
        !byStage.get(dependency.to_stage_id)?.dependency_ids.includes(
          dependency.from_stage_id,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["dependencies"],
          message: "Dependency Stage binding is invalid.",
        });
      }
      if (dependency.status === "waived") {
        const directDecision = decisionById.get(dependency.required_ref_id);
        const gateDecisionId = gateById.get(dependency.required_ref_id)?.decision_id;
        const gateDecision = gateDecisionId ? decisionById.get(gateDecisionId) : null;
        if (
          directDecision?.status !== "recorded" &&
          gateDecision?.status !== "recorded"
        ) {
          context.addIssue({
            code: "custom",
            path: ["dependencies"],
            message: "Waived Dependency requires a recorded Decision.",
          });
        }
      }
    }
    for (const decision of value.user_decisions) {
      if (
        decision.project_key !== value.project.project_key ||
        (decision.stage_id && !stageIds.has(decision.stage_id)) ||
        (decision.gate_id && !gateIds.has(decision.gate_id)) ||
        decision.downstream_stage_ids.some((id) => !stageIds.has(id))
      ) {
        context.addIssue({
          code: "custom",
          path: ["user_decisions"],
          message: "Decision control references are invalid.",
        });
      }
    }
    for (const review of value.outcome_reviews) {
      if (
        (review.stage_id && !stageIds.has(review.stage_id)) ||
        review.follow_up_stage_ids.some((id) => !stageIds.has(id))
      ) {
        context.addIssue({
          code: "custom",
          path: ["outcome_reviews"],
          message: "Outcome Review Stage references are invalid.",
        });
      }
    }
    const canonicalContracts = new Set<string>();
    for (const artifact of value.artifacts) {
      const predecessor = artifact.predecessor_artifact_id
        ? value.artifacts.find((candidate) => candidate.artifact_id === artifact.predecessor_artifact_id)
        : null;
      if (
        !stageIds.has(artifact.stage_id) ||
        (artifact.predecessor_artifact_id && !artifactIds.has(artifact.predecessor_artifact_id)) ||
        (predecessor && predecessor.artifact_contract_id !== artifact.artifact_contract_id)
      ) {
        context.addIssue({ code: "custom", path: ["artifacts"], message: "Artifact reference mismatch." });
      }
      if (artifact.status === "current_canonical") {
        if (canonicalContracts.has(artifact.artifact_contract_id)) {
          context.addIssue({ code: "custom", path: ["artifacts"], message: "Artifact contract has multiple canonical values." });
        }
        canonicalContracts.add(artifact.artifact_contract_id);
      }
    }
    for (const verification of value.verifications) {
      if (!stageIds.has(verification.stage_id) || verification.artifact_ids.some((id) => !artifactIds.has(id))) {
        context.addIssue({ code: "custom", path: ["verifications"], message: "Verification reference mismatch." });
      }
    }
    for (const gate of value.gates) {
      const decision = gate.decision_id ? decisionById.get(gate.decision_id) : null;
      if (
        (gate.stage_id && !stageIds.has(gate.stage_id)) ||
        gate.required_artifact_contract_ids.some((id) => !artifactContractIds.has(id)) ||
        gate.missing_artifact_contract_ids.some(
          (id) => !artifactContractIds.has(id) || !gate.required_artifact_contract_ids.includes(id),
        ) ||
        gate.required_verification_ids.some((id) => !verificationIds.has(id)) ||
        gate.missing_verification_ids.some(
          (id) => !verificationIds.has(id) || !gate.required_verification_ids.includes(id),
        )
      ) {
        context.addIssue({ code: "custom", path: ["gates"], message: "Gate reference mismatch." });
      }
      if (gate.decision_authority === "user" && ["passed", "failed"].includes(gate.status) && decision?.status !== "recorded") {
        context.addIssue({ code: "custom", path: ["gates"], message: "User Gate requires a recorded Decision." });
      }
    }
    const expected = {
      stage_count: value.stages.length,
      completed_stage_count: value.stages.filter((stage) => stage.status === "completed").length,
      active_stage_count: value.stages.filter((stage) => stage.status === "active").length,
      blocked_stage_count: value.stages.filter((stage) => stage.status === "dependency_blocked").length,
      ready_stage_count: value.stages.filter((stage) => stage.status === "ready").length,
      artifact_count: value.artifacts.length,
      missing_artifact_count: value.artifacts.filter((artifact) => artifact.status === "expected").length,
      pending_verification_count: value.verifications.filter((verification) => verification.status === "pending").length,
      failed_verification_count: value.verifications.filter((verification) => verification.status === "failed").length,
      pending_decision_count: value.user_decisions.filter((decision) => decision.status !== "recorded").length,
    };
    for (const [key, count] of Object.entries(expected)) {
      if (value.summary[key as keyof typeof expected] !== count) {
        context.addIssue({ code: "custom", path: ["summary", key], message: "Derived summary mismatch." });
      }
    }
  });

export const ProjectControlSnapshotSchema = z
  .strictObject({
    schema_version: z.literal(PROJECT_CONTROL_SCHEMA_VERSION),
    collected_at: IsoTimestampSchema,
    summary: SnapshotSummarySchema,
    projects: z.array(ProjectSchema).max(PROJECT_CONTROL_MAX_PROJECTS),
    digest: Sha256Schema,
  })
  .superRefine((snapshot, context) => {
    if (!unique(snapshot.projects.map((project) => project.project), "project_key") || !unique(snapshot.projects.map((project) => project.project), "project_slug")) {
      context.addIssue({ code: "custom", path: ["projects"], message: "Project identity must be unique." });
    }
    const totals = snapshot.projects.reduce(
      (summary, project) => {
        for (const key of Object.keys(project.summary) as Array<keyof typeof project.summary>) {
          summary[key] += project.summary[key];
        }
        return summary;
      },
      {
        stage_count: 0,
        completed_stage_count: 0,
        active_stage_count: 0,
        blocked_stage_count: 0,
        ready_stage_count: 0,
        artifact_count: 0,
        missing_artifact_count: 0,
        pending_verification_count: 0,
        failed_verification_count: 0,
        pending_decision_count: 0,
      },
    );
    if (snapshot.summary.project_count !== snapshot.projects.length) {
      context.addIssue({ code: "custom", path: ["summary", "project_count"], message: "Project count mismatch." });
    }
    for (const [key, count] of Object.entries(totals)) {
      if (snapshot.summary[key as keyof typeof totals] !== count) {
        context.addIssue({ code: "custom", path: ["summary", key], message: "Snapshot summary mismatch." });
      }
    }
    snapshot.projects.forEach((project, index) => {
      if (project.collected_at !== snapshot.collected_at) {
        context.addIssue({ code: "custom", path: ["projects", index, "collected_at"], message: "Collection time mismatch." });
      }
    });
  });

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function computeProjectControlDigest(
  snapshot: { digest: string; [key: string]: unknown },
): string {
  const { digest: _digest, ...payload } = snapshot;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

export type ProjectControlSnapshot = z.infer<typeof ProjectControlSnapshotSchema>;
export type ProjectControlProject = ProjectControlSnapshot["projects"][number];
export type ProjectControlStage = ProjectControlProject["stages"][number];
export type ProjectControlDecision = ProjectControlProject["user_decisions"][number];
