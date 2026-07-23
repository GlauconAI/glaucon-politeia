# Dashboard M3 Agent Claim And Dogfood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure low-risk Agent Claim Engine and prove it through a disposable two-item Dashboard dogfood pilot.

**Architecture:** PostgreSQL RPCs own eligibility, locks, leases, recovery, state transitions, and audit. A server-only bearer-token boundary derives agent identity from configured token hashes and exposes strict claim endpoints. Existing admin UI owns policy approval, cancellation, and final Done; the pilot exercises the same interfaces against disposable Supabase.

**Tech Stack:** Next.js 16 Server Routes and Server Actions, React 19, TypeScript 6, Zod 4, Supabase/PostgreSQL PL/pgSQL, Vitest/Testing Library, Node crypto.

---

### Task 1: Claim domain and runner authentication

**Files:**
- Create: `lib/observatory/agent-claims.ts`
- Create: `lib/observatory/agent-claim-auth.ts`
- Test: `tests/observatory-agent-claims.test.ts`
- Test: `tests/observatory-agent-claim-auth.test.ts`

- [ ] **Step 1: Write failing domain tests**

Cover strict parsing of risk levels, action classes, relative authorized paths, lease bounds, request bodies, safe claim projections, every eligibility reason, and rejection of Ideas/high-risk/unapproved work.

```ts
expect(
  getAgentClaimEligibility({
    type: "feature",
    state: "ready",
    readyGateComplete: true,
    riskLevel: "low",
    enabled: true,
    authorizedPaths: ["components/observatory"],
    allowedActionClasses: ["code_edit", "test"],
    activeClaim: false,
  }),
).toEqual({ eligible: true, reasons: [] });
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/observatory-agent-claims.test.ts`

Expected: FAIL because the claim domain module does not exist.

- [ ] **Step 3: Implement the minimal strict domain**

Export fixed enums, Zod schemas, length limits, `normalizeAuthorizedPaths`, `getAgentClaimEligibility`, request/response types, and stable public error codes. Paths must be POSIX-relative, contain no empty/dot/traversal segment, and stay within 240 characters.

- [ ] **Step 4: Write and verify failing auth tests**

Test absent/malformed configuration, malformed Bearer headers, SHA-256 matching, agent identity derivation, constant-time comparison, duplicate agent IDs/hashes, and redacted errors.

- [ ] **Step 5: Implement runner authentication**

Parse `OBSERVATORY_AGENT_CLAIM_KEYS` once per request boundary. Hash the presented token with Node `crypto`, compare 32-byte hashes using `timingSafeEqual`, and return only the matched `agentId`.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
npm test -- tests/observatory-agent-claims.test.ts tests/observatory-agent-claim-auth.test.ts
npm run typecheck
git add lib/observatory/agent-claims.ts lib/observatory/agent-claim-auth.ts tests/observatory-agent-claims.test.ts tests/observatory-agent-claim-auth.test.ts
git commit -m "feat: define agent claim boundaries"
```

Expected: all focused tests and typecheck pass.

### Task 2: Production-safe claim schema and RPC contract

**Files:**
- Create: `supabase/migrations/20260723000200_observatory_agent_claim_engine.sql`
- Modify: `tests/observatory-migration.test.ts`

- [ ] **Step 1: Add failing migration contract tests**

Assert:

- policy columns and checks on work items;
- principal-aware events and agent-created evidence;
- claims table, statuses, indexes, RLS, and exact grants;
- admin policy/cancel RPCs granted only to authenticated;
- claim/renew/release/complete/sweep RPCs granted only to service role;
- no direct insert/update/delete grant on claims;
- explicit stable error markers.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/observatory-migration.test.ts`

Expected: FAIL because migration `20260723000200` is absent.

- [ ] **Step 3: Implement tables and constraints**

Add `risk_level`, `agent_claim_enabled`, `authorized_paths`, `allowed_action_classes`, `claim_approved_by`, and `claim_approved_at`. Add claims with active-claim and agent/idempotency uniqueness. Extend events/evidence so exactly one human or agent principal is present.

- [ ] **Step 4: Implement RPCs**

Create:

```sql
configure_observatory_agent_claim_policy(...)
claim_observatory_work_item(...)
renew_observatory_work_item_claim(...)
release_observatory_work_item_claim(...)
complete_observatory_work_item_claim(...)
cancel_observatory_work_item_claim(...)
sweep_observatory_work_item_claims(...)
```

Every RPC uses row locks, validates expected versions, writes events atomically, and emits no secrets. Claim and sweep use `skip locked`; completion creates HTTP(S) evidence and moves only to Review.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
npm test -- tests/observatory-migration.test.ts
git diff --check
git add supabase/migrations/20260723000200_observatory_agent_claim_engine.sql tests/observatory-migration.test.ts
git commit -m "feat: add agent claim database contract"
```

### Task 3: Claim repository and stable error mapping

**Files:**
- Create: `lib/observatory/claim-repository.ts`
- Modify: `lib/observatory/repository.ts`
- Test: `tests/observatory-claim-repository.test.ts`
- Modify: `tests/observatory-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Specify RPC argument names, claim/history row projections, active/effective-expired semantics, and mappings for forbidden, no work, version conflict, idempotency conflict, expired lease, ownership mismatch, invalid boundary, and dependency failure.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/observatory-claim-repository.test.ts`

- [ ] **Step 3: Implement repository adapters**

Keep service-role claim calls in `claim-repository.ts`; keep authenticated admin policy/cancel/read calls in the existing repository. Return stable typed errors and bounded rows only.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npm test -- tests/observatory-claim-repository.test.ts tests/observatory-repository.test.ts
npm run typecheck
git add lib/observatory/claim-repository.ts lib/observatory/repository.ts tests/observatory-claim-repository.test.ts tests/observatory-repository.test.ts
git commit -m "feat: add agent claim repositories"
```

### Task 4: Runner claim API

**Files:**
- Create: `app/api/dashboard/work-items/claims/route.ts`
- Create: `app/api/dashboard/work-items/claims/[id]/route.ts`
- Create: `tests/observatory-agent-claim-api.test.ts`

- [ ] **Step 1: Write failing route tests**

Test unconfigured `503`, unauthorized `401`, invalid/oversized JSON `400`, no eligible work `204`, successful claim `200`, conflict `409`, generic dependency `503`, and strict heartbeat/release/complete/sweep operations. Assert responses contain no authorization/database/private-path data beyond approved relative paths.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/observatory-agent-claim-api.test.ts`

- [ ] **Step 3: Implement routes**

Authenticate before parsing work IDs, use `request.json()` behind a bounded content-length check, validate with strict Zod schemas, inject repository factories for tests, set `Cache-Control: no-store`, and return safe JSON only.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```bash
npm test -- tests/observatory-agent-claim-api.test.ts
npm run lint
npm run typecheck
git add app/api/dashboard/work-items/claims lib/observatory/agent-claim-auth.ts tests/observatory-agent-claim-api.test.ts
git commit -m "feat: expose bounded agent claim API"
```

### Task 5: Administrator claim policy and cancellation

**Files:**
- Modify: `app/observatory/actions.ts`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `lib/observatory/work-items.ts`
- Modify: `app/dashboard/work-items/[id]/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/observatory-actions.test.ts`
- Modify: `tests/observatory-work-item-detail.test.tsx`
- Modify: `tests/observatory-work-item-page.test.tsx`

- [ ] **Step 1: Write failing model/action/UI tests**

Specify admin-only policy updates, path/action parsing, high-risk enable rejection, active-claim edit rejection, cancellation, eligibility reasons, lease/history display, keyboard operation, and the rule that agent completion stops at Review.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/observatory-actions.test.ts tests/observatory-work-item-detail.test.tsx tests/observatory-work-item-page.test.tsx
```

- [ ] **Step 3: Implement policy actions and UI**

Add a separate Claim Policy form rather than expanding the general field RPC. Render risk, enable approval, newline paths, action classes, exact eligibility reasons, current claim, claim history, and admin cancellation. Preserve the existing controlled-field reset fix.

- [ ] **Step 4: Verify accessibility and GREEN**

Run the focused tests, then:

```bash
npm run lint
npm run typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add app/observatory/actions.ts components/observatory/WorkItemDetail.tsx lib/observatory/work-items.ts app/dashboard/work-items/[id]/page.tsx app/globals.css tests/observatory-actions.test.ts tests/observatory-work-item-detail.test.tsx tests/observatory-work-item-page.test.tsx
git commit -m "feat: add admin claim policy controls"
```

### Task 6: Live disposable database verification

**Files:**
- Create: `scripts/observatory/verify-agent-claim-db.ts`
- Create: `tests/observatory-agent-claim-db-script.test.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write a failing verifier contract test**

Require exactly 42 named checks for migration/grants/RLS, actor principals, eligibility, high-risk denial, direct-write denial, idempotent retry/conflict, concurrent claims, heartbeat, release, expiry/sweep, completion/evidence, cancellation, append-only history, and rollback.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/observatory-agent-claim-db-script.test.ts`

- [ ] **Step 3: Implement the verifier**

Use the existing local Supabase test conventions, fixture users/tokens, bounded output, transaction cleanup, and explicit expected error codes. Add `observatory:verify-local-claims`.

- [ ] **Step 4: Run the real Gate**

```bash
supabase start
supabase db reset --local --no-seed
npm run observatory:verify-local-claims
```

Expected: every named check passes; API/database listeners remain loopback-only.

- [ ] **Step 5: Commit**

```bash
git add scripts/observatory/verify-agent-claim-db.ts tests/observatory-agent-claim-db-script.test.ts package.json README.md
git commit -m "test: verify live agent claim boundaries"
```

### Task 7: Dogfood pilot Feature

**Files:**
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `tests/observatory-work-tracker-board.test.tsx`
- Create: `scripts/observatory/run-agent-claim-pilot.ts`
- Test: `tests/observatory-agent-claim-pilot.test.ts`

- [ ] **Step 1: Seed and claim the Feature**

The pilot runner creates an owner-approved Low-risk Feature in the disposable database with authorized paths limited to the Board component/test and action classes `code_edit,test`. Claim it through the API with a fixture bearer token and record the returned boundary.

- [ ] **Step 2: Write and verify the failing badge test**

Require Board cards to render one of `Manual`, `Agent eligible`, or `Claimed by <agent>` from claim policy/effective lease data.

- [ ] **Step 3: Implement the minimal badge**

Add a compact text badge with no drag-only semantics and no token/expiry leakage.

- [ ] **Step 4: Heartbeat, verify path boundary, complete, and approve**

Run focused tests, compare `git diff --name-only` with authorized paths, heartbeat the claim, submit HTTPS commit evidence to Review, and use the admin RPC to move Review to Done.

- [ ] **Step 5: Commit**

```bash
git add components/observatory/WorkTrackerBoard.tsx tests/observatory-work-tracker-board.test.tsx scripts/observatory/run-agent-claim-pilot.ts tests/observatory-agent-claim-pilot.test.ts
git commit -m "feat: dogfood agent claim badge"
```

### Task 8: Dogfood pilot Bug and high-risk denial

**Files:**
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`
- Modify: `scripts/observatory/run-agent-claim-pilot.ts`

- [ ] **Step 1: Run independent claim verification**

Exercise expired/cancelled claim presentation and API recovery, then confirm the predefined accessibility defect: an expired or cancelled claim with a historical future `lease_expires_at` must never render Active controls.

- [ ] **Step 2: Seed and claim the Bug**

Create a Low-risk Bug authorized only for `components/observatory/WorkItemDetail.tsx` and `tests/observatory-work-item-detail.test.tsx`, claim it through the API, and heartbeat once.

- [ ] **Step 3: Write and verify RED**

Add one failing test reproducing the defect and run it to confirm the expected failure.

- [ ] **Step 4: Implement minimal fix and verify**

Run the focused test, authorized-path diff check, relevant regression tests, and independent verification.

- [ ] **Step 5: Complete and approve**

Submit HTTPS commit evidence to Review, perform the human Done transition, and verify the claim/evidence/event totals.

- [ ] **Step 6: Prove high-risk denial and commit**

Create a High-risk Ready control item and prove claim returns the stable ineligible/no-work result without state, lease, or event mutation.

Commit the exact Bug files and pilot driver update with:

```bash
git commit -m "fix: dogfood expired claim handling"
```

### Task 9: Pilot review and complete local M3 Gate

**Files:**
- Create: `docs/dashboard-m3-dogfood-pilot-review.md`
- Modify: `docs/dashboard-m1a-runbook.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-23-dashboard-m3-agent-claim-engine-design.md`

- [ ] **Step 1: Write the evidence review**

Record both items, exact claim/work versions, lease/heartbeat data, transition/event/evidence totals, high-risk denial, path-boundary comparisons, test commands, and a bounded policy revision decision.

- [ ] **Step 2: Run full verification**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run private-path and credential-pattern scans on the committed diff. Re-run the live disposable database verifier from a zero reset.

- [ ] **Step 3: Clean disposable runtime**

Stop Supabase without backup, verify ports `54321`/`54322` closed, restore OrbStack to its original state, and remove task-specific temporary files.

- [ ] **Step 4: Commit the candidate evidence**

```bash
git add docs/dashboard-m3-dogfood-pilot-review.md docs/dashboard-m1a-runbook.md README.md docs/superpowers/specs/2026-07-23-dashboard-m3-agent-claim-engine-design.md
git commit -m "docs: record M3 agent claim dogfood gate"
```

- [ ] **Step 5: Final branch verification**

Confirm the branch is clean, every plan requirement maps to evidence, and the committed diff contains no unrelated anonymous-engagement work. Stop before production migration, runner-token configuration, shared-main integration, push, or deployment unless the owner explicitly authorizes those new production actions.
