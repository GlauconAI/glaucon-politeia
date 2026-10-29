function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class ConcertoClientError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "ConcertoClientError";
    this.code = code;
    this.status = status;
  }
}

// Explicit native SecretRefs take precedence. An unresolved ref never silently
// selects a legacy credential, and only the host-context Agent path is queried.
export function resolveContextToken({agentId,config,getRuntimeConfig,assertAvailable,env}) {
  if(typeof agentId!=="string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(agentId))return null;
  let current;
  try {
    const runtime=getRuntimeConfig?.();
    if(runtime?.plugins?.enabled===false)return null;
    current=runtime?.plugins?.entries?.["openclaw-concerto"];
  }
  catch { return null; }
  if(current?.enabled===false)return null;
  if(Object.hasOwn(config.agentTokens??{},agentId) || Object.hasOwn(current?.config?.agentTokens??{},agentId)) {
    if(typeof getRuntimeConfig!=="function" || typeof assertAvailable!=="function")return null;
    try { assertAvailable(`plugins.entries.openclaw-concerto.config.agentTokens.${agentId}`); }
    catch { return null; }
    const value=current?.config?.agentTokens?.[agentId];
    return typeof value==="string" && value.trim().length>=16 ? value.trim() : null;
  }
  return parseAgentTokens(env[config.tokenEnv??"CONCERTO_AGENT_API_TOKENS"])[agentId]??null;
}

export function createConcertoRequest({ baseUrl, timeoutMs = 10_000, fetchImpl = fetch }) {
  const root = new URL(baseUrl);
  if (root.protocol !== "https:") throw new Error("Concerto base URL must use HTTPS");
  return async ({ method, path, query, body, token }) => {
    const url = new URL(path, root);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ConcertoClientError("UNAVAILABLE", 503);
    }
    const payload = safeJson(await response.text());
    if (!response.ok) {
      throw new ConcertoClientError(
        typeof payload?.error === "string" ? payload.error : "UNAVAILABLE",
        response.status,
      );
    }
    return payload;
  };
}

export function parseAgentTokens(raw) {
  if (!raw) return {};
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const tokens = {};
  for (const [agentId, token] of Object.entries(value)) {
    if (/^[a-z][a-z0-9-]{0,79}$/u.test(agentId) && typeof token === "string" && token.length >= 16) {
      tokens[agentId] = token;
    }
  }
  return tokens;
}
