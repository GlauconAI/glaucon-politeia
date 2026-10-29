import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentClaimAuthError,
  authenticateAgentClaimRequest,
  parseAgentClaimKeys,
} from "@/lib/observatory/agent-claim-auth";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("agent claim runner authentication", () => {
  it("derives the agent identity from a matching bearer token hash", () => {
    const token = "owner-supplied-pilot-token";
    expect(
      authenticateAgentClaimRequest(
        `Bearer ${token}`,
        JSON.stringify([
          { agentId: "plato-pilot", tokenSha256: digest(token) },
        ]),
      ),
    ).toEqual({ agentId: "plato-pilot" });
  });

  it("fails closed when configuration is absent or invalid", () => {
    expect(() => parseAgentClaimKeys(undefined)).toThrowError(
      new AgentClaimAuthError("UNCONFIGURED"),
    );
    expect(() => parseAgentClaimKeys("not-json")).toThrowError(
      new AgentClaimAuthError("UNCONFIGURED"),
    );
    expect(() =>
      parseAgentClaimKeys(
        JSON.stringify([{ agentId: "plato", tokenSha256: "short" }]),
      ),
    ).toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
  });

  it("rejects malformed or unmatched authorization without leaking detail", () => {
    const config = JSON.stringify([
      { agentId: "plato", tokenSha256: digest("correct-token") },
    ]);
    for (const authorization of [
      null,
      "",
      "Basic value",
      "Bearer",
      "Bearer wrong-token",
    ]) {
      expect(() =>
        authenticateAgentClaimRequest(authorization, config),
      ).toThrowError(new AgentClaimAuthError("UNAUTHORIZED"));
    }
  });

  it("rejects duplicate identities and token hashes", () => {
    const one = digest("one");
    expect(() =>
      parseAgentClaimKeys(
        JSON.stringify([
          { agentId: "plato", tokenSha256: one },
          { agentId: "plato", tokenSha256: digest("two") },
        ]),
      ),
    ).toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
    expect(() =>
      parseAgentClaimKeys(
        JSON.stringify([
          { agentId: "plato", tokenSha256: one },
          { agentId: "socrates", tokenSha256: one },
        ]),
      ),
    ).toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
  });
});


describe("additive agent credentials", () => {
  afterEach(() => vi.unstubAllEnvs());
  const legacy = JSON.stringify([{ agentId: "plato", tokenSha256: digest("legacy") }]);
  const additional = JSON.stringify([{ agentId: "herodotus", tokenSha256: digest("new") }]);

  it("authenticates independent identities without replacing legacy or main credentials", () => {
    for (const [token, agentId] of [["new", "herodotus"], ["legacy", "plato"], ["bootstrap", "main"]]) {
      expect(authenticateAgentClaimRequest(`Bearer ${token}`, legacy, digest("bootstrap"), additional))
        .toEqual({ agentId });
    }
  });

  it("reads the optional deployment environment by default", () => {
    vi.stubEnv("CONCERTO_ADDITIONAL_AGENT_CLAIM_KEYS", additional);
    expect(authenticateAgentClaimRequest("Bearer new", legacy)).toEqual({ agentId: "herodotus" });
  });

  it("preserves old behavior when the optional configuration is absent", () => {
    vi.stubEnv("CONCERTO_ADDITIONAL_AGENT_CLAIM_KEYS", undefined);
    expect(authenticateAgentClaimRequest("Bearer legacy", legacy)).toEqual({ agentId: "plato" });
    expect(() => authenticateAgentClaimRequest("Bearer new", legacy))
      .toThrowError(new AgentClaimAuthError("UNAUTHORIZED"));
  });

  it("requires valid legacy configuration even with valid additions", () => {
    for (const raw of [undefined, "", "not-json", "[]"]) {
      expect(() => authenticateAgentClaimRequest("Bearer new", raw, undefined, additional))
        .toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
    }
  });

  it.each([
    "", "not-json", "null", "[]",
    JSON.stringify([{ agentId: "invalid/agent", tokenSha256: digest("new") }]),
    JSON.stringify([{ agentId: "herodotus", tokenSha256: "short" }]),
    JSON.stringify([{ agentId: "herodotus", tokenSha256: digest("new"), admin: true }]),
    JSON.stringify([{ agentId: "herodotus", tokenSha256: digest("one") }, { agentId: "herodotus", tokenSha256: digest("two") }]),
    JSON.stringify([{ agentId: "herodotus", tokenSha256: digest("one") }, { agentId: "socrates", tokenSha256: digest("one") }]),
    JSON.stringify(Array.from({ length: 33 }, (_, i) => ({ agentId: `agent-${i}`, tokenSha256: digest(`${i}`) }))),
  ])("fails closed for malformed additions: %s", (raw) => {
    expect(() => authenticateAgentClaimRequest("Bearer legacy", legacy, undefined, raw))
      .toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
  });

  it("supports generic agent identities and same-identity credential rotation", () => {
    const rotated = JSON.stringify([{ agentId: "plato", tokenSha256: digest("rotated") }]);
    for (const token of ["legacy", "rotated"]) {
      expect(authenticateAgentClaimRequest(`Bearer ${token}`, legacy, undefined, rotated)).toEqual({ agentId: "plato" });
    }
    expect(authenticateAgentClaimRequest("Bearer legacy", legacy, undefined, legacy)).toEqual({ agentId: "plato" });
  });

  it("rejects cross-source identity collisions regardless of the presented token", () => {
    const conflicting = JSON.stringify([{ agentId: "herodotus", tokenSha256: digest("legacy") }]);
    for (const token of ["legacy", "unmatched"]) {
      expect(() => authenticateAgentClaimRequest(`Bearer ${token}`, legacy, undefined, conflicting))
        .toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
    }
    expect(() => authenticateAgentClaimRequest("Bearer new", legacy, digest("new"), additional))
      .toThrowError(new AgentClaimAuthError("UNCONFIGURED"));
  });

  it("allows the same main identity across legacy, bootstrap and additional sources", () => {
    const main = JSON.stringify([{ agentId: "main", tokenSha256: digest("main") }]);
    expect(authenticateAgentClaimRequest("Bearer main", main, digest("main"), main)).toEqual({ agentId: "main" });
  });

  it("rejects unmatched tokens even with additions", () => {
    expect(() => authenticateAgentClaimRequest("Bearer unknown", legacy, undefined, additional))
      .toThrowError(new AgentClaimAuthError("UNAUTHORIZED"));
  });
});
