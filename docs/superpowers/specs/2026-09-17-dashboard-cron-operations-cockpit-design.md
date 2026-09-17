# Dashboard Cron Operations Cockpit Design

**Date:** 2026-09-17
**Project:** `plato/dashboard`
**Route:** `/dashboard/crons`
**Status:** User-approved for implementation and production release

## Problem

The current Cron directory treats all schedules as a flat card list. The production Snapshot contains 99 jobs, including 66 enabled recurring jobs, but operators cannot quickly answer:

1. Which jobs run continuously rather than once?
2. Which Agent owns the recurring load?
3. When will recurring jobs execute during the next seven days?
4. Which jobs start at the same minute or within a risky time window?

The page must become a read-only operations cockpit without adding Runtime mutation controls.

## Product decisions

### Default scope

- The initial view shows enabled recurring jobs only: schedule types `cron` and `every` with `enabled=true`.
- One-time and disabled jobs remain available in the full directory view.
- Search, health, schedule type, enabled-state, and owner filters remain available.

### Views

The page exposes three URL-addressable views:

1. **Time** (default): future recurring occurrences grouped by local calendar day and minute.
2. **Agents**: recurring jobs grouped by Agent, with load and conflict summaries.
3. **All jobs**: the existing complete read-only card directory.

The URL stores `view`, `owner`, `health`, and search/filter state so an operational slice can be bookmarked.

### Time horizon and timezone

- The time view projects occurrences from the Snapshot collection time through the next seven days.
- Display is normalized to `America/Vancouver` for cross-Agent comparison.
- Each job retains and displays its configured timezone where relevant.
- `cron` schedules are expanded with `cron-parser` using the job timezone, falling back to `UTC` when none is reported.
- `every` schedules are expanded from `nextRunAt` plus `schedule_interval_ms`.
- Expansion is capped per job and across the page to prevent pathological schedules from producing unbounded UI work.
- An invalid expression, interval, timezone, or missing anchor produces a visible “Unable to calculate” item; the UI never invents a time.

### Conflict semantics

Only enabled recurring jobs participate in load diagnostics.

- **Hard conflict:** two or more distinct jobs start in the same clock minute. Render red and show the job and Agent count.
- **Crowded window:** two or more distinct jobs start across at least two different clock minutes within a rolling 15-minute window. Render amber.
- Hard-conflict rows can also sit inside one crowded window when nearby minutes add further load. The row remains red while the containing window is summarized in amber. Continuous load is represented as a bounded series of windows that may share one boundary minute; no window may exceed 15 minutes.
- Conflict detection compares normalized UTC instants; display uses Vancouver local time.
- Diagnostics describe scheduling proximity, not proven resource contention. Copy must say “schedule conflict” or “crowded window,” not “failure.”

### Summary metrics

The cockpit header shows:

- enabled recurring jobs;
- recurring Agents;
- hard-conflict groups in the seven-day horizon;
- crowded-window groups in the seven-day horizon;
- recurring jobs needing attention;
- schedules that could not be projected.

Metric buttons filter or focus the corresponding view where useful.

### Agent view

Each Agent section shows:

- recurring job count;
- next scheduled occurrence;
- hard-conflict and crowded-window participation;
- unhealthy/degraded job count;
- jobs sorted by next execution time, then name.

Agent sections use semantic headings and can be filtered with the existing owner control. No Agent color is the sole carrier of meaning.

### Full directory

The current list remains available as the “All jobs” view and preserves every safe field:

- Owner, health, schedule type/value, timezone, Runtime target;
- last and next run;
- last status and consecutive errors;
- Job ID.

No Run, Disable, Delete, or schedule-edit action is added.

## Architecture

### Reuse gate

Use `cron-parser` rather than implementing Cron grammar. Version 5.10.1 is MIT licensed, supports Node 18+, timezone-aware iteration, and was published on 2026-09-12. Its unpacked size is approximately 155 KB. Fixed intervals remain native arithmetic.

### Pure scheduling module

Create `lib/observatory/cron-operations.ts` containing pure, deterministic functions and types:

- identify recurring/enabled jobs;
- project seven-day occurrences;
- group occurrences by local day/minute;
- detect hard conflicts and crowded windows;
- build Agent summaries;
- return projection issues instead of throwing.

All functions accept an explicit `from` instant. Tests never depend on wall-clock time.

### Server/client boundary

`app/dashboard/crons/page.tsx` derives `from` from the operations source `collected_at`, falling back to a collected Cron record when the source has no timestamp. It passes that explicit anchor to the client component.

`CronDirectory` owns view/filter interaction and renders precomputed deterministic view models. Runtime state remains read-only Snapshot data.

### Component boundaries

- `CronDirectory.tsx`: filters, view tabs, URL state, full directory.
- `CronTimeView.tsx`: seven-day day/minute sections and risk groups.
- `CronAgentView.tsx`: Agent summaries and per-Agent recurring jobs.
- `cron-operations.ts`: occurrence projection and diagnostics.

The existing component is split only where the new responsibilities require it; unrelated Observatory components are untouched.

## Responsive and accessibility behavior

- Desktop: day sections with chronological time rows and compact job chips.
- Mobile: days and times stack vertically with no required horizontal scrolling.
- View controls use buttons with `aria-pressed`.
- Risk states include text labels and icons/prefixes in addition to color.
- Sections use headings and lists; summary values remain readable with assistive technology.
- Keyboard focus styles remain visible.

## Failure behavior

- Stale/failed source status retains the current source warning.
- Projection issues are isolated per job and listed without hiding valid schedules.
- No valid recurring jobs yields a specific recurring-empty state, distinct from an empty search result.
- The full list stays usable even if every recurring schedule fails projection.

## Acceptance criteria

1. `/dashboard/crons` defaults to enabled recurring jobs and the Time view.
2. The next seven days are organized by Vancouver date and execution minute.
3. Same-minute groups are red; 15-minute crowded groups are amber.
4. The Agents view groups all enabled recurring jobs by owner and orders jobs by next run.
5. One-time and disabled jobs remain reachable through All jobs.
6. Invalid schedules are reported, not silently dropped or guessed.
7. Existing source-health and read-only guarantees remain intact.
8. Desktop and 390 px mobile layouts have no horizontal overflow.
9. Focused tests, typecheck, lint, build, diff-check, full `release:verify`, exact-SHA deployment, and production browser smoke pass.

## Non-goals

- Editing, pausing, running, deleting, or rescheduling jobs.
- Automatically staggering schedules.
- Claiming actual CPU, browser-profile, database, or Agent contention.
- Adding run duration or resource declarations to the Snapshot in v1.
- Replacing OpenClaw Automations as scheduler or source of truth.
