# API Contracts

Most content and profile behavior can use Supabase server/browser clients directly through domain helpers. Dedicated API routes are required for Prompt capture and admin operations because they need validation, idempotency, CSV output, service-role behavior, or admin authorization.

## Auth Callback

### `GET /auth/callback`

Query:

- `code`: OAuth code.
- `redirectTo`: optional destination path.

Behavior:

- Exchange `code` for a Supabase session.
- Ensure profile exists when possible.
- Redirect to `redirectTo` or `/`.
- On missing/invalid code, redirect to `/auth` with an error state.

## Prompt Ingest

### `POST /api/prompts`

Access:

- Anonymous and authenticated clients.

Request JSON:

```json
{
  "content": "string",
  "clientSessionId": "string",
  "sourceUrl": "string",
  "idempotencyKey": "string"
}
```

Validation:

- `content.trim().length` must be between 3 and 20000.
- `clientSessionId` must be non-empty and reasonably bounded.
- `sourceUrl` must be a valid URL or valid site-relative URL normalized by the server.
- `idempotencyKey` must be non-empty and bounded.
- User agent is truncated to 512 characters.

Responses:

```json
// 201
{ "id": "uuid", "createdAt": "iso-string" }
```

```json
// 200
{ "id": "uuid", "createdAt": "iso-string", "idempotent": true }
```

Errors:

- `400` invalid request.
- `500` insert/query failure.

## Prompt Query

### `GET /api/prompts`

Access:

- Admin only.

Query:

- `q`
- `from`
- `to`
- `userId`
- `source`
- `page`
- `pageSize`

Behavior:

- Query only rows where `deleted_at is null`.
- Default `page = 1`.
- Clamp `pageSize` to `1..100`.
- Sort by `created_at desc`.
- Use full-text search for `q`.

Response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

## Prompt Bulk Operations

### `POST /api/prompts/bulk`

Access:

- Admin only.

Request JSON:

```json
{
  "ids": ["uuid"],
  "op": "mark",
  "reason": "manual"
}
```

Validation:

- `ids` length must be `1..500`.
- Every id must be UUID-shaped.
- `op` must be `mark`, `unmark`, or `delete`.
- `reason` is required for `mark` and bounded in length.

Behavior:

- `mark`: set `marked = true`, set `marked_reason`.
- `unmark`: clear `marked` and `marked_reason`.
- `delete`: soft delete by setting `deleted_at`.

## Prompt CSV Export

### `GET /api/prompts/export`

Access:

- Admin only.

Query:

- Same filters as `GET /api/prompts`.

Behavior:

- Export at most 10000 rows.
- Sort by `created_at desc`.
- Return `text/csv; charset=utf-8`.
- Filename: `prompts.csv`.
- Escape commas, quotes, and newlines correctly.

## Prompt Stats

### `GET /api/prompts/stats`

Access:

- Admin only.

Behavior:

- Call RPC `prompts_stats_last_24h`.
- Return exactly 24 hourly buckets.
- Fill missing buckets with count `0`.

Response:

```json
{
  "items": [
    { "bucket": "2026-01-01T00:00:00.000Z", "count": 0 }
  ]
}
```

## Prompt Retention

### `POST /api/prompts/retention`

Access:

- Secret-protected server endpoint.

Headers:

- `x-retention-secret`: must equal `PROMPTS_RETENTION_SECRET`.

Behavior:

- Use service-role Supabase client.
- Call RPC `archive_prompts` with `days_old = 90`.
- Return moved row count.

Errors:

- `401` missing or wrong secret.
- `500` archival failure.

## Shared Authorization Rules

- Admin checks must read `profiles.is_admin` for the current user.
- Production non-admin access to admin pages and APIs should not reveal admin resource existence.
- Service-role client must never be imported by client components.

## Concerto Agent Work Items

### `GET /api/concerto/work-items`

Returns Work Items assigned to the authenticated Agent plus items in Projects
owned by that Agent. Optional query fields are `state`, `projectRef`, and
`limit` (`1..100`).

### `POST /api/concerto/work-items`

Creates an Inbox Work Item assigned to the authenticated Agent. The request
contains `type`, `title`, optional `description`, `projectRef`,
`projectVersionId`, `versionBindingKind`, and `idempotencyKey`.

### `GET /api/concerto/work-items/:id`

Returns one visible Work Item with `version`, `allowedActions`, and
`allowedTransitions`. An unrelated item is reported as `NOT_FOUND`.

### `PATCH /api/concerto/work-items/:id`

Executes exactly one strict command:

- `update`: mutable title, description, acceptance criteria, or priority;
- `transition`: an allowed lifecycle transition;
- `assign`: Project Owner only, to a registered Agent;
- `add_evidence`: add a bounded HTTP(S) evidence link.

Every command requires `expectedVersion` and `idempotencyKey`. The server
derives the actor from the bearer token; `agentId`, owner authority, and audit
identity cannot be supplied in the body. Ordinary Agents cannot transition to
`done` or `reopened`. Final acceptance belongs to the Project Owner.

Stable errors are `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`VERSION_CONFLICT`, `INVALID_TRANSITION`, `READY_GATE_FAILED`,
`IDEMPOTENCY_CONFLICT`, `INVALID_REQUEST`, and `UNAVAILABLE`.
