# Dashboard Cron Jobs Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only, read-only `/dashboard/crons` directory that exposes every collected Cron job's safe scheduling and run-health metadata, then release and verify it in production.

**Architecture:** Adapt the existing `openclaw cron list --all --json` projection by adding bounded allowlisted labels to existing `cron` assets. Build a typed view model from Snapshot assets, render it with the established Projects/Skills directory pattern, and reuse the existing Dashboard auth, route navigation, source-health, refresh, and deployment paths. Payloads, delivery details, trigger scripts, messages, recipients, and concrete session identifiers remain excluded.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Vitest, Testing Library, existing Observatory Snapshot v5.

---

### Task 1: Expand the Cron safe projection

**Files:**
- Modify: `lib/observatory/system-assets.ts`
- Modify: `tests/observatory-system-assets.test.ts`

- [ ] **Step 1: Write a failing projection/privacy test**

Extend the Cron fixture with `cron`, `every`, and `at` schedules plus state and forbidden fields. Assert allowlisted labels for schedule kind/value, timezone, enabled state, ISO last/next run timestamps, last status, consecutive errors, and normalized runtime target. Assert serialized output excludes `payload`, message text, delivery recipient, trigger script, and concrete `session:` value.

```ts
expect(result.assets[0]?.labels).toEqual(expect.arrayContaining([
  { key: "schedule_type", value: "cron" },
  { key: "schedule_expression", value: "0 18 * * *" },
  { key: "timezone", value: "America/Vancouver" },
  { key: "runtime_target", value: "session-bound" },
]));
expect(JSON.stringify(result)).not.toMatch(/private instructions|telegram:|session:private|trigger/u);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/observatory-system-assets.test.ts`

Expected: FAIL because the new safe labels are absent.

- [ ] **Step 3: Implement the minimal allowlisted projection**

Add bounded helpers for millisecond timestamps/numbers, Cron expressions, timezones, and normalized runtime targets. Project only these labels:

```ts
[
  { key: "schedule_type", value: kind },
  { key: "enabled", value: enabled ? "enabled" : "disabled" },
  // exactly one of schedule_expression / schedule_interval_ms / schedule_at
  // optional timezone, last_run_at, next_run_at, consecutive_errors
  { key: "last_status", value: lastStatus },
  { key: "runtime_target", value: runtimeTarget },
]
```

Preserve compatibility with old state names (`lastStatus`, `lastRunAtMs`, `nextRunAtMs`) and tolerate missing fields as unreported.

- [ ] **Step 4: Run focused projection and collector tests and verify GREEN**

Run: `npm test -- tests/observatory-system-assets.test.ts tests/observatory-system-collector.test.ts`

Expected: PASS.

### Task 2: Add the typed Cron directory view model

**Files:**
- Modify: `lib/observatory/dashboard-directory.ts`
- Modify: `tests/observatory-dashboard-directory.test.ts`

- [ ] **Step 1: Write a failing view-model test**

Create Cron assets with complete and legacy labels. Assert `buildCronDirectory()` returns stable typed entries with raw job ID, schedule type/value/summary, timezone, enabled state, health, last/next run, consecutive errors, and runtime target; missing legacy fields must become `null`/`unknown`, never throw.

```ts
expect(buildCronDirectory(assets)[0]).toMatchObject({
  id: "job-1",
  scheduleType: "cron",
  scheduleValue: "0 18 * * *",
  enabled: true,
  runtimeTarget: "session-bound",
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/observatory-dashboard-directory.test.ts`

Expected: FAIL because `buildCronDirectory` is missing.

- [ ] **Step 3: Implement the minimal view model**

Export `DashboardCronEntry`, `DashboardCronScheduleType`, and `buildCronDirectory(assets)`. Filter `kind === "cron"`, decode only known labels, strip the `cron:` prefix for display, normalize unknown values, and sort by name for a deterministic baseline.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- tests/observatory-dashboard-directory.test.ts`

Expected: PASS.

### Task 3: Build the read-only Cron directory UI

**Files:**
- Create: `components/observatory/CronDirectory.tsx`
- Create: `tests/observatory-cron-directory.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing behavior tests**

Render representative Cron entries and assert statistics, search, Owner/type/enabled/health filters, next-run/name/Owner/health sorting, URL replacement, all card fields, empty state, and a visible stale/failed source notice.

```tsx
expect(screen.getByText("3 Cron Jobs")).toBeInTheDocument();
await user.selectOptions(screen.getByRole("combobox", { name: /schedule type/i }), "at");
expect(screen.getByRole("heading", { name: "Renewal reminder" })).toBeInTheDocument();
expect(window.location.search).toContain("type=at");
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- tests/observatory-cron-directory.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component and responsive styles**

Use the existing `dashboard-directory*` controls and card grid. Add compact stat buttons for total/enabled/attention and the three schedule kinds. Cards show name, Owner, enabled, health, human schedule summary, raw schedule value, timezone, last run, next run, last status, consecutive errors, runtime target, and Job ID. No mutation controls are rendered.

- [ ] **Step 4: Run component and responsive contract tests and verify GREEN**

Run: `npm test -- tests/observatory-cron-directory.test.tsx tests/observatory-dashboard-responsive.test.ts`

Expected: PASS.

### Task 4: Add the authenticated route and navigation surfaces

**Files:**
- Create: `app/dashboard/crons/page.tsx`
- Modify: `components/observatory/DashboardRouteNav.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `tests/observatory-directory-pages.test.tsx`
- Modify: `tests/observatory-dashboard-section-nav.test.tsx`
- Modify: `tests/observatory-overview.test.tsx`

- [ ] **Step 1: Write failing route/navigation tests**

Assert `force-dynamic`, anonymous redirect to `/auth?redirectTo=/dashboard/crons`, URL-derived filters, source-health propagation, Cron Jobs route navigation, and a clickable Cron Jobs summary card with the count of Cron assets.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/observatory-directory-pages.test.tsx tests/observatory-dashboard-section-nav.test.tsx tests/observatory-overview.test.tsx`

Expected: FAIL because the route/nav/summary entry is absent.

- [ ] **Step 3: Implement the route and links**

The page loads the existing admin and Snapshot state, calls `buildCronDirectory(snapshot.assets)`, derives the `operations` source status, and passes validated URL filters to `CronDirectory`. Old v1 Snapshots render an empty compatible directory; snapshot errors use `SourceStatus`.

- [ ] **Step 4: Run focused route/navigation tests and verify GREEN**

Run the same command as Step 2.

Expected: PASS.

### Task 5: Verify, merge, deploy, and accept production

**Files:**
- Create: `docs/superpowers/evidence/2026-08-31-dashboard-cron-jobs.md`

- [ ] **Step 1: Run quality gates**

Run focused privacy/directory/route tests, full `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev`, and `npm audit`.

Expected: all commands exit 0 with no vulnerabilities.

- [ ] **Step 2: Refresh/publish a validated Snapshot**

Run the existing Observatory refresh path. Verify the published Snapshot contains all collected Cron assets with allowlisted labels and contains none of the forbidden keys/values.

- [ ] **Step 3: Complete the branch and release**

Commit scoped changes, push the feature branch, validate a Preview deployment, fast-forward merge to `main`, push, and wait for the GitHub → Vercel Production deployment to report success.

- [ ] **Step 4: Production acceptance**

Using the dedicated authenticated `402v-admin` browser profile, verify `/dashboard/crons` at 1280×900 and 390×844: route/nav/summary count, filters/sorting/URL state, all three schedule types, old/missing field fallback, no mutation controls, no horizontal overflow, no console/page errors, and anonymous redirect.

- [ ] **Step 5: Record evidence and close Thin Work**

Record commit/deployment IDs, command outputs, Snapshot counts, privacy checks, and browser evidence. Close the session-owned Thin Work only after all acceptance checks pass.
