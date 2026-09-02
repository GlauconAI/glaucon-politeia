import { describe, expect, it } from "vitest";

import {
  ProjectVersionCreateInputSchema,
  ProjectVersionTransitionInputSchema,
  allowedProjectVersionTransitions,
} from "@/lib/observatory/project-versions";

describe("Project Versions", () => {
  it("uses the approved lifecycle", () => {
    expect(allowedProjectVersionTransitions("planned")).toEqual(["active", "archived"]);
    expect(allowedProjectVersionTransitions("active")).toEqual(["released", "archived"]);
    expect(allowedProjectVersionTransitions("released")).toEqual(["archived"]);
    expect(allowedProjectVersionTransitions("archived")).toEqual([]);
  });

  it("normalizes create input and rejects unsafe Project keys", () => {
    expect(ProjectVersionCreateInputSchema.parse({
      projectKey: " plato/dashboard ",
      versionLabel: " v0.2 ",
      title: " Versioned delivery ",
      description: " First release ",
      targetDate: "2026-09-30",
    })).toEqual({
      projectKey: "plato/dashboard",
      versionLabel: "v0.2",
      title: "Versioned delivery",
      description: "First release",
      targetDate: "2026-09-30",
    });
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "/private/project",
      versionLabel: "v1",
      title: "Unsafe",
      description: "",
      targetDate: null,
    }).success).toBe(false);
  });

  it("accepts canonical Project keys with spaces, underscores, and Unicode names", () => {
    expect(ProjectVersionCreateInputSchema.safeParse({
      projectKey: "aristotle/LLM Wiki_第二版",
      versionLabel: "v1",
      title: "Knowledge release",
      description: "",
      targetDate: null,
    }).success).toBe(true);
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
