# Dashboard Automations Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cron-only Dashboard presentation with one safe, read-only Automations directory that covers every OpenClaw Automation while retaining `/dashboard/crons` as a compatibility redirect.

**Architecture:** Reuse the existing Gateway collector and directory projection as the single data path. Extend the safe schedule model with `stream`, expose a canonical `/dashboard/automations` route, and make the legacy Cron route redirect with its query string intact. Keep the Time and Agents views focused on recurring `cron` and `every` schedules; expose `at`, `stream`, disabled, and unknown jobs in All Automations without leaking payload or delivery data.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library, existing 402V observatory collectors and release pipeline.

---

### Task 1: Extend the safe Automation schedule projection

**Files:**
- Modify: `lib/observatory/dashboard-directory.ts`
- Modify: `lib/observatory/system-assets.ts`
- Test: `tests/observatory-cron-operations.test.ts`
- Test: `tests/observatory-system-assets.test.ts`

- [ ] **Step 1: Write failing tests for stream schedules**

Add fixtures with `schedule.kind: "stream"` and assert that the public directory reports `scheduleType: "stream"`, an event-driven summary, and no fabricated next-run timestamp. Assert that payload text, command arguments, session keys, and delivery destinations remain absent from serialized public output.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/observatory-cron-operations.test.ts tests/observatory-system-assets.test.ts`

Expected: FAIL because `stream` currently projects as `unknown`.

- [ ] **Step 3: Implement the minimal stream projection**

Extend `DashboardCronScheduleType` and the schedule-summary switch with `stream`. Return an event-driven label derived only from safe schedule metadata; do not copy the stream command, match expression, payload, delivery, or session fields.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- tests/observatory-cron-operations.test.ts tests/observatory-system-assets.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/observatory/dashboard-directory.ts lib/observatory/system-assets.ts tests/observatory-cron-operations.test.ts tests/observatory-system-assets.test.ts
git commit -m "feat: project stream automations safely"
```

### Task 2: Add the canonical Automations route and compatibility redirect

**Files:**
- Create: `app/dashboard/automations/page.tsx`
- Modify: `app/dashboard/crons/page.tsx`
- Test: `tests/observatory-directory-pages.test.tsx`

- [ ] **Step 1: Write failing route tests**

Assert that `/dashboard/automations` renders the authenticated directory and that `/dashboard/crons?view=agents&owner=plato` redirects to `/dashboard/automations?view=agents&owner=plato`. Assert that unauthenticated access preserves `/dashboard/automations` in `redirectTo`.

- [ ] **Step 2: Run the route test and verify RED**

Run: `npm test -- tests/observatory-directory-pages.test.tsx`

Expected: FAIL because the canonical route does not exist and the legacy page still renders directly.

- [ ] **Step 3: Implement the route**

Move the existing page composition to `app/dashboard/automations/page.tsx`, allow filters `cron|every|at|stream|unknown`, and relabel the page “Automations Directory”. Replace `app/dashboard/crons/page.tsx` with a server redirect adapter that reconstructs the existing query parameters and sends them to `/dashboard/automations`.

- [ ] **Step 4: Run the route test and verify GREEN**

Run: `npm test -- tests/observatory-directory-pages.test.tsx`

Expected: all route tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/automations/page.tsx app/dashboard/crons/page.tsx tests/observatory-directory-pages.test.tsx
git commit -m "feat: add canonical Automations dashboard route"
```

### Task 3: Rename the directory presentation and expose every Automation

**Files:**
- Modify: `components/observatory/CronDirectory.tsx`
- Modify: `components/observatory/CronTimeView.tsx`
- Modify: `components/observatory/CronAgentView.tsx`
- Test: `tests/observatory-cron-directory.test.tsx`

- [ ] **Step 1: Write failing presentation tests**

Assert the heading and table copy say “Automations”, the filter includes Event-driven, route updates target `/dashboard/automations`, and a stream Automation appears in All Automations but not Time or Agents. Retain the existing conflict-window assertions for recurring jobs.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- tests/observatory-cron-directory.test.tsx`

Expected: FAIL on Cron labels, missing stream filter, and old route updates.

- [ ] **Step 3: Implement the presentation changes**

Update user-facing labels, safe schedule labels, empty states, and URL synchronization. Preserve internal component names where renaming would add no user value. Keep recurring analysis restricted to enabled `cron` and `every` jobs; show all safe records in All Automations.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `npm test -- tests/observatory-cron-directory.test.tsx`

Expected: all component tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/observatory/CronDirectory.tsx components/observatory/CronTimeView.tsx components/observatory/CronAgentView.tsx tests/observatory-cron-directory.test.tsx
git commit -m "feat: present scheduled work as Automations"
```

### Task 4: Update Dashboard navigation and overview

**Files:**
- Modify: `components/observatory/DashboardRouteNav.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Test: `tests/observatory-dashboard-section-nav.test.tsx`
- Test: `tests/observatory-overview.test.tsx`

- [ ] **Step 1: Write failing navigation tests**

Assert that the Dashboard navigation and overview card use “Automations”, link to `/dashboard/automations`, and count all safe Automation records rather than only recurring schedules.

- [ ] **Step 2: Run the navigation tests and verify RED**

Run: `npm test -- tests/observatory-dashboard-section-nav.test.tsx tests/observatory-overview.test.tsx`

Expected: FAIL because both surfaces still use Cron wording and route.

- [ ] **Step 3: Implement the navigation changes**

Change only the user-facing label and canonical href. Reuse the current safe directory count and do not add a second collector or API.

- [ ] **Step 4: Run the navigation tests and verify GREEN**

Run: `npm test -- tests/observatory-dashboard-section-nav.test.tsx tests/observatory-overview.test.tsx`

Expected: all navigation tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/observatory/DashboardRouteNav.tsx components/observatory/ObservatoryOverview.tsx tests/observatory-dashboard-section-nav.test.tsx tests/observatory-overview.test.tsx
git commit -m "feat: surface Automations across Dashboard"
```

### Task 5: Verify privacy, compatibility, and responsive behavior

**Files:**
- Modify if required by failing tests: `tests/observatory-system-inventory.test.tsx`
- Modify if required by failing tests: `tests/observatory-dashboard-directory.test.ts`
- Modify: `docs/superpowers/specs/2026-09-22-dashboard-automations-directory-design.md`

- [ ] **Step 1: Run the complete focused suite**

Run:

```bash
npm test -- tests/observatory-cron-directory.test.tsx tests/observatory-cron-operations.test.ts tests/observatory-dashboard-directory.test.ts tests/observatory-dashboard-section-nav.test.tsx tests/observatory-directory-pages.test.tsx tests/observatory-overview.test.tsx tests/observatory-system-assets.test.ts tests/observatory-system-inventory.test.tsx
```

Expected: all selected tests pass and serialized public data contains no private fields.

- [ ] **Step 2: Run the repository release gate**

Run: `npm run release:verify`

Expected: lint, typecheck, tests, build, and repository release checks pass.

- [ ] **Step 3: Perform authenticated browser acceptance**

Using the shared `402v-admin` profile under the shared-resource rules, verify desktop 1440px and mobile 390px at `/dashboard/automations`: route loads, Time/Agents/All switch correctly, stream records have no next-run fabrication, filters update the canonical URL, and `/dashboard/crons` redirects while preserving filters. Confirm no console/page errors and no horizontal overflow.

- [ ] **Step 4: Record actual verification evidence in the spec**

Append a concise implementation verification section containing exact commands, counts, browser sizes, and the legacy redirect result. Do not include payloads, delivery targets, session keys, or credentials.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-22-dashboard-automations-directory-design.md tests
git commit -m "test: verify Automations dashboard"
```

### Task 6: Release through the guarded Work Tracker pipeline

**Files:**
- No product files expected unless a release gate exposes a defect.

- [ ] **Step 1: Confirm the feature branch is clean**

Run: `git status --short --branch && git diff --check origin/main...HEAD`

Expected: clean feature branch and no whitespace errors.

- [ ] **Step 2: Prepare the release**

Run: `/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh`

Expected: non-force push to `GlauconAI/glaucon-politeia`, PR created or reused, and PR number returned.

- [ ] **Step 3: Wait for required checks and merge once**

Inspect the PR checks read-only. When all required checks are green, invoke `gh pr merge <number> --squash` once through the authorized execution layer. If the call times out, query `gh pr view <number> --json state,mergeCommit` before any retry.

- [ ] **Step 4: Verify production deployment**

Confirm GitHub Actions `production-smoke` passed for the exact merged SHA after the Vercel Production deployment. Then open the production `/dashboard/automations` with the authenticated `402v-admin` profile and repeat the desktop/mobile route, redirect, filter, and privacy checks.

- [ ] **Step 5: Preserve rollback evidence and report**

Record the PR, merged SHA, deployment/smoke result, and known limitations. Keep the feature worktree until production verification is complete; then follow `finishing-a-development-branch` for cleanup.
