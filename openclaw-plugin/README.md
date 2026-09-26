# OpenClaw Concerto Plugin

This Plugin exposes typed, browser-free Concerto Work Item tools to registered
OpenClaw Agents. Concerto remains the authorization and lifecycle authority.

## Configuration

```json
{
  "baseUrl": "https://402v.com",
  "tokenEnv": "CONCERTO_AGENT_API_TOKENS",
  "timeoutMs": 10000
}
```

`CONCERTO_AGENT_API_TOKENS` is a protected environment value containing a JSON
object keyed by canonical Agent ID. Never put it in repository files or tool
arguments.

```json
{
  "plato": "<owner-provided-token>",
  "aristotle": "<owner-provided-token>"
}
```

Agents without a configured token receive no Concerto tools. The Plugin never
accepts caller-supplied identity and never exposes token values in results or
errors.

## Agent workflow

1. Call `concerto_list_work_items` or `concerto_get_work_item` and read the
   returned `version`, `allowedActions`, and `allowedTransitions`.
2. Use that exact version as `expected_version` for one mutation.
3. Generate a stable, operation-specific `idempotency_key`; reuse it only when
   retrying the exact same request.
4. On `VERSION_CONFLICT`, read the item again and reconsider the mutation. Do
   not blindly replay with the new version.
5. Ordinary Agents submit completed execution to `review`. Only the canonical
   Project Owner performs final `done` or `reopened` transitions and assigns
   another Agent.

Do not use Chrome automation, direct Supabase writes, or arbitrary HTTP calls
for these operations.

## Activation boundary

Building and testing this package does not activate it. Installation or config
changes must stop at `READY_FOR_ACTIVATION`; an independent Operator activates
it during an idle window with a complete Gateway restart. Do not hot reload the
Orchestrator or this Plugin from an active Agent turn.
