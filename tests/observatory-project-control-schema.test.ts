import { describe, expect, it } from "vitest";

import { ProjectControlSnapshotSchema, computeProjectControlDigest } from "@/lib/observatory/project-control-schema";
import { asgardProjectControlFixture } from "./fixtures/project-control/asgard-plan-v3";

describe("ProjectControlSnapshotSchema", () => {
  it("accepts the exact Asgard v3 public control projection", () => {
    const snapshot = asgardProjectControlFixture();
    expect(ProjectControlSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(computeProjectControlDigest(snapshot)).toBe(snapshot.digest);
  });

  it("rejects unknown fields, unsafe paths, dangling references, and cycles", () => {
    const unknown = asgardProjectControlFixture() as ReturnType<typeof asgardProjectControlFixture> & { private_work_id?: string };
    unknown.private_work_id = "hidden";
    expect(ProjectControlSnapshotSchema.safeParse(unknown).success).toBe(false);
    const unsafe = asgardProjectControlFixture();
    unsafe.projects[0].project.title = "Read /private/secret.md";
    expect(ProjectControlSnapshotSchema.safeParse(unsafe).success).toBe(false);
    const dangling = asgardProjectControlFixture();
    dangling.projects[0].stages[0].dependency_ids = ["missing-stage"];
    expect(ProjectControlSnapshotSchema.safeParse(dangling).success).toBe(false);
    const cycle = asgardProjectControlFixture();
    cycle.projects[0].stages[0].dependency_ids = ["stage-10"];
    expect(ProjectControlSnapshotSchema.safeParse(cycle).success).toBe(false);
  });

  it("rejects summary, revision, transfer, Artifact, Gate, and Decision drift", () => {
    const summary = asgardProjectControlFixture();
    summary.summary.stage_count += 1;
    expect(ProjectControlSnapshotSchema.safeParse(summary).success).toBe(false);
    const revision = asgardProjectControlFixture();
    revision.projects[0].project.revision_drift = true;
    expect(ProjectControlSnapshotSchema.safeParse(revision).success).toBe(false);
    const transfer = asgardProjectControlFixture();
    transfer.projects[0].stages[1].return_trigger = "terminal_signal";
    expect(ProjectControlSnapshotSchema.safeParse(transfer).success).toBe(false);
    const duplicateCanonical = asgardProjectControlFixture();
    duplicateCanonical.projects[0].artifacts.push({ ...duplicateCanonical.projects[0].artifacts[0], artifact_id: "artifact-copy" });
    expect(ProjectControlSnapshotSchema.safeParse(duplicateCanonical).success).toBe(false);
    const gate = asgardProjectControlFixture();
    (gate.projects[0].gates[0] as { decision_id: string | null }).decision_id = null;
    expect(ProjectControlSnapshotSchema.safeParse(gate).success).toBe(false);
    const decision = asgardProjectControlFixture();
    (decision.projects[0].user_decisions[0] as { selected_option_id: string | null }).selected_option_id = null;
    expect(ProjectControlSnapshotSchema.safeParse(decision).success).toBe(false);
  });

  it("rejects contradictory Stage admission and controller facts", () => {
    const eligibleButBlocked = asgardProjectControlFixture();
    eligibleButBlocked.projects[0].stages[1].admission.eligible = true;
    eligibleButBlocked.projects[0].stages[1].admission.reason_codes = [
      "dependency_missing",
    ];
    expect(ProjectControlSnapshotSchema.safeParse(eligibleButBlocked).success).toBe(false);

    const terminalWhileActive = asgardProjectControlFixture();
    terminalWhileActive.projects[0].stages[1].admission.evaluation = "terminal";
    expect(ProjectControlSnapshotSchema.safeParse(terminalWhileActive).success).toBe(false);

    const plannedExecutorControlledByAgent = asgardProjectControlFixture();
    plannedExecutorControlledByAgent.projects[0].stages[6].current_controller =
      "executing_agent";
    expect(
      ProjectControlSnapshotSchema.safeParse(plannedExecutorControlledByAgent)
        .success,
    ).toBe(false);

    const activeExecutorControlledByManager = asgardProjectControlFixture();
    const stage = activeExecutorControlledByManager.projects[0].stages[1];
    stage.transfer_mode = "project_executor";
    stage.return_trigger = "terminal_signal";
    stage.current_controller = "project_manager";
    expect(
      ProjectControlSnapshotSchema.safeParse(activeExecutorControlledByManager)
        .success,
    ).toBe(false);
  });

  it("rejects multiple current Plan revisions", () => {
    const twoCurrentPlans = asgardProjectControlFixture();
    twoCurrentPlans.projects[0].plan_revisions.push({
      ...twoCurrentPlans.projects[0].plan_revisions[0],
      plan_revision: 4,
      canonical_hash: "b".repeat(64),
      approval_status: "draft",
      approved_at: null,
      approved_by: null,
      current: true,
    } as unknown as (typeof twoCurrentPlans.projects)[number]["plan_revisions"][number]);
    expect(ProjectControlSnapshotSchema.safeParse(twoCurrentPlans).success).toBe(false);
  });

  it("accepts historical approval facts on a superseded Plan revision", () => {
    const historicalPlan = asgardProjectControlFixture();
    historicalPlan.projects[0].plan_revisions.push({
      ...historicalPlan.projects[0].plan_revisions[0],
      plan_revision: 2,
      canonical_hash: "c".repeat(64),
      approval_status: "superseded",
      source_revision: 2,
      current: false,
    } as unknown as (typeof historicalPlan.projects)[number]["plan_revisions"][number]);
    expect(ProjectControlSnapshotSchema.safeParse(historicalPlan).success).toBe(true);
  });

  it("rejects duplicate IDs inside reference arrays", () => {
    const duplicateReference = asgardProjectControlFixture();
    duplicateReference.projects[0].project.current_stage_ids.push("stage-05a");
    expect(ProjectControlSnapshotSchema.safeParse(duplicateReference).success).toBe(false);
  });

  it("rejects expected Artifacts carrying a digest", () => {
    const expectedWithDigest = asgardProjectControlFixture();
    expectedWithDigest.projects[0].artifacts[1].sha256 = "d".repeat(64);
    expect(ProjectControlSnapshotSchema.safeParse(expectedWithDigest).success).toBe(false);
  });

  it("rejects unaudited Dependency waivers and dangling Gate contracts", () => {
    const unauditedWaiver = asgardProjectControlFixture();
    unauditedWaiver.projects[0].dependencies[0].status = "waived";
    expect(ProjectControlSnapshotSchema.safeParse(unauditedWaiver).success).toBe(false);

    const danglingGateContract = asgardProjectControlFixture();
    danglingGateContract.projects[0].gates[0].required_artifact_contract_ids = [
      "missing-contract",
    ];
    expect(ProjectControlSnapshotSchema.safeParse(danglingGateContract).success).toBe(false);
  });

  it("rejects evidence-incomplete ready Gates and Decisions", () => {
    const readyGateWithMissingEvidence = asgardProjectControlFixture();
    readyGateWithMissingEvidence.projects[0].gates[1].status = "ready";
    expect(
      ProjectControlSnapshotSchema.safeParse(readyGateWithMissingEvidence).success,
    ).toBe(false);

    const readyDecisionWithMissingEvidence = asgardProjectControlFixture();
    const decision = readyDecisionWithMissingEvidence.projects[0].user_decisions[1];
    decision.status = "ready";
    decision.evidence_complete = true;
    expect(
      ProjectControlSnapshotSchema.safeParse(readyDecisionWithMissingEvidence).success,
    ).toBe(false);
  });

  it("rejects a Gate linked to a recorded Decision for another Gate", () => {
    const mismatchedDecision = asgardProjectControlFixture();
    mismatchedDecision.projects[0].user_decisions[0].gate_id = "gate-3";
    expect(ProjectControlSnapshotSchema.safeParse(mismatchedDecision).success).toBe(false);
  });

  it("rejects invalid execution-line controller and return states", () => {
    const transferredToUser = asgardProjectControlFixture();
    transferredToUser.projects[0].execution_lines[0].current_controller = "user";
    expect(ProjectControlSnapshotSchema.safeParse(transferredToUser).success).toBe(false);

    const returnedToOwnerLine = asgardProjectControlFixture();
    const returnedLine = returnedToOwnerLine.projects[0].execution_lines[0];
    returnedLine.status = "returned";
    (returnedLine as { user_returned_at: string | null }).user_returned_at =
      "2026-08-23T20:30:00Z";
    expect(ProjectControlSnapshotSchema.safeParse(returnedToOwnerLine).success).toBe(false);

    const activeExecutorControlledByManager = asgardProjectControlFixture();
    const executorLine = activeExecutorControlledByManager.projects[0].execution_lines[0];
    executorLine.transfer_mode = "project_executor";
    executorLine.return_trigger = "terminal_signal";
    executorLine.status = "active";
    executorLine.current_controller = "project_manager";
    expect(
      ProjectControlSnapshotSchema.safeParse(activeExecutorControlledByManager).success,
    ).toBe(false);

    const contradictoryReturn = asgardProjectControlFixture();
    const contradictoryLine = contradictoryReturn.projects[0].execution_lines[0];
    contradictoryLine.status = "returned";
    contradictoryLine.current_controller = "user";
    (contradictoryLine as { user_returned_at: string | null }).user_returned_at =
      "2026-08-23T20:30:00Z";
    expect(ProjectControlSnapshotSchema.safeParse(contradictoryReturn).success).toBe(false);

    contradictoryReturn.projects[0].stages[1].current_controller = "user";
    expect(ProjectControlSnapshotSchema.safeParse(contradictoryReturn).success).toBe(true);
  });

  it("rejects dangling Admission, typed Dependency, and Gate Plan references", () => {
    const danglingAdmission = asgardProjectControlFixture();
    danglingAdmission.projects[0].stages[3].admission.missing_dependency_ids = [
      "unknown-dependency",
    ];
    expect(ProjectControlSnapshotSchema.safeParse(danglingAdmission).success).toBe(false);

    const danglingDependency = asgardProjectControlFixture();
    danglingDependency.projects[0].dependencies[0].required_ref_id = "bogus";
    expect(ProjectControlSnapshotSchema.safeParse(danglingDependency).success).toBe(false);

    const danglingGatePlan = asgardProjectControlFixture();
    danglingGatePlan.projects[0].gates[0].plan_revision = 999;
    expect(ProjectControlSnapshotSchema.safeParse(danglingGatePlan).success).toBe(false);
  });

  it("rejects Work Packages with dangling Stage references", () => {
    const danglingWorkPackage = asgardProjectControlFixture();
    danglingWorkPackage.projects[0].work_packages[0].stage_id = "missing-stage";
    expect(ProjectControlSnapshotSchema.safeParse(danglingWorkPackage).success).toBe(false);
  });

  it("rejects execution lines with dangling Stage references", () => {
    const danglingExecutionLine = asgardProjectControlFixture();
    danglingExecutionLine.projects[0].execution_lines[0].stage_id = "missing-stage";
    expect(ProjectControlSnapshotSchema.safeParse(danglingExecutionLine).success).toBe(false);
  });

  it("rejects fabricated imported-baseline starts", () => {
    const fabricatedStart = asgardProjectControlFixture();
    fabricatedStart.projects[0].stages[0].started_at = "2026-08-23T19:00:00Z";
    expect(ProjectControlSnapshotSchema.safeParse(fabricatedStart).success).toBe(false);
  });

  it("requires Artifact and Verification membership in their owning Stage", () => {
    const unlistedArtifact = asgardProjectControlFixture();
    unlistedArtifact.projects[0].stages[0].artifact_contract_ids = [];
    expect(ProjectControlSnapshotSchema.safeParse(unlistedArtifact).success).toBe(false);

    const unlistedVerification = asgardProjectControlFixture();
    unlistedVerification.projects[0].verifications.push({
      verification_id: "verification-stage-01-04d",
      stage_id: "stage-01-04d",
      artifact_ids: ["artifact-stage-01-04d"],
      mode: "machine",
      verifier_agent_id: null,
      status: "pending",
      evidence_summary: "",
      failure_reason: null,
      verified_at: null,
    } as never);
    expect(ProjectControlSnapshotSchema.safeParse(unlistedVerification).success).toBe(false);

    const foreignArtifact = asgardProjectControlFixture();
    foreignArtifact.projects[0].artifacts[0].stage_id = "stage-05a";
    expect(ProjectControlSnapshotSchema.safeParse(foreignArtifact).success).toBe(false);
  });

  it("reconciles Stage DAG edges and Admission missing facts with Dependency records", () => {
    const missingLedgerEdge = asgardProjectControlFixture();
    missingLedgerEdge.projects[0].dependencies = missingLedgerEdge.projects[0].dependencies.filter(
      (dependency) =>
        !(dependency.from_stage_id === "stage-05a" && dependency.to_stage_id === "stage-06a"),
    );
    expect(ProjectControlSnapshotSchema.safeParse(missingLedgerEdge).success).toBe(false);

    const unrelatedMissingDependency = asgardProjectControlFixture();
    unrelatedMissingDependency.projects[0].stages[3].admission.missing_dependency_ids = [
      "stage-05b",
    ];
    expect(ProjectControlSnapshotSchema.safeParse(unrelatedMissingDependency).success).toBe(false);
  });

  it("fails closed when the current Plan drifts from the approved revision", () => {
    const drift = asgardProjectControlFixture();
    drift.projects[0].plan_revisions[0].current = false;
    drift.projects[0].plan_revisions.push({
      ...drift.projects[0].plan_revisions[0],
      plan_revision: 4,
      canonical_hash: "b".repeat(64),
      approval_status: "draft",
      approved_at: null,
      approved_by: null,
      source_revision: 4,
      current: true,
    } as unknown as (typeof drift.projects)[number]["plan_revisions"][number]);
    drift.projects[0].project.current_plan_revision = 4;
    drift.projects[0].project.source_revision = 4;
    drift.projects[0].project.revision_drift = true;
    expect(ProjectControlSnapshotSchema.safeParse(drift).success).toBe(false);

    drift.projects[0].project.freshness = "stale";
    expect(ProjectControlSnapshotSchema.safeParse(drift).success).toBe(true);
  });

  it("rejects a superseded Artifact without a successor", () => {
    const orphanedHistory = asgardProjectControlFixture();
    orphanedHistory.projects[0].artifacts[0].status = "superseded";
    expect(ProjectControlSnapshotSchema.safeParse(orphanedHistory).success).toBe(false);
  });

  it("models Asgard 05A/05B returns as typed User-return dependencies", () => {
    const snapshot = asgardProjectControlFixture();
    const dependencyTypes = new Map(
      snapshot.projects[0].dependencies.map((dependency) => [
        dependency.from_stage_id + "->" + dependency.to_stage_id,
        dependency.dependency_type,
      ]),
    );
    expect(dependencyTypes.get("stage-05a->stage-06a")).toBe("user_return");
    expect(dependencyTypes.get("stage-05a->stage-06b")).toBe("user_return");
    expect(dependencyTypes.get("stage-05b->stage-06c")).toBe("user_return");
  });

  it("rejects Decisions that claim a foreign Project", () => {
    const foreignDecision = asgardProjectControlFixture();
    foreignDecision.projects[0].user_decisions[0].project_key = "other/project";
    expect(ProjectControlSnapshotSchema.safeParse(foreignDecision).success).toBe(false);
  });

  it("rejects partial planned Outcome Review facts", () => {
    const partialOutcome = asgardProjectControlFixture();
    (partialOutcome.projects[0].outcome_reviews[0] as { decision: string | null }).decision = "continue";
    expect(ProjectControlSnapshotSchema.safeParse(partialOutcome).success).toBe(false);
  });

  it("rejects partial Decision audit facts and secret-bearing public text", () => {
    const partialAudit = asgardProjectControlFixture();
    partialAudit.projects[0].user_decisions[1].selected_option_id = "accept";
    expect(ProjectControlSnapshotSchema.safeParse(partialAudit).success).toBe(false);

    const secret = asgardProjectControlFixture();
    secret.projects[0].project.objective =
      "Use Bearer abcdefghijklmnopqrstuvwxyz for the integration.";
    expect(ProjectControlSnapshotSchema.safeParse(secret).success).toBe(false);
  });

  it("keeps structural validation separate from digest verification", () => {
    const snapshot = asgardProjectControlFixture();
    snapshot.digest = "f".repeat(64);
    expect(ProjectControlSnapshotSchema.parse(snapshot).digest).toBe(snapshot.digest);
    expect(computeProjectControlDigest(snapshot)).not.toBe(snapshot.digest);
  });
});
