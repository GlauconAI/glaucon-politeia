# Dashboard Three-Module Milestones And System Observatory Design

**Status:** Approved for implementation by Glaucon on 2026-07-22
**Scope:** Dashboard planning model plus the complete System Observatory module
**Out of scope:** Delivery Governance product views, Work Tracker workflow expansion, automatic agent claiming, and any Dashboard control that mutates OpenClaw or restarts Gateway

## 1. Decision

Dashboard delivery is reorganized around its three product modules instead of mixing partial slices of all three modules into every milestone.

| Milestone | Product outcome | Included legacy feature families |
|---|---|---|
| M0 — Foundation and released vertical slice | Preserve the already accepted M1A architecture, auth, Snapshot store, publisher, core collector, core UI, Quick Capture, and release evidence as historical foundation | OBS-F000, completed parts of OBS-F101–F107 |
| M1 — System Observatory | Complete the read-only system inventory, runtime health, provenance, topology, automated refresh, failure handling, retention, and operational verification | OBS-F101–F104 remainder, OBS-F201, OBS-F202, OBS-F401, OBS-F402, System Observatory portions of OBS-F107 |
| M2 — Delivery Governance | Build project cockpit, roadmap, three-track dates, analytics, forecasts, reports, and governance reviews | OBS-F106, OBS-F203, OBS-F301, OBS-F302 |
| M3 — Work Tracker | Complete the manual workflow, details/history/evidence, then add bounded low-risk claiming and dogfood | OBS-F105, OBS-F501, OBS-F502 |

The final Dashboard v1 acceptance is a release Gate after M3, not a fourth business milestone. Existing Feature and Task IDs, estimates, commits, Gate records, and historical names remain immutable evidence. The Baseline and Tracker receive a new approved plan revision that only remaps future work and records actual completion.

## 2. System Observatory Completion Contract

M1 is complete only when an administrator can answer five questions from `https://402v.com/dashboard`:

1. What system assets exist?
2. Who owns each asset, where did the fact come from, and how fresh is it?
3. Is Gateway/runtime/scheduling healthy, and what failed or became stale?
4. How are assets related, and which relationships are canonical, declared, observed, or derived?
5. When did the last successful refresh occur, and what last-known-good state remains available after failure?

The inventory covers:

- Agents, bindings, projects, scenes, and execution flows;
- Skills and plugin/tool providers;
- browser/tool profiles;
- Rules and fixed agent configuration files;
- configuration presence and health metadata;
- knowledge-base areas and agendas as metadata only;
- Cron jobs as a strict safe projection;
- Gateway and runtime health.

No content from passwords, tokens, cookies, messages, `USER.md`, `MEMORY.md`, browser history, private knowledge pages, Cron payload messages, or config values may enter a Snapshot.

## 3. Architecture

The existing local Collector → validated Snapshot → Supabase → admin-only Dashboard architecture remains unchanged. The Snapshot read model advances from collection schema `1.0.0` to `2.0.0`; the page continues accepting stored v1 Snapshots during rollout.

New units:

- `asset-schema.ts`: strict asset, health, provenance, and relationship contracts;
- `system-assets.ts`: pure normalization of safe OpenClaw CLI/file metadata inputs;
- `system-collector.ts`: bounded, read-only orchestration of approved commands and explicit roots;
- `SystemInventory.tsx`: accessible searchable inventory grouped by domain;
- `SystemTopology.tsx`: provenance-aware relation view with a semantic list as the primary accessible representation and a lightweight visual map as enhancement;
- `FreshnessSummary.tsx`: age-derived freshness, last success, failure, and health rollup.

No graph library is added. The first complete topology uses native React/CSS/SVG and limits the rendered visual set; the full relationship list remains searchable and keyboard-readable.

## 4. Data Contract

Every asset contains:

- stable logical `id` and `kind`;
- human-readable `name`;
- `owner`;
- `authority`: canonical / declared / observed / derived;
- logical `source` without an absolute private path;
- `collected_at` and age-derived `freshness`;
- `health`: healthy / degraded / failed / unknown / disabled;
- a bounded safe `summary`;
- optional whitelisted labels only.

Every relationship contains `from`, `to`, `kind`, `authority`, and `source`. Relationship endpoints must reference emitted assets or existing core objects. Unknown relations are omitted, never guessed.

Freshness thresholds are part of the versioned Source Contract:

- runtime, Gateway, and Cron: stale after 15 minutes;
- skills, plugins/tools, profiles, and agent configuration metadata: stale after 24 hours;
- knowledge/agenda/rules metadata and canonical registry: stale after 24 hours;
- a failed source is always `failed` regardless of age.

## 5. Collection And Failure Behavior

Approved read-only command families are explicit argv arrays:

- `openclaw agents list --json`;
- `openclaw status --json`;
- `openclaw skills list --agent <id> --json`;
- `openclaw plugins list --json`;
- `openclaw cron list --all --json`;
- `openclaw gateway status --json`.

Command output is bounded and strictly projected. Cron payloads, delivery destinations, tokens, URLs, session keys, absolute paths, and arbitrary metadata are discarded.

Filesystem collection accepts explicit runtime roots, follows no symlinks outside those roots, reads only directory entries plus stat metadata, and hashes approved rule/config files without publishing their content. A domain failure produces a failed source record; it must not fabricate healthy assets.

The Publisher remains append-only and idempotent. A failed or invalid collection does not replace the latest successful Snapshot. Retention keeps the newest 30 successful Snapshots and all release-marked evidence; cleanup is a separate explicit operation and never runs in the browser.

## 6. Automation

The production refresh mechanism is an OpenClaw isolated Cron job that runs the existing local collection and publication command on the trusted Mac. It does not run in Vercel and does not create a daemon.

- cadence: every 15 minutes;
- concurrency: a lock prevents overlapping collection/publication;
- success: publish only after schema and privacy validation;
- failure: preserve last-known-good, record a sanitized failure result, and notify after three consecutive failures;
- stale escalation: notify if no successful Snapshot is newer than 45 minutes;
- recovery: the next valid run clears the consecutive-failure state and emits one recovery notification;
- Gateway restart is never performed automatically.

Creation of the live Cron job, notification delivery, production publication, and Vercel deployment are explicit release operations performed only after local verification.

## 7. User Experience

The Dashboard keeps the existing header and Quick Capture. System Observatory becomes the primary first section with:

- health and freshness summary cards;
- domain tabs/anchors for Core, Skills, Tools & Profiles, Rules & Config, Knowledge & Agenda, and Operations;
- one global search across all system assets;
- owner, authority, freshness, and health filters;
- source/provenance shown on every detail row;
- topology view plus semantic relationship list;
- clear empty, partial, stale, and failed states.

Private absolute paths and raw errors are never rendered. Error text uses stable diagnostic codes and safe operator guidance.

## 8. Verification And Release Gate

M1 requires:

- red/green tests for strict schemas, projections, freshness, topology integrity, resource bounds, and failure behavior;
- privacy adversarial fixtures covering secrets, paths, emails, payload messages, and unknown fields;
- UI keyboard, search/filter, stale/failed, empty, and large-inventory degradation tests;
- full unit/integration suite, lint, typecheck, production build, and diff check;
- disposable local Supabase migration/read compatibility and Publisher idempotency checks;
- real local collection privacy scan;
- production Snapshot publication, admin page smoke, anonymous/non-admin access checks, and rollback evidence;
- automated refresh Cron plus failure/stale/recovery verification without restarting Gateway.

## 9. Rollback

- UI rollback: deploy the prior Vercel commit; v2 Snapshots remain append-only and harmless.
- data rollback: page falls back to the latest valid v1 or v2 Snapshot; no historical row is overwritten.
- automation rollback: disable/remove the Dashboard refresh Cron; no Gateway restart is needed.
- collector rollback: run the previous M1A collector/publisher commands.
