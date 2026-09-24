# Work Tracker Due Reminders Design

## Status

- Owner: Plato
- Decision owner: Glaucon
- Date: 2026-09-23
- Status: approved design, awaiting written-spec review
- Product: Concerto — Work Tracker

## Objective

Add an optional due date to Work Items and deliver one model-free Telegram digest each morning for unfinished items that are overdue, due today, or due tomorrow.

The Work Tracker remains the only source of truth for task deadlines. Work Item deadlines are not copied into a personal calendar. The recurring checker itself may appear in `OpenClaw Automations` under the existing calendar rule for Automations.

## Approved defaults

- Time zone: `America/Vancouver`.
- Daily schedule: `09:15`.
- Upcoming window: the next calendar day only.
- Delivery destination: Glaucon's Telegram direct conversation.
- Empty result: no Telegram message.
- Runtime: native command Automation; no Agent turn and no model calls.
- Completed items: excluded.

## Data contract

Add nullable `due_on date` to `public.observatory_work_items`.

`due_on` is a calendar date rather than a timestamp because V1 communicates a day-level commitment and avoids false precision. Date classification always uses `America/Vancouver`:

- `due_on < today`: overdue.
- `due_on = today`: due today.
- `due_on = today + 1 day`: due tomorrow.
- `due_on is null`: not included.
- `state = done`: not included.

The migration adds an index suitable for the daily query, preserves existing rows as `null`, and updates the audited Work Item update RPC so due-date changes remain version-checked and event-backed.

## Product surface

The Work Item detail form adds an optional `Due date` field. The server validation accepts either an ISO date (`YYYY-MM-DD`) or `null`; invalid dates fail closed.

The Work Tracker board shows the due date on each card when present and applies deterministic labels:

- `Overdue`
- `Due today`
- `Due tomorrow`
- a plain localized date for later items

No calendar synchronization, per-item reminder settings, recurrence, snooze, or hour-level deadline is included in V1.

## Daily reporter

Add a repository-owned command that:

1. Loads the existing local Supabase database configuration without printing credentials.
2. Queries unfinished Work Items whose `due_on` is no later than tomorrow.
3. Classifies and sorts them by overdue, today, tomorrow; then due date, priority, Project, and title.
4. Renders one bounded Chinese plain-text digest containing title, Project, Owner, state, priority, due date, and a Work Tracker deep link.
5. Prints nothing when there are no matching items.
6. Exits nonzero with a private-safe stable error when database access or rendering fails.

The command does not call an LLM, start an Agent turn, mutate Work Items, or mark reminders as delivered. The daily schedule itself provides deduplication: one digest per successful scheduled run.

## Automation contract

Create one OpenClaw Automation:

- Schedule: `15 9 * * *`, `America/Vancouver`.
- Payload: `command` invoking the repository reporter from the canonical production checkout.
- Delivery: Telegram `announce`; empty stdout is intentionally suppressed.
- Failure alert: after two consecutive execution failures, with a six-hour cooldown.
- Execution class: model-free.

The Automation is registered in the system Automation Registry and represented in `OpenClaw Automations` calendar according to the shared calendar rule. It is not mirrored into `Glaucon Life`.

## Message shape

```text
Work Tracker｜到期事项 · 2026-09-24

已逾期（2）
- [URGENT] 项目 / 标题｜Owner｜In Progress｜原定 2026-09-22

今天到期（1）
- [HIGH] 项目 / 标题｜Owner｜Review｜今天

明天到期（1）
- [MEDIUM] 项目 / 标题｜Owner｜Ready｜明天

查看 Work Tracker：https://402v.com/work-tracker
```

Empty sections are omitted. Output is capped by item count and byte size; if additional items exist, the digest reports the omitted count and keeps the Work Tracker link.

## Security and privacy

- Credentials remain in the existing protected local environment and never enter stdout, receipts, logs, test fixtures, or Automation configuration.
- The reporter selects only fields needed for the digest.
- Titles and Project references are user-authored data and are rendered as plain text, not executed as Markdown commands or shell input.
- Database errors return a stable public-safe error; raw connection strings and exception details stay out of Telegram.

## Verification

Tests must cover:

- migration shape, grants, RPC compatibility, and existing-row preservation;
- date validation, leap days, and Vancouver calendar boundaries;
- excluding `done` and `due_on = null` items;
- all three digest groups and stable ordering;
- empty-output silence and output bounds;
- private-safe failures and zero model calls;
- Work Item detail edit and board display;
- live Automation configuration, one forced quiet smoke run, and one synthetic renderer fixture without writing synthetic rows to production.

Release requires the repository's complete release verification, production migration, exact-SHA deployment checks, production smoke, and live Automation verification.

## Dependency and rollout order

The current primary checkout contains an unrelated, uncommitted Work Tracker UI evolution. This feature must not overwrite or absorb that work accidentally.

Rollout order:

1. Finish or canonicalize the existing Work Tracker UI changes.
2. Rebase this isolated feature branch onto that canonical baseline.
3. Implement migration, domain validation, repository/RPC updates, UI, and reporter with TDD.
4. Release the application and database migration.
5. Create and verify the model-free Automation last, after the production schema and command are available.

## Non-goals

- No personal calendar events for Work Items.
- No Agent-generated prose.
- No automatic state changes, escalation, reassignment, or claiming.
- No per-owner direct messaging in V1.
- No weekly summary or configurable reminder window in V1.
