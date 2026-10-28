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

Building and testing this package does not activate it. Follow the current host's
official Plugin lifecycle and governance for the exact immutable candidate;
prefer a supported authorized hot reload during the applicable activation window.
Do not require a Gateway restart merely because this is a Plugin. If a served
turn holds the target Plugin, use the supported handoff/drain mechanism and never
bypass cleanup or detach a lifecycle action to evade that boundary. Verify the
actual loaded path/hash, tool exposure and supported API behavior after activation;
accepted commands or source tests alone do not prove availability.

## Public execution interfaces

`concerto_get_operation` reads the immutable operation receipt in exact
Project/actor/key scope. `concerto_get_project_work_snapshot` reads the existing
complete Project snapshot (Owner only). `concerto_bind_work_item_execution`
atomically binds an eligible Item to an exact Plan/Stage/Work Package using both
Item `expected_version` and complete Project `expected_project_revision` (Owner
only). Optional `intake_fingerprint` binds the original intake decision to the
same durable result and audit event. These additions require the matching server
migration and deployment; package tests do not establish live availability.

See `docs/project/concerto-public-execution-interfaces-v1.md` in the parent
repository for HTTP arguments, factual receipt shape, recovery, and required
isolated deployment verification. Existing tool contracts are unchanged.
