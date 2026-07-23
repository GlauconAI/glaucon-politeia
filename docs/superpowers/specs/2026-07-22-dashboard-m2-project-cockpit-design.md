# Dashboard M2 Project Cockpit Design

**Status:** Approved for implementation by Glaucon on 2026-07-22
**Scope:** First M2 Delivery Governance vertical slice
**Canonical dogfood project:** Dashboard
**Out of scope:** editable governance data, Roadmap/Gantt, flow analytics, forecast computation, reports, Work Tracker expansion, agent claiming, and Gateway lifecycle controls

## 1. Outcome

The first M2 slice adds a read-only Project Cockpit to the existing admin-only
`/dashboard` page. It lets an administrator inspect the Dashboard project's
delivery hierarchy and evidence without opening the underlying Vault files.

The cockpit must answer:

1. Which Milestones, Features, and Tasks exist, and what is their status?
2. Which Execution Contract is accountable for each Feature and Task?
3. Which Executor Runs and Gate decisions provide delivery evidence?
4. Which dependencies and risks are open?
5. Which date facts are available now, and which are explicitly not recorded?

The Dashboard project is the first dogfood dataset. The design deliberately
creates a reusable read model so later M2 slices can add Roadmap, analytics,
forecasting, and reports without replacing the data boundary.

## 2. Approaches Considered

### A. Extend the versioned Snapshot read model — selected

The trusted local Collector reads a strict allowlist of Dashboard governance
documents, projects them into a validated governance read model, and publishes
that model inside an append-only Snapshot. Vercel only renders the validated
Snapshot.

Benefits:

- preserves the current privacy and last-known-good architecture;
- keeps Vault documents as source of truth;
- requires no production write API or governance tables;
- gives every rendered fact a source and collected timestamp;
- supports schema-versioned rollout and rollback.

Cost: the Markdown projection must be strict, bounded, and tested against
format drift.

### B. Add normalized Supabase governance tables

This would make arbitrary queries easier, but it introduces migrations, a new
write path, synchronization rules, and duplicated canonical state before the
read-only product has proved its shape.

Decision: defer until a later slice demonstrates that Snapshot queries are
insufficient.

### C. Compile checked-in JSON during application build

This is simpler but becomes stale between deploys, bypasses the existing
15-minute refresh, weakens provenance, and creates a second manually maintained
source.

Decision: reject.

## 3. Architecture

The existing architecture remains:

```text
Vault governance documents
        │
        ▼
allowlisted bounded parser
        │
        ▼
strict governance read model
        │
        ▼
Snapshot v3 + privacy validation
        │
        ▼
Supabase append-only Snapshot store
        │
        ▼
admin-only Project Cockpit
```

Snapshot schema `3.0.0` adds one optional top-level
`delivery_governance` object to the existing v2 envelope. The application keeps
accepting v1 and v2 Snapshots. A missing v3 object renders a bounded
"governance data not yet available" state while System Observatory and Quick
Capture continue working.

No new dependency is added.

## 4. Canonical Sources and Collection Boundary

Only these paths relative to the explicit Vault root are accepted:

- `plato-academy/projects/dashboard/README.md`;
- `plato-academy/projects/dashboard/development-baseline.md`;
- `plato-academy/projects/dashboard/edad-tracker.md`;
- `plato-academy/projects/dashboard/estimate-calibration.md`.

The Collector:

- resolves every file beneath the explicit Vault root;
- rejects symlink or realpath escape;
- reads no other Markdown file;
- enforces a per-file byte limit and aggregate record limits;
- parses known headings and Markdown tables only;
- strips Markdown links to safe display labels;
- publishes logical source labels, never absolute paths;
- rejects duplicate IDs, dangling parent references, malformed rows, and
  unknown Execution Contract values;
- preserves bounded source status labels while deriving a closed normalized
  status category for filtering and counts;
- does not publish raw document text.

A governance-source failure fails the v3 candidate collection. It never
publishes a partial governance model as healthy and never replaces the latest
successful Snapshot.

## 5. Read Model

`delivery_governance` contains:

- `project`: stable ID, name, accountable owner, phase, health, plan revision,
  baseline status, and logical source;
- `milestones`: stable ID, name, status, forecast, variance, feature IDs,
  evidence references, and logical source;
- `features`: ID, parent Milestone, name, scope class, status, Execution
  Contract instance/type, estimate hours, confidence, baseline finish,
  forecast finish, actual finish when present, and Gate requirement;
- `tasks`: ID, parent Feature, name, status, Execution Contract instance/type,
  estimate hours, confidence, forecast finish, evidence references, and
  optional actual dates;
- `executor_runs`: run ID, task/bundle reference, functional role, sequence,
  start, finish, active time, artifact, evidence summary, and rework flag;
- `gates`: gate ID, date, type, result, status, evidence summary, and optional
  reviewer run ID;
- `risks`: risk ID, description, impact, status, mitigation, and source;
- `dependencies`: dependency, owner, needed-by milestone, status, and source;
- `summary`: Milestone/Feature/Task/Run/Gate counts plus accepted, active,
  planned, at-risk, and missing-date counts;
- `source`: collected timestamp, logical source labels, source digest, and
  health.

All strings and arrays are bounded. Dates may be an ISO date/timestamp or the
explicit sentinel `not_recorded`; the parser never invents a date. Candidate
Baseline fields remain labelled candidate until the source records user
approval.

## 6. User Experience

The Project Cockpit appears after System Observatory and before Quick Capture.
It remains part of the existing `/dashboard` route.

### Portfolio summary

Cards show:

- current phase and health;
- Milestone, Feature, Task, Run, and Gate totals;
- accepted versus planned outcomes;
- open risks and dependencies;
- Baseline status.

### Hierarchy explorer

The primary accessible view is:

```text
Milestone
  → Feature
    → Task
```

Native buttons expand/collapse rows. A global search and status filter operate
across IDs, names, contracts, evidence, risks, and dependencies. Every row
shows its stable ID, status, Execution Contract, estimate/confidence, and
available date facts.

### Evidence panels

Separate semantic lists show:

- Executor Runs ordered by sequence/time;
- Gate decisions and evidence;
- risks and mitigations;
- dependencies and owners.

Missing run or date evidence is rendered as "Not recorded"; absence is never
shown as zero, done, or on track.

The slice uses native HTML/CSS and the current Dashboard visual language. It
does not add charting, graph, or Gantt libraries.

## 7. Error, Privacy, and Compatibility Behavior

- v1/v2 Snapshot: show the existing Dashboard plus a governance-unavailable
  notice.
- valid v3 with zero records: show an explicit empty cockpit.
- invalid v3: reject the Snapshot at schema validation; preserve
  last-known-good.
- source format drift: fail collection with a sanitized governance parser code.
- long or adversarial text: reject or bound it before publication; never render
  raw HTML from Markdown.
- private paths, emails, credentials, messages, and arbitrary Markdown content
  remain forbidden by the existing privacy scan.
- Project Cockpit is read-only. It cannot edit Vault files, Supabase governance
  data, OpenClaw state, or Gateway state.

## 8. Verification

The Gate requires:

- genuine RED/GREEN tests for schemas, strict table projection, hierarchy
  integrity, duplicate/dangling IDs, format drift, resource limits, source
  escape, and deterministic ordering;
- adversarial privacy fixtures proving raw Markdown, absolute paths, links,
  emails, secrets, and unknown columns are not serialized;
- compatibility tests for v1, v2, and v3 Snapshots;
- UI tests for summary, hierarchy, expand/collapse, search, filtering, empty,
  missing-date, risk/dependency, run, Gate, keyboard, and long-text states;
- a real local Dashboard governance collection and privacy scan;
- full tests, lint, typecheck, production build, and diff check;
- production publication and authenticated/anonymous/legacy-route smoke before
  the slice is marked accepted.

## 9. Rollback

- leave v3 Snapshot rows append-only;
- deploy a rollback commit that keeps v3 parsing and hides the Project Cockpit,
  so the existing System Observatory remains compatible with the latest
  Snapshot;
- disable governance collection by reverting the Collector commit; no Gateway
  restart or database rollback is required.

## 10. Follow-on M2 Slices

1. Three-track Roadmap and Baseline Review;
2. Flow Analytics and Forecast;
3. Governance Reports and Review.

Each follow-on consumes the same validated governance read model and gets its
own design, implementation plan, and production Gate.
