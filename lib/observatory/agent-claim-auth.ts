import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { AgentIdSchema } from "@/lib/observatory/agent-claims";

const ClaimKeySchema = z.strictObject({
  agentId: AgentIdSchema,
  tokenSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const ClaimKeysSchema = z.array(ClaimKeySchema).min(1).max(32);

export type AgentClaimAuthErrorCode = "UNCONFIGURED" | "UNAUTHORIZED";

export class AgentClaimAuthError extends Error {
  readonly code: AgentClaimAuthErrorCode;

  constructor(code: AgentClaimAuthErrorCode) {
    super(code);
    this.name = "AgentClaimAuthError";
    this.code = code;
  }
}

export function parseAgentClaimKeys(raw: string | undefined) {
  if (!raw) throw new AgentClaimAuthError("UNCONFIGURED");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AgentClaimAuthError("UNCONFIGURED");
  }
  const validation = ClaimKeysSchema.safeParse(parsed);
  if (!validation.success) {
    throw new AgentClaimAuthError("UNCONFIGURED");
  }
  const agentIds = new Set<string>();
  const hashes = new Set<string>();
  for (const entry of validation.data) {
    if (agentIds.has(entry.agentId) || hashes.has(entry.tokenSha256)) {
      throw new AgentClaimAuthError("UNCONFIGURED");
    }
    agentIds.add(entry.agentId);
    hashes.add(entry.tokenSha256);
  }
  return validation.data;
}

function bearerToken(authorization: string | null) {
  if (!authorization) throw new AgentClaimAuthError("UNAUTHORIZED");
  const match = /^Bearer ([^\s]+)$/u.exec(authorization);
  if (!match) throw new AgentClaimAuthError("UNAUTHORIZED");
  return match[1];
}

export function authenticateAgentClaimRequest(
  authorization: string | null,
  rawConfiguration: string | undefined,
): { agentId: string } {
  const keys = parseAgentClaimKeys(rawConfiguration);
  const presentedHash = createHash("sha256")
    .update(bearerToken(authorization))
    .digest();

  let matchedAgentId: string | null = null;
  for (const entry of keys) {
    const expectedHash = Buffer.from(entry.tokenSha256, "hex");
    if (
      expectedHash.length === presentedHash.length &&
      timingSafeEqual(expectedHash, presentedHash)
    ) {
      matchedAgentId = entry.agentId;
    }
  }
  if (!matchedAgentId) throw new AgentClaimAuthError("UNAUTHORIZED");
  return { agentId: matchedAgentId };
}
