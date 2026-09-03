# Work Tracker Project Version Contract v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Work Tracker Project Version feature to satisfy the approved Project Flow version-control v1 contract without changing existing Project scope.

**Architecture:** Apply one additive Supabase migration over the current normalized version model, then extend the domain, repository/actions, and existing manager/detail UI. Keep release authority server-side, preserve historical data and labels, and fail closed on ambiguous production data.

**Tech Stack:** PostgreSQL/Supabase SQL, Next.js 16, React 19, TypeScript 6, Zod 4, Vitest/Testing Library.

---

### Task 1: Lock the canonical domain contract

**Files:**
- Modify: `lib/observatory/project-versions.ts`
- Modify: `tests/observatory-project-versions.test.ts`

- [ ] Add failing tests for strict `MAJOR.MINOR.PATCH`, the six lifecycle states, allowed transitions, release-target and Gate input fields.
- [ ] Run `npm test -- tests/observatory-project-versions.test.ts` and confirm the expected failures.
- [ ] Implement the smallest domain/schema changes that satisfy the tests.
- [ ] Re-run the focused test and `git diff --check`.

### Task 2: Add the additive database contract

**Files:**
- Create: `supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql`
- Create: `tests/observatory-project-version-contract-v1-migration.test.ts`
- Create: `scripts/observatory/verify-project-version-contract-v1.ts`
- Create: `tests/observatory-project-version-contract-v1-script.test.ts`
- Modify: `package.json`

- [ ] Write failing SQL/script contract tests for every required field, lifecycle, one execution version, single release target, Work Item binding kind, immutable released/archived scope, release Gate, RLS/grants, preflight, and rollback output.
- [ ] Run the focused tests and confirm missing migration/script failures.
- [ ] Implement the transaction-wrapped migration and read-only `status/check` plus explicit `apply` verifier.
- [ ] Re-run focused tests. Run `check` offline far enough to prove missing database configuration fails safely without exposing secrets.

### Task 3: Extend repository and server actions

**Files:**
- Modify: `lib/observatory/repository.ts`
- Modify: `lib/observatory/work-items.ts`
- Modify: `app/observatory/actions.ts`
- Modify: `tests/observatory-repository.test.ts`
- Modify: `tests/observatory-actions.test.ts`
- Modify: `tests/observatory-work-items.test.ts`

- [ ] Add failing tests for expanded version RPC payloads, stable error mapping, and `required | optional` Work Item bindings.
- [ ] Run focused tests and verify RED.
- [ ] Implement repository/action/input changes without changing execution authorization.
- [ ] Re-run focused tests and typecheck.

### Task 4: Upgrade the manager into a version roadmap

**Files:**
- Modify: `components/observatory/ProjectVersionManager.tsx`
- Modify: `components/observatory/ProjectVersionPicker.tsx`
- Modify: `components/observatory/QuickCapture.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `app/globals.css`
- Modify focused component tests.

- [ ] Add failing component tests for all six statuses, SemVer, release target, predecessor and authority refs, Gate summary, and required/optional binding controls.
- [ ] Run focused tests and verify RED.
- [ ] Implement accessible, compact roadmap and binding controls using existing Work Tracker patterns.
- [ ] Re-run focused tests, lint, and typecheck.

### Task 5: Evidence, review, and stop at the production Gate

**Files:**
- Create: `docs/superpowers/evidence/2026-09-02-work-tracker-project-version-contract-v1.md`

- [ ] Run `npm run release:verify`, `npm run build`, and `git diff --check` from the clean feature worktree.
- [ ] Request independent review of the complete diff; fix Critical/Important findings and rerun affected verification.
- [ ] Record canonical input hashes, commit/diff evidence, test counts, migration preflight behavior, compatibility decisions, and forward-only rollback instructions.
- [ ] Use the host-owned release-prepare entry only after all local gates pass.
- [ ] Do not apply the production migration or merge until the required explicit authorization Gate is satisfied.

## Plan self-review

Every canonical Work Tracker requirement maps to a task. No Orchestrator contract or existing Project scope is modified. Production migration, merge, and deployment remain outside the executor's implicit authority.
