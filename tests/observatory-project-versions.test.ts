import { describe, expect, it } from "vitest";

import {
  PROJECT_VERSION_STATUSES,
  ProjectVersionCreateInputSchema,
  ProjectVersionTransitionInputSchema,
  ProjectVersionUpdateInputSchema,
  allowedProjectVersionTransitions,
  compactProjectVersionLabel,
} from "@/lib/observatory/project-versions";

const operationalFields = {
  semver: "0.2.0",
  isReleaseTarget: true,
  milestoneRef: "M2",
  predecessorVersionId: "22222222-2222-4222-8222-222222222222",
  roadmapRef: "roadmap/work-tracker",
  approvedPlanRef: "plan/project-version-contract-v1",
  acceptanceSummary: "Release Gate requirements are satisfied.",
  actualDate: "2026-09-29",
  dependenciesSummary: "Migration and repository updates are complete.",
  dependenciesSatisfied: true,
  artifactsAccepted: true,
  verificationComplete: true,
  roadmapReconciled: true,
  userGateDecisionRef: "decision/release-v0.2.0",
} as const;

describe("Project Versions", () => {
  it("uses the approved lifecycle", () => {
    expect(PROJECT_VERSION_STATUSES).toEqual([
      "planned",
      "active",
      "gate_ready",
      "released",
      "archived",
      "cancelled",
    ]);
    expect(allowedProjectVersionTransitions("planned")).toEqual(["active", "cancelled"]);
    expect(allowedProjectVersionTransitions("active")).toEqual(["gate_ready", "cancelled"]);
    expect(allowedProjectVersionTransitions("gate_ready")).toEqual(["active", "released"]);
    expect(allowedProjectVersionTransitions("released")).toEqual(["archived"]);
    expect(allowedProjectVersionTransitions("archived")).toEqual([]);
    expect(allowedProjectVersionTransitions("cancelled")).toEqual([]);
  });

  it("normalizes create input with release-target and Gate fields", () => {
    expect(ProjectVersionCreateInputSchema.parse({
      projectKey: " plato/dashboard ",
      versionLabel: " 0.2.0 ",
      title: " Versioned delivery ",
      description: " First release ",
      targetDate: "2026-09-30",
      ...operationalFields,
    })).toEqual({
      projectKey: "plato/dashboard",
      versionLabel: "0.2.0",
      title: "Versioned delivery",
      description: "First release",
      targetDate: "2026-09-30",
      ...operationalFields,
    });
  });

  it("defaults operational fields for create and legacy update consumers", () => {
    expect(ProjectVersionCreateInputSchema.parse({
      projectKey: "plato/dashboard",
      versionLabel: "1.2.0",
      title: "Legacy create",
    })).toMatchObject({
      semver: "1.2.0",
      isReleaseTarget: false,
      milestoneRef: null,
      predecessorVersionId: null,
      roadmapRef: null,
      approvedPlanRef: null,
      acceptanceSummary: "",
      actualDate: null,
      dependenciesSummary: "",
      dependenciesSatisfied: false,
      artifactsAccepted: false,
      verificationComplete: false,
      roadmapReconciled: false,
      userGateDecisionRef: null,
    });

    expect(ProjectVersionUpdateInputSchema.parse({
      projectVersionId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 2,
      versionLabel: "internal-preview",
      title: "Legacy update",
    })).toMatchObject({
      semver: null,
      isReleaseTarget: false,
      milestoneRef: null,
      predecessorVersionId: null,
      roadmapRef: null,
      approvedPlanRef: null,
      acceptanceSummary: "",
      actualDate: null,
      dependenciesSummary: "",
      dependenciesSatisfied: false,
      artifactsAccepted: false,
      verificationComplete: false,
      roadmapReconciled: false,
      userGateDecisionRef: null,
    });
  });

  it("requires strict MAJOR.MINOR.PATCH SemVer without a v prefix", () => {
    for (const versionLabel of [
      "v1",
      "v1.2",
      "v1.2.3",
      "1",
      "1.2",
      "1.2.3-beta.1",
      "01.2.3",
    ]) {
      expect(ProjectVersionCreateInputSchema.safeParse({
        projectKey: "plato/dashboard",
        versionLabel,
        title: "Invalid formal version",
        description: "",
        targetDate: null,
        ...operationalFields,
        semver: "1.2.3",
      }).success).toBe(false);
    }

    expect(ProjectVersionCreateInputSchema.parse({
      projectKey: "plato/dashboard",
      versionLabel: "0.0.0",
      title: "Formal version",
      description: "",
      targetDate: null,
      ...operationalFields,
      semver: undefined,
    }).semver).toBe("0.0.0");
  });

  it("rejects a create input whose SemVer contradicts its version label", () => {
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "plato/dashboard",
      versionLabel: "1.2.3",
      title: "Contradictory version",
      semver: "2.0.0",
    }).success).toBe(false);
  });

  it("enforces the database 64-character limit for formal versions", () => {
    const boundaryVersion = `${"1".repeat(60)}.0.0`;
    const oversizedVersion = `${"1".repeat(61)}.0.0`;

    expect(boundaryVersion).toHaveLength(64);
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "plato/dashboard",
      versionLabel: boundaryVersion,
      title: "Boundary version",
    }).success).toBe(true);

    expect(oversizedVersion).toHaveLength(65);
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "plato/dashboard",
      versionLabel: oversizedVersion,
      title: "Oversized version",
    }).success).toBe(false);
  });

  it("allows null SemVer only when updating a legacy version", () => {
    expect(ProjectVersionUpdateInputSchema.safeParse({
      projectVersionId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 2,
      versionLabel: "internal-preview",
      title: "Legacy version",
      semver: null,
    }).success).toBe(true);

    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "plato/dashboard",
      versionLabel: "internal-preview",
      title: "New version",
      semver: null,
    }).success).toBe(false);
  });

  it("rejects unsafe Project keys", () => {
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "/private/project",
      versionLabel: "1.0.0",
      title: "Unsafe",
      description: "",
      targetDate: null,
      ...operationalFields,
    }).success).toBe(false);
  });

  it("accepts canonical Project keys with spaces, underscores, and Unicode names", () => {
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "aristotle/LLM Wiki_第二版",
      versionLabel: "1.0.0",
      title: "Knowledge release",
      description: "",
      targetDate: null,
      ...operationalFields,
      semver: "1.0.0",
    }).success).toBe(true);
  });

  it("carries release-target and Gate fields through update input", () => {
    expect(ProjectVersionUpdateInputSchema.parse({
      projectVersionId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 2,
      versionLabel: " v0.2 ",
      title: " Versioned delivery ",
      description: " First release ",
      targetDate: "2026-09-30",
      ...operationalFields,
    })).toEqual({
      projectVersionId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 2,
      versionLabel: "v0.2",
      title: "Versioned delivery",
      description: "First release",
      targetDate: "2026-09-30",
      ...operationalFields,
    });
  });

  it("preserves compact labels for formal versions and Backlog", () => {
    expect(compactProjectVersionLabel({ isBacklog: false, versionLabel: "v1.2.0" })).toBe("V1.2");
    expect(compactProjectVersionLabel({ isBacklog: true, versionLabel: "Backlog" })).toBe("待");
  });

  it("requires optimistic concurrency for transitions", () => {
    expect(ProjectVersionTransitionInputSchema.safeParse({
      projectVersionId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 2,
      targetStatus: "active",
    }).success).toBe(true);
    expect(ProjectVersionTransitionInputSchema.safeParse({
      projectVersionId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 0,
      targetStatus: "active",
    }).success).toBe(false);
  });
});
