# Dashboard M3 Agent Claim Dogfood Pilot Review

Date: 2026-07-23
Environment: disposable local Supabase plus local Next.js API
Result: Production Accepted; Engine deployed dormant

## Scope

The pilot exercised the production-shaped interfaces without touching the
production database, Vercel, shared `main`, Gateway, Cron, or any external
runner. A fixture bearer token was supplied only to the loopback Next.js
process. The database was recreated from zero immediately before the run.

The Claim Engine is a coordination and authorization boundary. It returns the
administrator-approved paths and action classes; it does not execute shell
commands or technically sandbox an external runner. A runner must compare its
actual diff with the returned boundary before completion. Production runner
registration and token configuration remain a separate owner-approved Gate.

## Feature pilot

- Title: `M3-CLAIM-PILOT-FEATURE`
- Work item: `a5246793-0496-445f-9975-698ee5c8d078`
- Claim: `70fc12bb-42a4-464d-954d-e1e72cda0417`
- Type/risk: Feature / Low
- Authorized paths:
  - `components/observatory/WorkTrackerBoard.tsx`
  - `tests/observatory-work-tracker-board.test.tsx`
- Allowed actions: `code_edit`, `test`
- Flow: Ready v5 → claim/In Progress v6 → heartbeat claim v2 →
  complete/Review v7 → human Done v8
- Result: the API returned exactly the approved boundary; completion stopped
  at Review; the administrator performed the final Done transition.

The related application change is commit
`1744adf92b8ae917edef683c15469156800fe05e`. It adds the compact Manual /
Agent eligible / Claimed-by badge and preserves the keyboard move control.
That commit also contains the server read integration and styling needed to
display active claims. The pilot does not misrepresent that pre-pilot commit
as an externally executed agent diff.

## Bug pilot

- Title: `M3-CLAIM-PILOT-BUG`
- Work item: `2e48b4df-5221-46d5-9d0e-14e4bc08cc52`
- Claim: `a490611c-444a-44ff-aad4-f5fe5d5ff568`
- Type/risk: Bug / Low
- Authorized paths:
  - `components/observatory/WorkItemDetail.tsx`
  - `tests/observatory-work-item-detail.test.tsx`
- Allowed actions: `code_edit`, `test`
- Flow: Ready v5 → claim/In Progress v6 → heartbeat claim v2 →
  complete/Review v7 → human Done v8
- Defect: a terminal claim with a historical future `lease_expires_at` must
  never expose Active cancellation controls.
- Result: terminal status plus `ended_at` wins over the historical expiry.
  The focused regression test and live completed claim both passed.

The fix is contained in
`e4c391b47ca8d7cc162bd4e8a6107ec3169965f0`, alongside the administrator
Claim Policy surface that required the effective-active calculation.

## Control and totals

- High-risk control:
  `ea2bc706-0478-4afd-90f9-046ae035af22`
- Claim response: HTTP 204
- Mutation after denial: none; state and version were unchanged.
- Two accepted pilot items:
  - claims: 2
  - append-only events: 24
  - agent evidence rows: 2
  - final state: Done for both

All six claim/heartbeat/complete requests returned HTTP 200. The high-risk
request returned HTTP 204. No response contained a token, token hash,
database message, absolute private path, or service credential.

## Supporting Gates

- `supabase db reset --local --no-seed`: every migration applied from zero
  through `20260723000200_observatory_agent_claim_engine.sql`.
- Existing Work Tracker verifier: 32/32.
- Agent Claim live verifier: 42/42.
- Pilot driver contract: 3/3.
- Board/repository/page focused regression: 45/45.

## Decision

The local M3 Agent Claim Engine and Dashboard Dogfood Pilot are accepted as a
Production Candidate. The bounded policy remains:

1. Feature or Bug only.
2. Ready Gate complete.
3. administrator-approved Low risk only.
4. one to sixteen repository-relative paths.
5. only `code_edit`, `test`, or `documentation`.
6. 5–60 minute lease.
7. Agent completion stops at Review.
8. human administrator owns Done.

Production migration, `OBSERVATORY_AGENT_CLAIM_KEYS`, shared-main integration,
push, deployment, and any production claim remain explicit release actions.

## Production release

The owner authorized the production migration, shared-main integration, and
Vercel release with the safe default: do not configure a runner token and do
not create a production claim.

- Migration `20260723000200_observatory_agent_claim_engine.sql` was the only
  clean-worktree dry-run change and was applied successfully.
- Production RLS, grants, principal constraints, runner RPCs, administrator
  RPCs, and the active-claim write guard passed read-only verification.
- Application deployment `dpl_GNKqoTKeaQSGXGgBjU89MTXpHcCx` reached `READY`
  for commit `dc2f2bd52c1597bde9f191b0a93695f352d70de1`.
- Authenticated Board and item-detail Claim Policy UI smoke passed without
  browser or console errors.
- Anonymous Dashboard/detail protection and the legacy `/observatory`
  redirect passed.
- With `OBSERVATORY_AGENT_CLAIM_KEYS` absent, all runner mutation routes fail
  closed with HTTP 503 `unavailable`.
- The claims table is empty and both retained production Work Items remain
  Agent-disabled.

The local two-item dogfood proved the workflow. The production release proves
the dormant safety boundary. Real runner activation remains a separate,
owner-approved operation.
