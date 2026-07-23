import { describe, expect, it } from "vitest";

import {
  AgentClaimRequestSchema,
  AgentClaimMutationRequestSchema,
  AgentClaimPolicyInputSchema,
  getAgentClaimEligibility,
  normalizeAuthorizedPaths,
} from "@/lib/observatory/agent-claims";

const eligible = {
  type: "feature" as const,
  state: "ready" as const,
  readyGateComplete: true,
  riskLevel: "low" as const,
  enabled: true,
  authorizedPaths: ["components/observatory"],
  allowedActionClasses: ["code_edit", "test"] as const,
  activeClaim: false,
};

describe("agent claim domain", () => {
  it("accepts only a fully bounded low-risk Feature or Bug", () => {
    expect(getAgentClaimEligibility(eligible)).toEqual({
      eligible: true,
      reasons: [],
    });
    expect(
      getAgentClaimEligibility({ ...eligible, type: "bug" }),
    ).toEqual({ eligible: true, reasons: [] });
  });

  it("returns every stable eligibility failure", () => {
    expect(
      getAgentClaimEligibility({
        ...eligible,
        type: "idea",
        state: "triage",
        readyGateComplete: false,
        riskLevel: "high",
        enabled: false,
        authorizedPaths: [],
        allowedActionClasses: [],
        activeClaim: true,
      }),
    ).toEqual({
      eligible: false,
      reasons: [
        "unsupported_type",
        "not_ready",
        "ready_gate_incomplete",
        "risk_not_low",
        "claim_not_approved",
        "authorized_paths_missing",
        "action_classes_missing",
        "active_claim_exists",
      ],
    });
  });

  it("normalizes unique POSIX-relative authorized paths", () => {
    expect(
      normalizeAuthorizedPaths([
        " components/observatory/ ",
        "tests/observatory-agent-claims.test.ts",
        "components/observatory",
      ]),
    ).toEqual([
      "components/observatory",
      "tests/observatory-agent-claims.test.ts",
    ]);
  });

  it.each([
    "/absolute/path",
    "../outside",
    "components/../outside",
    "./components",
    "components//detail",
    "components\\detail",
    "",
  ])("rejects unsafe authorized path %j", (path) => {
    expect(() => normalizeAuthorizedPaths([path])).toThrow(
      /repository-relative POSIX path/i,
    );
  });

  it("rejects too many or overlong authorized paths", () => {
    expect(() =>
      normalizeAuthorizedPaths(
        Array.from({ length: 17 }, (_, index) => `path-${index}`),
      ),
    ).toThrow(/one to sixteen/i);
    expect(() => normalizeAuthorizedPaths(["a".repeat(241)])).toThrow(
      /240 characters/i,
    );
  });

  it("parses strict claim policy inputs", () => {
    expect(
      AgentClaimPolicyInputSchema.parse({
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 3,
        riskLevel: "low",
        enabled: true,
        authorizedPaths: ["components/observatory"],
        allowedActionClasses: ["code_edit", "test"],
      }),
    ).toMatchObject({
      riskLevel: "low",
      enabled: true,
      authorizedPaths: ["components/observatory"],
    });
    expect(() =>
      AgentClaimPolicyInputSchema.parse({
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 3,
        riskLevel: "low",
        enabled: true,
        authorizedPaths: ["components/observatory"],
        allowedActionClasses: ["deploy"],
      }),
    ).toThrow();
  });

  it("bounds claim requests and strips no unknown fields", () => {
    expect(
      AgentClaimRequestSchema.parse({
        idempotencyKey: "pilot-feature-1",
      }),
    ).toEqual({
      idempotencyKey: "pilot-feature-1",
      leaseSeconds: 900,
    });
    expect(() =>
      AgentClaimRequestSchema.parse({
        idempotencyKey: "pilot-feature-1",
        leaseSeconds: 299,
      }),
    ).toThrow();
    expect(() =>
      AgentClaimRequestSchema.parse({
        idempotencyKey: "pilot-feature-1",
        extra: true,
      }),
    ).toThrow();
  });

  it("requires bounded completion evidence and versions", () => {
    expect(
      AgentClaimMutationRequestSchema.parse({
        action: "complete",
        expectedClaimVersion: 2,
        expectedWorkItemVersion: 8,
        summary: "Focused tests and independent verification passed.",
        evidenceUrl: "https://github.com/GlauconAI/glaucon-politeia/commit/abc",
      }),
    ).toMatchObject({ action: "complete", expectedClaimVersion: 2 });
    expect(() =>
      AgentClaimMutationRequestSchema.parse({
        action: "complete",
        expectedClaimVersion: 2,
        expectedWorkItemVersion: 8,
        summary: "Done",
        evidenceUrl: "file:///private/result",
      }),
    ).toThrow();
  });
});
