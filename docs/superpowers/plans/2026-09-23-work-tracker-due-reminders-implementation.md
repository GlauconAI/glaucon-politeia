# Work Tracker Due Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Work Item due dates and a zero-model daily Telegram digest for overdue, today, and tomorrow items.

**Architecture:** Extend the audited Work Item database/RPC contract with `due_on`, carry it through the existing Zod, repository, action, detail, and board layers, then add a pure digest module plus a thin database-backed command. OpenClaw runs that command at 09:15 America/Vancouver and announces stdout only when the digest is non-empty.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, TypeScript, Zod, React/Next.js, Vitest, Node.js command Automation.

---

### Task 1: Due-date domain contract

**Files:**
- Modify: `lib/observatory/work-items.ts`
- Modify: `lib/observatory/repository.ts`
- Test: `tests/observatory-work-items.test.ts`
- Test: `tests/observatory-repository.test.ts`

- [ ] Add RED validation tests proving `dueOn` accepts `YYYY-MM-DD` or `null`, rejects impossible/non-canonical dates, and is present on update input.
- [ ] Run `npx vitest run tests/observatory-work-items.test.ts tests/observatory-repository.test.ts --maxWorkers=1`; expect failures for missing `dueOn`.
- [ ] Add `NullableDueOnSchema` with a strict ISO-date round-trip check, add `dueOn` to `ObservatoryWorkItemUpdateInputSchema`, and add `due_on: string | null` to `ObservatoryWorkItemRow`.
- [ ] Include `due_on` in list/get selects and `p_due_on: input.dueOn` in `updateWorkItem`.
- [ ] Re-run the focused tests; expect PASS.
- [ ] Commit as `feat: add work item due date contract`.

### Task 2: Audited database migration

**Files:**
- Create: `supabase/migrations/20260923000100_work_tracker_due_dates.sql`
- Create: `tests/observatory-work-item-due-date-migration.test.ts`
- Modify: `scripts/observatory/verify-local-db.ts`

- [ ] Add a RED migration contract test that requires nullable `due_on date`, a partial unfinished-item due index, version-checked RPC replacement, `updated` event evidence containing old/new due dates, explicit table/function grants, and no direct mutation grants.
- [ ] Run the migration test; expect FAIL because the migration does not exist.
- [ ] Add the migration. Drop only the exact current `update_observatory_work_item` signature, recreate it with trailing `p_due_on date`, preserve all current validation and Project Version binding rules, update `due_on`, increment version, and append the audited event.
- [ ] Extend local DB verification to assert the column, index, signature, and grants.
- [ ] Re-run migration and local verifier unit tests; expect PASS.
- [ ] Commit as `feat: migrate work item due dates`.

### Task 3: Server action and detail editor

**Files:**
- Modify: `app/observatory/actions.ts`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Test: `tests/observatory-actions.test.ts`
- Test: `tests/observatory-work-item-detail.test.tsx`

- [ ] Add RED tests proving the action trims empty due date to `null`, forwards a valid date, returns `dueOn` field errors for invalid input, and renders an optional date input populated from `item.due_on`.
- [ ] Run both focused tests; expect due-date assertions to fail.
- [ ] Add `dueOn: nullableText(formData, "dueOn")` to action validation and a `<input type="date" name="dueOn">` property field to the detail editor.
- [ ] Re-run focused tests; expect PASS.
- [ ] Commit as `feat: edit work item due dates`.

### Task 4: Board deadline labels

**Files:**
- Create: `lib/observatory/work-item-due.ts`
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Test: `tests/observatory-work-item-due.test.ts`
- Test: `tests/observatory-work-tracker-board.test.tsx`

- [ ] Add RED tests for Vancouver day classification: overdue, today, tomorrow, later, missing, leap day, and DST-adjacent instants.
- [ ] Add RED board tests requiring a deadline badge only when `due_on` exists.
- [ ] Run focused tests; expect failures for the missing classifier and badges.
- [ ] Implement `vancouverDateAt`, `classifyDueOn`, and `formatDueLabel` as pure functions using `Intl.DateTimeFormat` with `America/Vancouver`.
- [ ] Render the returned label on Work Tracker cards without changing sorting or state transitions.
- [ ] Re-run focused tests; expect PASS.
- [ ] Commit as `feat: show work item deadlines`.

### Task 5: Pure daily digest

**Files:**
- Create: `lib/observatory/work-item-due-digest.ts`
- Create: `tests/observatory-work-item-due-digest.test.ts`

- [ ] Add RED tests for exclusion of `done`/null/later items, grouping into overdue/today/tomorrow, priority ordering, plain-text escaping, bounded item count/bytes, omitted-count text, and empty string for no matches.
- [ ] Run `npx vitest run tests/observatory-work-item-due-digest.test.ts --maxWorkers=1`; expect module-not-found failure.
- [ ] Implement a pure `renderWorkItemDueDigest({ items, today, baseUrl, maxItems, maxBytes })` with deterministic Chinese output and no model/network calls.
- [ ] Re-run the digest tests; expect PASS.
- [ ] Commit as `feat: render work tracker due digest`.

### Task 6: Model-free reporter command

**Files:**
- Create: `scripts/work-tracker/due-reminder.mjs`
- Create: `tests/work-tracker-due-reminder-script.test.ts`
- Modify: `package.json`

- [ ] Add RED tests around an injectable runner: read `.env.local` without logging values, query only required Work Item/profile fields, print exactly the pure digest, print nothing for no matches, emit `WORK_TRACKER_DUE_REMINDER_FAILED` to stderr on failure, and never include a connection string.
- [ ] Run the script test; expect failure because the entrypoint is missing.
- [ ] Implement the command with the existing `postgres` dependency and a single bounded query. Add `work-tracker:due-reminder` package script.
- [ ] Re-run focused tests; expect PASS.
- [ ] Commit as `feat: add model-free due reminder command`.

### Task 7: Release and live Automation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-work-tracker-due-reminders-design.md` only if implementation evidence requires clarification
- Create: `docs/superpowers/evidence/2026-09-23-work-tracker-due-reminders-release.md`

- [ ] Run `npm run release:verify`; require tests, lint, typecheck, and diff-check PASS.
- [ ] Run the migration readiness/verification path against the configured production database, then apply the reviewed migration through the repository's canonical migration entrypoint.
- [ ] Use `/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh` from the clean feature branch; do not use direct `git push` or `gh pr create`.
- [ ] After PR checks pass, request the single approval for `gh pr merge <number> --squash`; confirm the exact production SHA and standard `production-smoke` result.
- [ ] Create one Automation with cron `15 9 * * *`, timezone `America/Vancouver`, payload kind `command`, canonical production checkout cwd, Telegram announce delivery, and failure alert after two failures with six-hour cooldown.
- [ ] Force one quiet smoke run against current production data. Verify completion status, empty-output suppression when applicable, and command/receipt evidence of zero model calls.
- [ ] Register the Automation in the canonical Automation Registry and synchronize its event in Proton Calendar `OpenClaw Automations` under the existing calendar rule.
- [ ] Record exact commit/deployment/job/config revisions and verification evidence in the release report.

### Task 8: Final independent review and cleanup

**Files:**
- Review all files changed from `origin/main`.

- [ ] Run an independent code review covering migration compatibility, time-zone semantics, secret handling, output bounds, and Automation delivery behavior.
- [ ] Resolve every Critical/Important issue with a new RED/GREEN test cycle.
- [ ] Re-run `npm run release:verify` and production verification after any fixes.
- [ ] Merge/close according to `finishing-a-development-branch`, remove the isolated worktree, and preserve unrelated changes in the primary checkout.
