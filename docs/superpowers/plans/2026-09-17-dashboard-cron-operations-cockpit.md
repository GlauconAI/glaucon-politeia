# Dashboard Cron Operations Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/dashboard/crons` into a read-only recurring-job operations cockpit with seven-day time organization, Agent grouping, and explicit schedule-risk diagnostics.

**Architecture:** A pure scheduling module expands Snapshot `cron` and `every` schedules from an explicit source timestamp, then derives hard-conflict, crowded-window, day, and Agent view models. Focused React components render Time, Agents, and All jobs views while preserving the existing safe directory and URL filter behavior.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Vitest, Testing Library, `cron-parser` 5.10.1, existing Observatory Snapshot contracts.

---

## File map

- Create `lib/observatory/cron-operations.ts`: deterministic recurrence projection, risk grouping, day grouping, and Agent summaries.
- Create `components/observatory/CronTimeView.tsx`: time-oriented recurring schedule view.
- Create `components/observatory/CronAgentView.tsx`: Agent-oriented recurring schedule view.
- Modify `components/observatory/CronDirectory.tsx`: view/scope state, metrics, shared filtering, and full-list fallback.
- Modify `app/dashboard/crons/page.tsx`: parse new URL state and pass an explicit projection origin.
- Modify `app/globals.css`: cockpit, risk, time, Agent, and responsive styles.
- Modify `package.json` and `package-lock.json`: add `cron-parser@5.10.1`.
- Create `tests/observatory-cron-operations.test.ts`: pure schedule/risk model coverage.
- Modify `tests/observatory-cron-directory.test.tsx`: view interaction and accessibility coverage.
- Modify `tests/observatory-directory-pages.test.tsx`: server page contract coverage.
- Create `docs/superpowers/evidence/2026-09-17-dashboard-cron-operations-cockpit-production.md`: release and production evidence.

### Task 1: Add the recurrence dependency and RED scheduling tests

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/observatory-cron-operations.test.ts`

- [ ] **Step 1: Install the pinned recurrence parser**

Run: `npm install cron-parser@5.10.1`

Expected: `package.json` and lockfile contain `cron-parser` 5.10.1; no unrelated dependency changes.

- [ ] **Step 2: Write failing pure-model tests**

Cover these fixtures with an explicit origin of `2026-09-17T07:00:00.000Z`:

```ts
const recurring = [
  cron("a", "plato", "0 9 * * *", "America/Vancouver"),
  cron("b", "giskard", "0 9 * * *", "America/Vancouver"),
  cron("c", "socrates", "10 9 * * *", "America/Vancouver"),
  every("d", "plato", 900_000, "2026-09-17T16:05:00.000Z"),
];
```

Assert:

- only enabled `cron`/`every` jobs are recurring;
- Cron expressions respect their configured timezone;
- fixed intervals use `nextRunAt` as their anchor;
- the two 09:00 jobs form one hard-conflict group;
- 09:00 and 09:10 form a crowded window without duplicating the hard-conflict pair;
- invalid expressions/timezones/intervals return projection issues;
- all output is stable when the explicit origin is unchanged;
- the horizon and occurrence caps are enforced.

- [ ] **Step 3: Run RED tests**

Run: `npm test -- tests/observatory-cron-operations.test.ts`

Expected: FAIL because `@/lib/observatory/cron-operations` does not exist.

- [ ] **Step 4: Commit the RED contract**

Run:

```bash
git add package.json package-lock.json tests/observatory-cron-operations.test.ts
git commit -m "test: define cron operations cockpit model"
```

### Task 2: Implement deterministic recurrence projection and diagnostics

**Files:**
- Create: `lib/observatory/cron-operations.ts`
- Test: `tests/observatory-cron-operations.test.ts`

- [ ] **Step 1: Define the public model**

Implement exported types for:

```ts
export type CronOccurrence = {
  occurrenceId: string;
  job: DashboardCronEntry;
  startsAt: string;
  minuteKey: string;
  localDayKey: string;
  localTimeLabel: string;
};

export type CronRiskGroup = {
  id: string;
  level: "hard" | "crowded";
  startsAt: string;
  endsAt: string;
  occurrences: CronOccurrence[];
  jobCount: number;
  agentCount: number;
};

export type CronProjectionIssue = {
  assetId: string;
  name: string;
  reason: "missing-anchor" | "invalid-expression" | "invalid-interval" | "invalid-timezone" | "occurrence-cap";
};
```

- [ ] **Step 2: Implement recurrence expansion**

Use `CronExpressionParser.parse(expression, { currentDate, endDate, tz })` for calendar schedules. Use integer addition from `nextRunAt` for fixed intervals. Cap at 1,000 occurrences per job and 10,000 per projection.

- [ ] **Step 3: Implement risk and grouping functions**

Group by UTC minute for hard conflicts. Scan sorted distinct-job occurrences for rolling 15-minute crowded windows, excluding same-minute pairs and preventing an occurrence from being emitted in multiple risk groups. Derive Vancouver day/time labels with `Intl.DateTimeFormat`.

- [ ] **Step 4: Run GREEN tests**

Run: `npm test -- tests/observatory-cron-operations.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit the pure model**

Run:

```bash
git add lib/observatory/cron-operations.ts tests/observatory-cron-operations.test.ts
git commit -m "feat: model recurring cron schedule risk"
```

### Task 3: Add RED component and page contracts

**Files:**
- Modify: `tests/observatory-cron-directory.test.tsx`
- Modify: `tests/observatory-directory-pages.test.tsx`

- [ ] **Step 1: Extend CronDirectory test fixtures**

Add enabled recurring jobs from multiple Agents with hard and crowded conflicts, plus one one-time and one disabled job.

- [ ] **Step 2: Write failing view tests**

Assert:

- Time is the default selected view;
- default content excludes one-time and disabled jobs;
- summary metrics expose recurring, Agent, hard-conflict, crowded, attention, and projection-issue counts;
- Time groups occurrences under Vancouver dates and labels hard/crowded risk in text;
- Agents groups jobs by owner and sorts each group by next run;
- All jobs restores the complete existing card directory;
- view/owner/filter state updates the URL;
- no mutation controls exist.

- [ ] **Step 3: Write failing server page tests**

Assert `page.tsx` accepts `view=time|agents|all`, defaults to `time`, and supplies the source collection instant to the directory.

- [ ] **Step 4: Run RED component tests**

Run:

```bash
npm test -- tests/observatory-cron-directory.test.tsx tests/observatory-directory-pages.test.tsx
```

Expected: FAIL because the new views and props do not exist.

- [ ] **Step 5: Commit the RED UI contract**

Run:

```bash
git add tests/observatory-cron-directory.test.tsx tests/observatory-directory-pages.test.tsx
git commit -m "test: define cron operations cockpit views"
```

### Task 4: Implement the Time and Agent views

**Files:**
- Create: `components/observatory/CronTimeView.tsx`
- Create: `components/observatory/CronAgentView.tsx`
- Modify: `components/observatory/CronDirectory.tsx`
- Modify: `app/dashboard/crons/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add view and scope controls**

Extend filters with `view: "time" | "agents" | "all"`. Render three `aria-pressed` view buttons. Use enabled recurring jobs as input for Time and Agents; use existing filters and all jobs for All jobs.

- [ ] **Step 2: Render cockpit metrics**

Build one projection per filtered recurring set and render counts for jobs, Agents, hard groups, crowded groups, attention, and issues. Keep source status warning behavior unchanged.

- [ ] **Step 3: Render the Time view**

Render day headings, chronological minute rows, job/Agent chips, hard-conflict and crowded-window callouts, and a projection-issues section. Include textual risk labels.

- [ ] **Step 4: Render the Agent view**

Render Agent headings with job/risk/attention totals and a chronological list of jobs. Use stable semantic lists and headings.

- [ ] **Step 5: Preserve All jobs**

Move the existing complete card list behind the All jobs view without removing fields or filters. One-time and disabled jobs remain discoverable there.

- [ ] **Step 6: Add responsive CSS**

Desktop uses compact two-level day/time structure; at 720 px and below all rows, chips, and Agent summaries stack in a single column; at 390 px the document width does not exceed the viewport.

- [ ] **Step 7: Run GREEN component tests**

Run:

```bash
npm test -- tests/observatory-cron-operations.test.ts tests/observatory-cron-directory.test.tsx tests/observatory-directory-pages.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit the UI**

Run:

```bash
git add app/dashboard/crons/page.tsx app/globals.css components/observatory/CronDirectory.tsx components/observatory/CronTimeView.tsx components/observatory/CronAgentView.tsx tests/observatory-cron-directory.test.tsx tests/observatory-directory-pages.test.tsx
git commit -m "feat: add cron operations cockpit"
```

### Task 5: Verify, review, and prepare release

**Files:**
- Modify if required by findings: files already listed above

- [ ] **Step 1: Run focused quality checks**

Run:

```bash
npm test -- tests/observatory-cron-operations.test.ts tests/observatory-cron-directory.test.tsx tests/observatory-directory-pages.test.tsx
npm run typecheck
npm run lint
git diff --check origin/main...HEAD
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the repository release gate**

Run: `npm run release:verify`

Expected: tests, lint, typecheck, build, dependency audit, and diff checks all exit 0.

- [ ] **Step 3: Perform producer review**

Verify the diff contains no Runtime mutation controls, schedule writes, Automations calls, auth changes, database migration, or unrelated refactor. Confirm `cron-parser` is the only new dependency.

- [ ] **Step 4: Prepare the PR through the approved release entrypoint**

Run: `/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh`

Expected: non-force push to `GlauconAI/glaucon-politeia` and one PR from the clean feature branch.

- [ ] **Step 5: Wait for required PR checks and merge once**

Use read-only GitHub status queries until required checks pass, then request the single approved `gh pr merge <number> --squash` action. If it times out, inspect PR state before any retry.

### Task 6: Production smoke and evidence

**Files:**
- Create: `docs/superpowers/evidence/2026-09-17-dashboard-cron-operations-cockpit-production.md`

- [ ] **Step 1: Wait for exact-SHA production gates**

Verify the merged SHA passes the main Quality workflow and the exact-SHA Vercel production smoke.

- [ ] **Step 2: Inspect production with the shared 402v profile**

Use `profile-browser` with the `402v-admin` Profile. Verify `/dashboard/crons` defaults to Time, metrics match the production Snapshot, Time and Agents views switch correctly, All jobs exposes all tasks, and no mutation controls exist.

- [ ] **Step 3: Check responsive behavior**

Verify desktop and 390 px mobile widths, including no horizontal overflow and readable risk labels.

- [ ] **Step 4: Record release evidence**

Document branch, commits, PR, merge SHA, quality runs, dependency decision, production counts, conflict examples, screenshots/inspection notes, and known limitations.

- [ ] **Step 5: Commit evidence if the release process requires a follow-up docs change**

Prefer including evidence before PR merge when all identifiers are known; otherwise create a docs-only follow-up through the same approved release path.

## Self-review

- Spec coverage: default recurring scope, Time, Agents, All jobs, hard conflict, crowded window, invalid schedules, accessibility, responsiveness, read-only boundary, release and smoke each map to a task.
- Placeholder scan: no TBD/TODO/“implement later” instructions remain.
- Type consistency: `DashboardCronEntry`, `CronOccurrence`, `CronRiskGroup`, and filter view names are used consistently throughout the plan.
