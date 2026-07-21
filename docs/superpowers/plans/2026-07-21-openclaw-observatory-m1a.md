# OpenClaw Observatory M1A Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to execute this plan task-by-task. Every task follows TDD and must pass spec review before code-quality review.

**Goal:** Deliver a locally runnable 402V vertical slice that safely collects the core OpenClaw system map, validates and publishes a versioned snapshot, renders an admin-only Observatory overview, and accepts audited Idea / Feature / Bug quick capture.

**Architecture:** A local read-only collector converts whitelisted OpenClaw CLI output and Socrates' canonical registry JSON into a versioned Zod-validated snapshot. A service-role-only publisher inserts successful snapshots into Supabase. The Next.js feature reads the latest successful snapshot behind an admin guard. Quick Capture is a separate audited write model; the system-observation and delivery views never write back to their sources.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4.4.3, Supabase/Postgres/RLS, Vitest, Testing Library, Node 25 native TypeScript stripping.

**Scope:** M1A only. Full drag-and-drop Board, Project Cockpit, production migration, production snapshot publication, public deployment, Cron automation, and Gateway changes remain outside this plan.

---

## Task 1: Versioned snapshot contract and canonical registry parser

**Baseline mapping:** OBS-T1022, OBS-T1032, OBS-T1034

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/observatory/schema.ts`
- Create: `lib/observatory/registry.ts`
- Create: `tests/fixtures/observatory-registry.html`
- Create: `tests/observatory-registry.test.ts`
- Create: `tests/observatory-schema.test.ts`

**Execution contract:** `EC-T1022/1032/1034-M1A-001 · IMPLEMENT`

**Estimate identity:** 4.0 active agent-hours, Low confidence. Freeze before implementer dispatch.

**Steps:**

1. Add failing tests for extracting the exact `<script id="orchestration-registry" type="application/json">` payload, schema validation, correct project/scene/flow summaries, missing script, malformed JSON, and unsupported schema versions.
2. Run the focused tests and capture the expected RED result.
3. Install exact `zod@4.4.3`.
4. Implement a narrow versioned snapshot schema and registry parser. Preserve canonical IDs and source provenance; do not infer undeclared relationships.
5. Run focused tests, then `npm run typecheck` and `npm run lint`.
6. Commit.

**Acceptance:** Parser errors are explicit; fixture coverage is deterministic; no runtime/private fields exist in the snapshot contract beyond the approved whitelist.

## Task 2: Read-only collector, privacy whitelist, digest, and publisher contract

**Baseline mapping:** OBS-T1023, OBS-T1024, OBS-T1031, OBS-T1033

**Files:**

- Create: `lib/observatory/collector.ts`
- Create: `lib/observatory/publisher.ts`
- Create: `scripts/observatory/collect.ts`
- Create: `scripts/observatory/publish.ts`
- Create: `tests/observatory-collector.test.ts`
- Create: `tests/observatory-publisher.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Execution contract:** `EC-T1023/1024/1031/1033-M1A-001 · IMPLEMENT`

**Estimate identity:** 5.0 active agent-hours, Low confidence. Freeze before implementer dispatch.

**Steps:**

1. Add failing tests using injected command/file/fetch adapters. Cover Agents and runtime whitelisting, secret/path/session omission, freshness status, deterministic SHA-256 digest, command failure, malformed CLI JSON, idempotent publish, and last-known-good preservation.
2. Run focused tests and capture RED.
3. Implement collector functions and CLIs with explicit timeouts, actionable errors, atomic local output, and no source writes.
4. Implement publisher validation and REST insertion using server-only environment variables. Reject failed/invalid snapshots before network I/O. Treat an existing digest as success.
5. Add `observatory:collect` and `observatory:publish` scripts. Ignore local generated snapshot artifacts.
6. Run focused tests, typecheck, and lint; commit.

**Acceptance:** Only safe fields are emitted; failures never publish or replace a successful snapshot; credentials never appear in output or errors.

## Task 3: Supabase snapshot and audited work-item schema

**Baseline mapping:** OBS-T1021, OBS-T1051

**Files:**

- Create: `supabase/migrations/20260721000100_openclaw_observatory_m1a.sql`
- Create: `tests/observatory-migration.test.ts`
- Create: `lib/observatory/work-items.ts`
- Create: `tests/observatory-work-items.test.ts`

**Execution contract:** `EC-T1021/1051-M1A-001 · IMPLEMENT`

**Estimate identity:** 4.0 active agent-hours, Low confidence. Freeze before implementer dispatch.

**Steps:**

1. Add failing SQL-contract tests for three tables, constraints, indexes, RLS, admin read/write policies, snapshot read-only behavior, and append-only event behavior.
2. Add failing domain tests for Quick Capture validation and allowed initial state.
3. Run focused tests and capture RED.
4. Implement migration for `observatory_snapshots`, `observatory_work_items`, and `observatory_work_item_events`. Service role publishes snapshots; admin users read snapshots and create/update work items; event updates/deletes remain denied.
5. Implement shared work-item Zod validation and enums.
6. Run focused tests, the repository migration suite, typecheck, and lint; commit.

**Acceptance:** Anonymous/non-admin access is denied by default; browser roles cannot write snapshots; every work-item creation can be paired with one append-only event in a transaction.

## Task 4: Server data layer and Quick Capture mutation

**Baseline mapping:** OBS-T1012, partial OBS-T1052, partial OBS-T1055

**Files:**

- Create: `lib/observatory/admin-auth.ts`
- Create: `lib/observatory/repository.ts`
- Create: `app/observatory/actions.ts`
- Create: `tests/observatory-actions.test.ts`
- Create: `tests/observatory-repository.test.ts`

**Execution contract:** `EC-T1012/1052/1055-M1A-001 · IMPLEMENT`

**Estimate identity:** 4.0 active agent-hours, Low confidence. Freeze before implementer dispatch.

**Steps:**

1. Add failing tests for admin authorization, latest-successful-snapshot reads, atomic Quick Capture creation/event insertion, validation errors, duplicate idempotency keys, and optimistic version conflicts.
2. Run focused tests and capture RED.
3. Implement a server-only repository with injected Supabase boundaries and a server action that validates untrusted form data.
4. Reuse the established 402V admin profile pattern. Never expose the admin client or service key to client components.
5. Revalidate `/observatory` after success and return structured field/form errors.
6. Run focused tests, typecheck, and lint; commit.

**Acceptance:** Unauthorized callers cannot read or mutate; Quick Capture produces one work item plus one audit event; stale writes fail explicitly.

## Task 5: Admin-only Observatory overview and Quick Capture UI

**Baseline mapping:** OBS-T1011, OBS-T1013, OBS-T1041, OBS-T1042, partial OBS-T1043, OBS-T1052

**Files:**

- Create: `app/observatory/page.tsx`
- Create: `components/observatory/ObservatoryOverview.tsx`
- Create: `components/observatory/QuickCapture.tsx`
- Create: `components/observatory/SourceStatus.tsx`
- Create: `tests/observatory-page.test.tsx`
- Create: `tests/observatory-overview.test.tsx`
- Create: `tests/observatory-quick-capture.test.tsx`
- Modify: `app/globals.css`
- Modify: `components/SiteHeader.tsx` only if needed for an admin-visible entry point

**Execution contract:** `EC-T1011/1013/1041/1042/1043/1052-M1A-001 · IMPLEMENT`

**Estimate identity:** 6.0 active agent-hours, Low confidence. Freeze before implementer dispatch.

**Steps:**

1. Add failing tests for anonymous redirect, admin render, missing/stale/failed snapshot states, summary cards, source provenance, searchable core object lists, keyboard labels, and Quick Capture success/error states.
2. Run focused tests and capture RED.
3. Implement the server page and accessible components following existing 402V visual patterns. Use native controls and existing dependencies; do not add drag-and-drop or chart packages in M1A.
4. Keep the page useful when no snapshot exists and make freshness/failure visually explicit.
5. Run focused tests, typecheck, lint, and production build; commit.

**Acceptance:** Admin users can understand core system state and capture an Idea/Feature/Bug within 30 seconds; non-admin access is redirected; the layout is responsive and keyboard usable.

## Task 6: Local vertical-slice verification and runbook

**Baseline mapping:** OBS-T1013, OBS-T1024, OBS-T1034, M1A release evidence

**Files:**

- Create: `docs/observatory-m1a-runbook.md`
- Modify only as required by failures found during verification.

**Execution contract:** `EC-M1A-VERIFY-001 · VERIFY`

**Estimate identity:** 3.0 active agent-hours, Medium confidence. Freeze before verifier dispatch.

**Steps:**

1. Run the collector against the actual canonical registry and escalated read-only OpenClaw CLI, writing only a local ignored artifact.
2. Validate counts/provenance and scan the artifact for disallowed secrets, session paths, tokens, emails, raw knowledge content, and profile data.
3. Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` from a clean worktree.
4. Document local migration, collection, publication, rollback, stale behavior, and the explicit production/user gates.
5. Do not apply production migrations, publish a production snapshot, deploy Vercel, create Cron, or restart Gateway.
6. Commit final documentation/fixes and request final holistic review.

**Acceptance:** The local slice is reproducible; all quality gates pass; failure behavior is documented; production state remains unchanged.

---

## Delivery and measurement rules

- Each task has one fresh Implementer Subagent, then an independent Spec Compliance Reviewer, then an independent Quality Reviewer.
- A reviewer run is not a Gate. Gate decisions are recorded separately with reviewer run IDs and evidence.
- Record each run's start, finish, active time, role, model/toolchain, artifact/commit, evidence, and rework tag in `estimate-calibration.md` after the task completes.
- Task Actual Active Agent Time is the sum of eligible implementer, spec-review, quality-review, and fix/rework run active times.
- Forecast revisions are append-only predictions in `edad-tracker.md`; only Current Approved Plan commitment changes require user approval.
- M1A is a delivery slice within approved M1 scope. It does not overwrite Original Baseline dates or silently approve a new Current Plan date.
