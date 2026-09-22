# Dashboard Automations Directory Design

## Goal

Upgrade the existing read-only Cron Operations Cockpit into one canonical
Automations directory for 402V Dashboard. OpenClaw Automations are the product
concept; `cron`, `every`, `at`, and `stream` are schedule kinds. The change must
reuse the current collector, safe asset projection, filters, Agent grouping,
time projection, and conflict analysis rather than create a parallel inventory.

## Product decision

Use one Automations surface.

- Canonical route: `/dashboard/automations`.
- Compatibility route: `/dashboard/crons`, redirected to the canonical route
  while preserving query parameters.
- Dashboard navigation and directory index use the label `Automations`.
- The page explains that existing `openclaw cron` and
  `openclaw automations` commands address the same Gateway scheduler records.
- Cron remains a schedule-kind filter, not a separate product area.

Rejected alternatives:

1. A second Automations page beside Cron Jobs duplicates state, filters, tests,
   and user concepts.
2. Renaming only the title leaves `stream` jobs and Automation-level language
   unresolved.

## Reuse boundary

Reuse the existing production implementation:

- source command: `openclaw cron list --all --json`;
- privacy-minimized `cron` asset projection;
- `buildCronDirectory` view model;
- `CronDirectory`, `CronTimeView`, and `CronAgentView` components;
- recurring schedule projection and conflict detection;
- existing Dashboard authentication and source-health handling.

The implementation may rename internal Cron-specific symbols when that reduces
confusion, but a broad refactor is not required. The first release should favor
small adapters and compatibility aliases.

## Information architecture

### Dashboard entry

Add one Automations card/link to the Dashboard directory index. Its summary
shows safe aggregate counts only:

- total Automations;
- enabled Automations;
- Automations needing attention.

### Automations page

Keep three views:

1. **Time** — enabled recurring `cron` and `every` Automations projected in
   Vancouver time, with hard conflicts and crowded windows.
2. **Agents** — enabled recurring Automations grouped by effective owner.
3. **All Automations** — every collected Automation, including one-shot `at`,
   event-driven `stream`, disabled, failed, and unknown records.

Filters:

- Owner;
- schedule kind: All, Cron, Every, At, Stream, Unknown;
- enabled state;
- health / needs attention;
- search and sort.

Each row may show only:

- display name and stable Job ID;
- Owner;
- enabled state and health;
- schedule kind, safe schedule summary, timezone;
- runtime target category;
- last run, next run, last status, consecutive errors.

The page must not expose payload messages, scripts, command arguments, session
keys, delivery destinations, Telegram chat IDs, scratch state, prompts, or
credentials.

## Schedule semantics

- `cron`: calendar expression; participates in future time projection.
- `every`: fixed interval; participates in future time projection.
- `at`: one-time schedule; visible in All Automations only.
- `stream`: event-driven source; visible in All Automations only and labelled
  event-driven. It has no fabricated next-run timestamp.
- unknown or malformed schedules remain visible but fail closed to `unknown`.

Conflict analysis remains limited to enabled time-based recurring Automations.
Event-driven and one-time Automations must not be forced into the recurring
timeline.

## Data flow

1. The existing local Observatory collector reads the Gateway Automation list.
2. The existing safe projector emits privacy-minimized assets.
3. The Dashboard loads the validated Snapshot from its current repository.
4. The Automations directory derives UI models from safe labels only.
5. The web page stays read-only and performs no Gateway mutation.

No new database table, API service, scheduler, or live Gateway call from the
browser is introduced.

## Error handling

- Stale or failed operations source: show the source-status banner and the last
  validated Snapshot.
- Missing schedule metadata: keep the Automation visible as `unknown`.
- Invalid timestamps or timezone: show `Not reported`; never guess.
- Legacy `/dashboard/crons` links: redirect to `/dashboard/automations` without
  dropping filters.

## Verification

Use TDD to cover:

- `stream` collection and directory projection;
- canonical Automations route and authenticated redirect;
- legacy Cron route query-preserving redirect;
- renamed labels, counts, filters, and safe metadata only;
- Time and Agents views excluding `at` and `stream` from recurring projection;
- Dashboard index link and aggregate counts;
- no payload, message, delivery, session, scratch, or command content in the
  published Snapshot or rendered page.

Run the focused Observatory suite, typecheck, lint, production build, and the
repository release verification. Perform authenticated desktop and mobile
smoke checks on the canonical route before production release.

## Release boundary

This is a read-only Dashboard presentation and compatibility change. It does
not edit, enable, disable, run, reschedule, or delete any OpenClaw Automation.
It does not change the Gateway scheduler or the P7 Usage Guardian Work.
