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
