# Dashboard M3 Manual Work Tracker Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-only, server-authoritative manual Work Tracker from Inbox through Done with Ready Gate, Board, item detail, evidence, optimistic concurrency, and append-only history.

**Architecture:** Extend the existing audited Quick Capture schema with a guarded workflow migration and focused TypeScript domain/repository boundaries. Render an accessible native Board and detail page; keep all mutations behind admin-only atomic Supabase RPCs.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zod 4, Supabase/PostgreSQL, Vitest, Testing Library, native HTML5 drag-and-drop and CSS.

---

### Task 1: Work-item domain contract

**Files:**
- Modify: `lib/observatory/work-items.ts`
- Modify: `tests/observatory-work-items.test.ts`

- [ ] Add failing tests for the nine states, four priorities, transition graph, Ready Gate, update/transition/evidence schemas, bounded references, and HTTP(S)-only evidence URLs.
- [ ] Run `npm test -- tests/observatory-work-items.test.ts` and confirm failures are caused by the missing contract.
- [ ] Implement exported enums, labels, transition helpers, limits, and strict Zod schemas while preserving Quick Capture’s Inbox-only initial state.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit with `feat: define manual work tracker domain`.

### Task 2: Server-authoritative database workflow

**Files:**
- Create: `supabase/migrations/20260723000100_work_tracker_core.sql`
- Modify: `tests/observatory-migration.test.ts`

- [ ] Add failing migration contract tests for new fields/table, constraints, RLS/grants, transition/update/evidence RPCs, row locks, expected versions, Ready Gate, atomic events, evidence soft removal, and append-only protection.
- [ ] Run `npm test -- tests/observatory-migration.test.ts` and confirm the new migration contract is absent.
- [ ] Implement the additive migration and stable database error markers: `OBSERVATORY_VERSION_CONFLICT`, `OBSERVATORY_WORK_ITEM_NOT_FOUND`, `OBSERVATORY_INVALID_TRANSITION`, `OBSERVATORY_READY_GATE_FAILED`, and `OBSERVATORY_EVIDENCE_NOT_FOUND`.
- [ ] Run the migration contract test and confirm it passes.
- [ ] Commit with `feat: add work tracker database workflow`.

### Task 3: Repository reads and mutations

**Files:**
- Modify: `lib/observatory/repository.ts`
- Modify: `tests/observatory-repository.test.ts`

- [ ] Add failing tests for list/detail/history/evidence reads, field update, transition, evidence add/remove RPC arguments, and stable error mapping.
- [ ] Run `npm test -- tests/observatory-repository.test.ts` and confirm the missing methods fail.
- [ ] Implement focused query interfaces, row types, repository methods, and sanitized error mapping.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit with `feat: add work tracker repository`.

### Task 4: Authorized server actions

**Files:**
- Modify: `app/observatory/actions.ts`
- Modify: `tests/observatory-actions.test.ts`

- [ ] Add failing tests for authorization-first field update, transition, evidence add/remove, field errors, stable conflict/Gate/transition messages, and route revalidation.
- [ ] Run `npm test -- tests/observatory-actions.test.ts` and confirm missing action failures.
- [ ] Implement strict FormData parsing and repository calls; revalidate `/dashboard` and the item detail route after successful commits.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit with `feat: add work tracker server actions`.

### Task 5: Accessible Board

**Files:**
- Create: `components/observatory/WorkTrackerBoard.tsx`
- Create: `tests/observatory-work-tracker-board.test.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `tests/observatory-page.test.tsx`
- Modify: `app/globals.css`

- [ ] Add failing component/page tests for all state columns, empty states, card metadata/detail links, allowed move targets, keyboard submit fallback, drag event submission, conflict feedback, loading/error states, and Dashboard mounting.
- [ ] Run the focused tests and confirm the Board is missing.
- [ ] Implement the client Board with native drag enhancement and explicit forms for every allowed move; load items server-side after admin authorization.
- [ ] Add responsive/accessibility CSS without hover-only information.
- [ ] Run focused tests and commit with `feat: add accessible work tracker board`.

### Task 6: Work-item detail, evidence, and history

**Files:**
- Create: `app/dashboard/work-items/[id]/page.tsx`
- Create: `components/observatory/WorkItemDetail.tsx`
- Create: `tests/observatory-work-item-detail.test.tsx`
- Create: `tests/observatory-work-item-page.test.tsx`
- Modify: `app/globals.css`

- [ ] Add failing tests for admin redirect, not-found/unavailable states, editable fields, Ready Gate guidance, transitions, evidence add/remove, stable external links, chronological event history, and accessible labels/status feedback.
- [ ] Run the focused tests and confirm detail functionality is missing.
- [ ] Implement the server page and client detail component with expected-version hidden fields on every mutation.
- [ ] Add responsive styles and run focused tests.
- [ ] Commit with `feat: add work item detail and history`.

### Task 7: Disposable database integration Gate

**Files:**
- Modify: `scripts/observatory/verify-local-db.ts`
- Modify: `tests/observatory-migration.test.ts`

- [ ] Add failing verifier-contract assertions for the new migration and Work Tracker live checks.
- [ ] Extend the disposable verifier to cover admin/non-admin/anonymous reads, direct writes, legal/illegal transitions, Ready Gate, stale versions, event immutability, and evidence add/remove audit.
- [ ] Run the verifier-contract test.
- [ ] Start the disposable local Supabase stack, reset from migrations, run `npm run observatory:verify-local-db`, and require all checks to pass.
- [ ] Stop and remove the disposable stack; verify local ports are closed.
- [ ] Commit with `test: verify work tracker database workflow`.

### Task 8: Integrated M3 core local release Gate

**Files:**
- Modify: `README.md`
- Modify: `docs/dashboard-m1a-runbook.md`
- Modify: `docs/superpowers/specs/2026-07-23-dashboard-m3-work-tracker-core-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-dashboard-m3-work-tracker-core.md`

- [ ] Run all focused Work Tracker tests.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [ ] Run `git diff --check` and a bounded secret/private-path scan over the feature diff.
- [ ] Verify System Observatory, all M2 views, Quick Capture, anonymous `/dashboard`, and legacy `/observatory` regressions.
- [ ] Record exact evidence and rollback steps in the runbook and README.
- [ ] Mark completed plan checkboxes and commit with `docs: record M3 work tracker core local gate`.
- [ ] Stop before shared-main push, production Supabase migration, Vercel deployment, or retained production mutations unless the user explicitly authorizes those release actions.
