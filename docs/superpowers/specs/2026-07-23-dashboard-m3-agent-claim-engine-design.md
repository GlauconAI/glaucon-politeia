# Dashboard M3 Low-risk Agent Claim Engine Design

**Status:** Recommended design pre-approved by Glaucon's 2026-07-23 instruction to continue subsequent M3 work using Plato's recommended choices.

**Scope:** Deliver OBS-F501: bounded low-risk eligibility, owner-approved claim policy, authenticated agent claim paths, leases, timeout recovery, idempotency, concurrency control, human review, and complete audit evidence.

**Out of scope:** executing arbitrary commands inside Vercel, autonomous production deployment, external-system writes, Gateway control, high-risk automation, non-admin policy editing, and permanent production runner credentials.

## Outcome

A trusted agent runner can claim exactly one eligible Ready Feature or Bug, receive an explicit path/action boundary, renew a bounded lease, and submit evidence into Review. The engine cannot move work directly to Done. An administrator remains the policy owner and final human Gate.

The claim engine coordinates work; it does not execute work. The runner is responsible for enforcing the returned authorized paths and action classes, and release verification proves its diff stayed inside that boundary.

## Approaches considered

### 1. Database-authoritative leases behind a bounded runner API — selected

PostgreSQL owns eligibility, row locking, leases, idempotency, recovery, state transitions, and append-only events. A server-only API authenticates a configured agent bearer token, derives the agent identity from the matching token hash, and invokes service-role-only RPCs.

This preserves one source of truth, handles concurrency atomically, and keeps agent credentials out of tables and browser code.

### 2. Client-side claim orchestration — rejected

A browser or runner could read Ready items and then issue separate updates. That creates races between selection and update, weakens timeout recovery, and cannot provide an atomic audit trail.

### 3. Direct service-role database access from every agent — rejected

Giving runners the Supabase service-role secret creates an unnecessarily broad credential and makes agent identity caller-supplied and spoofable. The route boundary must authenticate the runner and expose only claim operations.

## Trust and credential boundary

`OBSERVATORY_AGENT_CLAIM_KEYS` is an optional server-only JSON array:

```json
[
  {
    "agentId": "plato",
    "tokenSha256": "<64 lowercase hexadecimal characters>"
  }
]
```

The owner supplies each raw runner token outside the repository. The application stores only SHA-256 hashes in the environment. The API hashes the presented bearer token, performs constant-time comparison, and derives `agentId` from the matched record. Agent identity is never accepted from request JSON.

If configuration is absent or invalid, the claim API fails closed with a stable `503`. Missing or invalid bearer credentials return `401`. No token, hash, authorization header, raw database error, or private path appears in logs or responses.

The existing `SUPABASE_SECRET_KEY` remains server-only and is used solely by the route-to-RPC repository. Claim RPC execution is granted only to `service_role`.

## Eligibility and human approval

Work items gain:

- `risk_level`: `unclassified`, `low`, or `high`;
- `agent_claim_enabled`: owner approval, default `false`;
- `authorized_paths`: one to sixteen normalized repository-relative POSIX paths;
- `allowed_action_classes`: one or more of `code_edit`, `test`, or `documentation`;
- `claim_approved_by` and `claim_approved_at`.

An item is eligible only when all conditions are true:

1. type is Feature or Bug;
2. state is Ready;
3. Ready Gate is complete;
4. risk is Low;
5. agent claiming is explicitly enabled by an administrator;
6. at least one authorized path and action class is present;
7. no active unexpired claim exists.

Ideas, unclassified/high-risk work, absolute paths, traversal paths, empty boundaries, and production/external/Gateway action classes are ineligible. High-risk work remains manual. Disabling eligibility clears approval metadata and is forbidden while a live claim exists.

The administrator edits these fields through the existing item detail surface. Every policy change uses `expected_version`, a row lock, and an append-only `claim_policy_updated` event.

## Claim and lease model

`observatory_work_item_claims` stores one row per claim attempt:

- claim/work-item IDs;
- agent ID and idempotency key;
- request fingerprint;
- status: `active`, `completed`, `released`, `expired`, or `cancelled`;
- claim version;
- started, heartbeat, expiry, and ended timestamps;
- completion summary and result evidence URL.

A partial unique index permits only one active claim per work item. A unique agent/idempotency key makes retries deterministic. Same-key/same-request retries return the original claim; same-key/different-request calls fail with a stable conflict.

Lease duration is 5–60 minutes; the default is 15 minutes. Claiming atomically:

1. expires stale claims encountered by the selection;
2. selects an eligible item using row locks and `skip locked`;
3. inserts the active claim;
4. moves Ready to In Progress;
5. increments the work-item version;
6. appends `claim_started` and `state_transitioned` events.

Priority ordering is Urgent, High, Medium, Low, then oldest update/ID. Risk and eligibility are independent of business priority.

Heartbeat requires claim ID, agent identity derived from the bearer token, expected claim version, and bounded lease duration. It fails after expiry or for a different agent.

Release moves an active claim back to Ready and appends release plus transition events. Explicit sweeping and every new claim request expire overdue claims; expiry moves an unchanged In Progress item back to Ready. If an administrator has already changed the item after cancelling the claim, recovery changes only the claim record.

## Completion and human Gate

Agent completion requires:

- active, unexpired lease owned by the authenticated agent;
- expected claim and work-item versions;
- bounded completion summary;
- one valid HTTP(S) evidence URL.

Completion atomically marks the claim Completed, records agent-created evidence, moves In Progress to Review, increments the work item, and appends `claim_completed`, `evidence_added`, and `state_transitioned` events.

An agent cannot move Review to Done. The existing administrator transition performs the final approval. Administrators can cancel an active claim; cancellation returns an unchanged In Progress item to Ready and preserves the entire claim/audit history.

## Principal-aware audit

Existing human events retain `actor_id`. Agent events use a bounded `agent_id`. The event table enforces exactly one principal. Agent-created completion evidence uses `created_by_agent`; existing human evidence retains `created_by`. Direct table writes remain denied.

History renders stable summaries only. It does not render bearer tokens, token hashes, raw request fingerprints, private paths beyond the administrator-approved relative boundary, or database errors.

## Application surfaces

- `lib/observatory/agent-claims.ts`: claim enums, schemas, eligibility reasons, environment parsing, and safe response projections.
- `lib/observatory/claim-repository.ts`: service-role-only RPC adapter and stable error mapping.
- `app/api/dashboard/work-items/claims/route.ts`: claim-next/specific and sweep operations.
- `app/api/dashboard/work-items/claims/[id]/route.ts`: heartbeat, release, and completion.
- Existing admin actions/repository/detail UI: policy editing, cancellation, eligibility summary, active lease, and chronological claim history.

API JSON is strict, size-bounded, and rejects unknown fields. Responses include only IDs, status, versions, lease expiry, item title/type/priority, authorized paths/action classes, and stable errors.

## Failure behavior

- unauthorized runner: `401`;
- unconfigured engine: `503`;
- no eligible work: `204`;
- idempotency conflict, stale versions, active-claim race, expired lease, or invalid state: stable `409`;
- invalid body/boundary: `400`;
- unexpected dependency failure: generic `503`.

Retries never duplicate claims, evidence, or events. No error response contains database text.

## Verification Gate

TDD covers:

- strict environment/body schemas and constant-time credential matching;
- all eligibility reasons and path normalization;
- repository/RPC mapping and safe API status codes;
- admin policy controls and human-only Done;
- claim/heartbeat/release/complete/cancel/sweep behavior;
- idempotency payload conflicts;
- concurrent claim attempts and `skip locked`;
- expired-lease recovery;
- append-only principal-aware events and evidence;
- exact grants/RLS/direct-write denial;
- empty, unauthorized, unconfigured, and failure states.

A disposable Supabase Gate must apply every migration from zero and verify real anonymous, non-admin, admin, and service-role behavior. Final application verification runs the complete test suite, lint, typecheck, production build, diff/private-path/credential scans, and M1/M2 regressions.

Production migration, runner-token configuration, shared-main push, deployment, and production agent claims remain explicit release operations.

### Accepted pilot clarification

The 2026-07-23 disposable pilot confirmed that this service is a coordination
and authorization boundary. It returns the exact approved paths and action
classes, but does not execute or sandbox an external runner. Runner
integration must compare the actual changed-file set with that boundary
before calling completion. This clarification narrows no database protection:
claims, versions, leases, state transitions, evidence, and audit remain
PostgreSQL-authoritative.

## Rollback

Before production, discard or revert the feature commits.

After migration, roll back the application first. Do not delete claims, evidence, or events. Schema/RPC correction uses a reviewed forward migration. Removing runner configuration immediately disables new API claims without mutating existing audit history; overdue claims remain recoverable through the explicit sweep path.
