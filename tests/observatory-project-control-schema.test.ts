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
    gate.projects[0].gates[0].decision_id = null;
    expect(ProjectControlSnapshotSchema.safeParse(gate).success).toBe(false);
    const decision = asgardProjectControlFixture();
    decision.projects[0].user_decisions[0].selected_option_id = null;
    expect(ProjectControlSnapshotSchema.safeParse(decision).success).toBe(false);
  });

  it("keeps structural validation separate from digest verification", () => {
    const snapshot = asgardProjectControlFixture();
    snapshot.digest = "f".repeat(64);
    expect(ProjectControlSnapshotSchema.parse(snapshot).digest).toBe(snapshot.digest);
    expect(computeProjectControlDigest(snapshot)).not.toBe(snapshot.digest);
  });
});
