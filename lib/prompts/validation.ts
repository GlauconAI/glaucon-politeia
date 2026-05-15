export type PromptPayload = {
  content: string;
  clientSessionId: string;
  sourceUrl: string;
  idempotencyKey: string;
};

export type PromptFlags = {
  has_sensitive: boolean;
  sensitive_hits: { type: string }[];
};

export function validatePromptPayload(value: unknown):
  | { ok: true; payload: PromptPayload }
  | { ok: false; error: string } {
  const payload = value as Partial<PromptPayload>;
  const content = payload.content?.trim() ?? "";

  if (content.length < 3 || content.length > 20000) {
    return { ok: false, error: "content length must be between 3 and 20000" };
  }

  if (!payload.clientSessionId || !payload.sourceUrl || !payload.idempotencyKey) {
    return { ok: false, error: "missing required prompt fields" };
  }

  try {
    new URL(payload.sourceUrl, "http://localhost");
  } catch {
    return { ok: false, error: "invalid sourceUrl" };
  }

  return {
    ok: true,
    payload: {
      content,
      clientSessionId: payload.clientSessionId,
      sourceUrl: payload.sourceUrl,
      idempotencyKey: payload.idempotencyKey,
    },
  };
}

export function detectSensitivePromptContent(content: string): PromptFlags {
  const hits: { type: string }[] = [];

  if (content.includes("sk-")) hits.push({ type: "openai_key" });
  if (content.includes("sb_publishable_")) hits.push({ type: "supabase_publishable" });
  if (content.includes("sb_secret_")) hits.push({ type: "supabase_secret" });
  if (content.includes("eyJ")) hits.push({ type: "jwt_like" });

  return { has_sensitive: hits.length > 0, sensitive_hits: hits };
}
