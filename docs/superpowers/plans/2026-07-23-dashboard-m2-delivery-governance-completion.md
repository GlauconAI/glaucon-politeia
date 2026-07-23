# Dashboard M2 Delivery Governance Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the read-only Three-track Roadmap, Flow Analytics / Forecast, and Governance Reports / Review slices and pass the integrated M2 local release gate.

**Architecture:** Preserve strict Snapshot v3 and derive all new views from the existing sanitized governance projection. Add only backward-compatible revision history to the snapshot; keep roadmap, analytics, forecast, and reports as focused pure modules with accessible React views.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zod 4, date-fns 4, Vitest, Testing Library, native HTML/CSS.

---

### Task 1: Backward-compatible plan revisions and actual dates

**Files:**
- Modify: `lib/observatory/governance-schema.ts`
- Modify: `lib/observatory/governance-markdown.ts`
- Modify: `tests/observatory-governance-schema.test.ts`
- Modify: `tests/observatory-governance-markdown.test.ts`
- Modify: `tests/fixtures/observatory-governance/development-baseline.md`
- Modify: `tests/fixtures/observatory-governance/edad-tracker.md`

- [x] Add failing schema tests proving old v3 payloads default `plan_revisions` to `[]`, valid revision records pass, and duplicate revision IDs fail.
- [x] Run `npm test -- tests/observatory-governance-schema.test.ts` and confirm the missing field/API failure.
- [x] Add `GovernancePlanRevisionSchema`, optional/defaulted `plan_revisions`, duplicate checks, and exported type.
- [x] Run the focused schema test and confirm it passes.
- [x] Add failing projection tests for `DIR-*` rows and optional Actual Start / Actual Finish columns.
- [x] Run `npm test -- tests/observatory-governance-markdown.test.ts` and confirm expected projection failures.
- [x] Parse bounded revisions and optional actual columns, keeping `GATE-*` behavior unchanged.
- [x] Run both focused files and commit with `feat: project governance revision history`.

### Task 2: Three-track Roadmap derivation

**Files:**
- Create: `lib/observatory/delivery-roadmap.ts`
- Create: `tests/observatory-delivery-roadmap.test.ts`

- [x] Write failing tests for ISO date normalization, early/on-time/late variance, missing baseline, explicit at-risk state, and first slip ordering.
- [x] Run `npm test -- tests/observatory-delivery-roadmap.test.ts` and confirm the module-not-found failure.
- [x] Implement `deriveDeliveryRoadmap(governance)` returning rows, date domain, first slip, and review summary.
- [x] Run the focused test and confirm all cases pass.
- [x] Refactor only after green and commit with `feat: derive three-track delivery roadmap`.

### Task 3: Accessible Roadmap UI

**Files:**
- Create: `components/observatory/DeliveryRoadmap.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-delivery-roadmap-view.test.tsx`
- Modify: `tests/observatory-overview.test.tsx`

- [x] Write failing component tests for three track labels, Baseline Review, first slip, `Not recorded`, table fallback, and empty state.
- [x] Run the two focused component test files and confirm the missing component failures.
- [x] Implement the native semantic timeline/table and mount it after Project Cockpit.
- [x] Add responsive CSS with no hover-only information or canvas.
- [x] Run focused tests and commit with `feat: add accessible three-track roadmap`.

### Task 4: Delivery analytics and forecast derivation

**Files:**
- Create: `lib/observatory/delivery-analytics.ts`
- Create: `tests/observatory-delivery-analytics.test.ts`

- [x] Write failing tests for Task events, WIP, Age, Cycle Time, daily Throughput, SLE threshold, Rework, prediction error, forecast interval/confidence, and insufficient evidence.
- [x] Run `npm test -- tests/observatory-delivery-analytics.test.ts` and confirm the module-not-found failure.
- [x] Implement pure UTC-safe derivation functions with explicit source references and no inferred blocked/waiting time.
- [x] Run focused tests and confirm all cases pass.
- [x] Refactor after green and commit with `feat: derive traceable flow analytics`.

### Task 5: Flow Analytics / Forecast UI

**Files:**
- Create: `components/observatory/FlowAnalytics.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-flow-analytics-view.test.tsx`

- [x] Write failing tests for metric cards, insufficient-evidence messages, forecast interval, confidence, source references, and semantic throughput table.
- [x] Run the focused test and confirm the missing component failure.
- [x] Implement the accessible view and mount it after Roadmap.
- [x] Add responsive styles and run focused tests.
- [x] Commit with `feat: add flow analytics and forecast view`.

### Task 6: Governance report derivation

**Files:**
- Create: `lib/observatory/governance-reports.ts`
- Create: `tests/observatory-governance-reports.test.ts`

- [x] Write failing tests for On track / At risk / Off track, source-linked issues, delay categories, weekly/monthly windows, deterministic report IDs, data quality, and safe JSON export.
- [x] Run the focused test and confirm the module-not-found failure.
- [x] Implement the deterministic report model using only sanitized snapshot fields.
- [x] Run focused tests and commit with `feat: derive governance review reports`.

### Task 7: Governance Reports / Review UI

**Files:**
- Create: `components/observatory/GovernanceReview.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-governance-review-view.test.tsx`

- [x] Write failing tests for formal review, weekly/monthly summaries, issues with source/owner/status/evidence, attribution, revisions/Gates, and JSON download.
- [x] Run the focused test and confirm the missing component failure.
- [x] Implement and mount the view after Flow Analytics.
- [x] Add responsive styles, run focused tests, and commit with `feat: add governance reports and review`.

### Task 8: Integrated local M2 release gate

**Files:**
- Modify: `docs/dashboard-m1a-runbook.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-23-dashboard-m2-*-design.md`
- Modify: `docs/superpowers/plans/2026-07-23-dashboard-m2-delivery-governance-completion.md`

- [x] Run all focused M2 tests.
- [x] Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.
- [x] Run the committed strict snapshot verifier against a freshly collected local candidate without printing sensitive values.
- [x] Confirm Git diff contains no unrelated anonymous-engagement files, credentials, absolute private paths, raw Markdown, or schema-breaking v3 changes.
- [x] Record exact test/build/privacy evidence and rollback procedure in the runbook.
- [x] Mark plan checkboxes complete and commit with `docs: record M2 delivery governance local gate`.
- [x] Stop before shared-main push, Vercel production deployment, production snapshot publication, or external data mutation unless the user has explicitly authorized those release actions.

