import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

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
