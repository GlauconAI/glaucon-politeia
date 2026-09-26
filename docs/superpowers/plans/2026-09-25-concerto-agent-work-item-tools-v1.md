# Concerto Agent Work Item Tools V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship browser-free, typed Concerto Work Item operations for registered OpenClaw Agents with server-enforced role, lifecycle, concurrency, idempotency, and audit controls.

**Architecture:** Extend the existing Agent Claim authentication into a shared Agent API boundary. Add service-role-only RPCs for Agent-authored mutations, expose strict Next.js JSON routes, and add a standalone `openclaw-concerto` Plugin that maps trusted tool context to those routes. Keep browser Server Actions and existing claim behavior unchanged.

**Tech Stack:** TypeScript, Next.js route handlers, Zod, Supabase PostgreSQL RPCs, Node.js OpenClaw Plugin SDK, Vitest, GitHub Actions, Vercel.

---

### Task 1: Shared Agent API schemas and authorization policy

**Files:**
- Create: `lib/observatory/agent-work-item-api.ts`
- Modify: `lib/observatory/agent-claim-auth.ts`
- Test: `tests/observatory-agent-work-item-api.test.ts`

- [ ] Write failing tests for strict list/get/create/update/transition/assign/evidence inputs, normalized Project Owner identity, ordinary-Agent visibility, Owner permissions, and final-state restrictions.
- [ ] Run `npm test -- tests/observatory-agent-work-item-api.test.ts`; confirm failures are caused by missing exports.
- [ ] Implement bounded schemas and one pure policy evaluator returning allowed actions.
- [ ] Rerun the focused test and commit.

### Task 2: Database Agent mutation contract

**Files:**
- Create: `supabase/migrations/20260926000100_concerto_agent_work_item_api.sql`
- Create: `scripts/observatory/apply-concerto-agent-work-item-api-migration.ts`
- Modify: `package.json`
- Test: `tests/observatory-agent-work-item-api-migration.test.ts`
- Test: `tests/observatory-agent-work-item-api-script.test.ts`

- [ ] Write failing source-contract tests for service-role-only functions, optimistic locking, idempotency, Agent audit attribution, grants, RLS preservation, and bounded check/apply/status deployment.
- [ ] Run both focused tests and verify RED.
- [ ] Add minimal RPCs for Agent create, update, transition, assign, and evidence; each receives the server-authenticated Agent ID and an Owner authorization decision, then rechecks item/project boundaries and records `agent_id`.
- [ ] Add a pinned production migration runner with rollback-only preflight and exact migration status.
- [ ] Rerun focused tests and commit.

### Task 3: Concerto Agent HTTP API

**Files:**
- Create: `app/api/concerto/work-items/route.ts`
- Create: `app/api/concerto/work-items/[id]/route.ts`
- Create: `lib/observatory/agent-work-item-repository.ts`
- Test: `tests/observatory-agent-work-item-route.test.ts`

- [ ] Write failing handler tests for authentication, bounded JSON, visibility, create, update, transition, Owner assign, evidence, stable errors, version results, and cache policy.
- [ ] Run the route test and verify RED.
- [ ] Implement handlers using the existing token verifier, canonical registry context, and the new RPC repository; delegate claim/complete to the existing claim repository.
- [ ] Rerun route and existing claim API tests and commit.

### Task 4: OpenClaw Concerto Plugin

**Files:**
- Create: `openclaw-plugin/openclaw.plugin.json`
- Create: `openclaw-plugin/package.json`
- Create: `openclaw-plugin/index.js`
- Create: `openclaw-plugin/src/client.js`
- Create: `openclaw-plugin/src/tools.js`
- Test: `openclaw-plugin/test/tools.test.js`

- [ ] Write failing Node tests for exact tool inventory, trusted-context identity, per-Agent token selection, timeout handling, redacted errors, strict parameter schemas, and API result mapping.
- [ ] Run `npm --prefix openclaw-plugin test` and verify RED.
- [ ] Implement the thin Plugin with native fetch, bounded timeouts, no third-party runtime dependency, and no caller-controlled identity.
- [ ] Rerun Plugin tests and commit.

### Task 5: Agent instructions and complete verification

**Files:**
- Modify: `docs/project/concerto-agent-work-item-tools-v1.md`
- Create: `docs/superpowers/reports/2026-09-25-concerto-agent-work-item-tools-v1-release.md`

- [ ] Add exact Tool selection, state-flow, conflict-retry, permission-denial, and no-browser/no-direct-Supabase guidance.
- [ ] Run focused API, migration, route, existing claim, repository, and Plugin suites.
- [ ] Run `npm run release:verify` with bounded test concurrency if required by observed host load.
- [ ] Request independent code review; fix every Critical/Important finding and rerun the affected tests plus the full gate.

### Task 6: Production release and external Plugin activation handoff

**Files:**
- Update: `docs/superpowers/reports/2026-09-25-concerto-agent-work-item-tools-v1-release.md`

- [ ] Run the migration runner `check` against the pinned production project and verify rollback-only semantic/audit probes.
- [ ] Use the host-owned Work Tracker release-prepare entry to push and open the PR; wait for CI and Preview.
- [ ] Apply the production migration, run `status`, then request one squash merge and verify the exact merge SHA.
- [ ] Wait for Vercel Production and production smoke; perform authenticated read-only acceptance.
- [ ] Stage the Plugin and protected token configuration without lifecycle mutation.
- [ ] Emit `READY_FOR_ACTIVATION` with exact commit, API health, Plugin tests, idle requirements, independent Gateway restart command, and post-restart Tool smoke. Do not reload any Plugin or restart Gateway from the active Agent turn.

## Self-review

- Coverage: API, DB, native Tools, identity, permissions, concurrency, audit, documentation, migration, release, and activation are mapped to tasks.
- Scope: no bulk/delete/scheduler/natural-language mutation.
- Consistency: ordinary completion ends in Review; Project Owner alone performs final acceptance transitions.
- Deployment: web/API may deploy in this Project; Plugin activation remains an external idle restart boundary.
