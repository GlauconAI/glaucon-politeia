# 402V Agent-Native Project Control P0 Design

**Status:** proposed for written-spec review

**Date:** 2026-08-23

**Product owner:** Glaucon

**402V implementation owner:** Plato

**Authority producer owner:** Socrates / OpenClaw Orchestrator

**Scope:** P0-A consumer foundation followed by P0-B Asgard production adoption

## 1. Outcome

Upgrade 402V from two adjacent capabilities—an advanced manual Work Tracker and a read-only Project execution portfolio—into one Agent-native Project Control Tower.

The resulting product must let Glaucon answer, within one minute:

1. What is this Project trying to achieve?
2. Which approved Plan Revision is authoritative?
3. Which Stages are complete, active, independently owned, blocked, ready, or planned?
4. Who is accountable, who is executing, and who currently controls each line?
5. Which dependencies, Artifacts, Verifications, Gates, and User Decisions determine admission?
6. What is the next admissible Stage, and what evidence is still missing?
7. Which Work Tracker cards implement a Stage without being allowed to change that Stage directly?

The OpenClaw Orchestrator remains the only Project authority. 402V consumes a bounded public projection, renders it, and manages only local Work Tracker execution records. It never infers or writes canonical Project state.

## 2. Scope and delivery sequence

### P0-A — 402V consumer foundation

P0-A ships independently with strict Asgard fixtures and no producer dependency:

- `ProjectControlSnapshot 1.0.0` schema and digest verification;
- Observatory collection envelope v6 with v1–v5 read compatibility;
- an explicit bounded read of `project-control-snapshot.json`;
- Project portfolio control summaries;
- a Project Control detail page with Stage DAG, ownership, admission, Artifact, Verification, Gate, Decision, and Outcome views;
- a read-only User Decision Center;
- stable Work Tracker bindings to Project / Plan / Stage / Work Package;
- explicit fresh, stale, empty, unavailable, and unmatched-binding states;
- privacy, responsive, accessibility, compatibility, and rollback tests.

P0-A uses fixture data only for the new control model. It does not parse the Vault or fabricate a production Asgard Project.

### P0-B — Asgard production adoption

P0-B begins only after Socrates publishes a producer that conforms to the reviewed contract:

- export the approved Asgard Plan v3 and current control facts;
- collect and publish the real projection through Observatory v6;
- verify Stage 01–04D, 05A/05B, 06A–06C, 07–10, Gate 2, Gate 3 dependencies, and transfer modes;
- publish the production Snapshot;
- deploy and complete authenticated desktop and 390px verification.

P0-B may fix consumer defects revealed by the real projection. It may not reinterpret producer semantics or edit the Asgard Plan.

## 3. Approaches considered

### A. Two-stage public projection and control tower — selected

Add a new strict public `ProjectControlSnapshot` beside the existing `ProjectExecutionSnapshot`. P0-A proves the consumer with fixtures; P0-B replaces fixtures with the real Orchestrator projection.

Benefits:

- preserves one authority;
- avoids blocking consumer development on producer work;
- keeps the existing execution portfolio backward compatible;
- makes the privacy and semantic contract independently testable;
- provides a clean rollback to Observatory v5.

### B. Read Asgard Plan and Vault files directly from 402V — rejected

This would make 402V a second Plan interpreter, expand the collection boundary into private knowledge files, and allow producer/consumer semantic drift.

### C. Store Project authority in normalized Supabase tables — rejected for P0

This would make Project, Stage, Gate, Artifact, and Decision independently editable in a second database. Supabase remains the append-only Snapshot store and the authority for local Work Tracker rows only.

### D. Extend only the current Project execution v1 schema — rejected

Execution lines and full Project Control have different compatibility and release lifecycles. Replacing the compact v1 projection would make the existing `/dashboard/projects` release harder to roll back and force the producer to emit fields that are irrelevant to execution-line consumers.

## 4. Reuse Gate

### Reuse without modification

- Observatory append-only Snapshot store and last-known-good selection;
- v1–v5 schema compatibility pattern;
- explicit-path, bounded collector architecture;
- SHA-256 canonical digest pattern;
- centralized absolute/private path detection and privacy scan;
- existing Next.js 16, React 19, TypeScript, Zod, Supabase, and CSS stack;
- admin-only Dashboard shell and 402V visual system;
- existing Work Tracker transition graph, Ready Gate, optimistic concurrency, evidence, and append-only audit events;
- existing Project execution transfer-mode labels and responsive lane patterns.

### Adapt

- add Observatory v6 rather than replacing v5;
- add a separate Project Control source-health domain;
- promote Project cards into links to Project Control detail views;
- reuse semantic lists and CSS connectors for a bounded Stage DAG instead of adding a graph library;
- extend Work Tracker rows with immutable authority references while retaining their local workflow.

### Build

- the strict Project Control domain schema;
- Project Control selectors and view models;
- Stage DAG/admission, ledger, decision, and outcome UI;
- binding validation and unmatched-binding states;
- exact Asgard fixture and producer contract.

### Rejected dependencies

- no chart or DAG library for P0;
- no second state-machine library;
- no ORM or new database client;
- no Vault parser;
- no direct Orchestrator command client;
- no Agent Runner activation.

## 5. Authority and data flow

```text
Approved Project Plan + Stage Runs + Artifact/Verification/Gate/Decision facts
                              │
                              ▼
                  OpenClaw Orchestrator producer
                              │
                  project-control-snapshot.json
                    strict public projection 1.0.0
                              │
                              ▼
       explicit path + byte limit + Zod + digest + privacy validation
                              │
                              ▼
               Observatory collection envelope 6.0.0
                              │
                              ▼
             append-only Supabase Snapshot / last-known-good
                              │
              ┌───────────────┴────────────────┐
              ▼                                ▼
      Project Control UI              Work Tracker binding UI
       read-only authority           local execution state only
```

402V does not calculate a canonical Stage transition. It displays producer-supplied status and admission evaluation. A Work Item transition changes only the Work Item and its audit history.

## 6. Public projection model

The complete normative JSON contract is in:

`docs/superpowers/specs/2026-08-23-project-control-projection-contract-v1.md`

The top-level model contains:

- `schema_version`, `collected_at`, `summary`, `projects`, and `digest`;
- every Project carries stable identity, authority source, approved/current Plan revision, source revision, freshness, objective, status, current Stage/Gate, and update time;
- first-class arrays for Plan Revisions, Stages, Work Package contracts, Agent Execution Lines, Dependencies, Artifacts, Verifications, Gates, User Decisions, and Outcome Reviews.

The model separates six ownership concepts:

- accountable owner;
- executing agent;
- functional role;
- transfer mode;
- return trigger;
- current controller.

The model also separates four facts that must never be collapsed:

- canonical Stage status;
- producer-computed admission evaluation;
- local Work Tracker state;
- User Gate decision.

## 7. Stage and admission semantics

Stage status is closed to:

- `planned`;
- `dependency_blocked`;
- `ready`;
- `admitted`;
- `active`;
- `waiting_input`;
- `verifying`;
- `completed`;
- `cancelled`.

Each Stage carries a producer-supplied `admission` object:

- `eligible`: whether contracts currently permit admission;
- `evaluation`: `blocked | candidate | admitted | terminal`;
- `reason_codes`: bounded closed reasons;
- `missing_dependency_ids`;
- `missing_artifact_contract_ids`;
- `missing_verification_ids`;
- `missing_gate_ids`;
- `computed_by: orchestrator`;
- `evaluated_at`.

`eligible=true` means the Stage is a candidate for the proper authority to admit. It is not a User Gate decision and does not allow 402V to start the Stage.

The producer supplies `critical_path` and `next_admissible_stage_ids`. The consumer verifies references and displays them; it does not independently derive authority semantics.

Historical Stages use `status=completed` plus `provenance=imported_baseline`. They do not fabricate current-day transition events.

## 8. Artifact, Verification, Gate, Decision, and Outcome ledgers

### Artifact ledger

Each Artifact record identifies its contract, Stage, logical reference, digest, version, producer, status, predecessor, and acceptance facts. The schema enforces:

- at most one `current_canonical` Artifact per Artifact contract;
- superseded Artifacts must identify their successor or replacement relation;
- a current canonical Artifact must have a digest and accepted timestamp;
- only logical references are public; absolute paths are forbidden.

### Verification ledger

Each Verification records `producer | machine | independent` mode, verifier, Artifact IDs, status, bounded evidence summary, timestamp, and optional failure reason. A passed Verification cannot contain a failure reason.

### Gate ledger

Each Gate lists required Artifact contract IDs and Verification IDs, current status, decision authority, missing evidence, and linked Decision. `ready` means evidence completeness only. Only a recorded User Decision may yield `passed` or `failed` for User-owned Gates.

### User Decision Center

P0 is read-only. It groups:

- pending decisions;
- decisions blocked by missing evidence;
- ready decision packages;
- recorded decisions and their audit facts.

Each pending item includes the question, bounded options, impact summary, downstream Stage IDs, evidence completeness, and suggested actions: accept, request evidence, or return a minimal work package. Suggested actions are explanatory labels, not executable controls.

### Outcome review

Outcome Review is a first-class read-only record with decision, evidence summary, review authority, timestamp, and follow-up Stage or Project disposition. P0 does not create one.

## 9. Work Tracker boundary and binding model

Extend `observatory_work_items` with nullable bounded columns:

- `project_key`;
- `plan_revision`;
- `stage_id`;
- `work_package_id`.

Existing `project_ref` and `milestone_ref` remain backward-compatible descriptive references. They are not promoted into authority keys and do not substitute for the four-field binding.

The four values form one binding. Valid states are:

1. all four null: an ordinary unbound Work Item;
2. all four present: a bound Work Item;
3. any partial combination: rejected by schema and database constraint.

The UI offers bindings from the latest validated Project Control Snapshot; it does not offer free-form authority creation. The database cannot use a foreign key into an append-only JSON Snapshot, so the server validates syntax and records the exact binding atomically. At read time the application classifies the binding as:

- `matched`;
- `stale_revision`;
- `unknown_project`;
- `unknown_stage`;
- `unknown_work_package`;
- `control_source_unavailable`.

An unmatched binding remains visible and auditable. It is never silently reassigned.

Work Item transitions, drag actions, Agent claim completion, and `Done`:

- update only Work Tracker state;
- may append evidence;
- never update the public Snapshot;
- never change Stage, Gate, Artifact, Verification, or Decision status;
- never trigger an Orchestrator command.

The existing Agent Claim Engine remains dormant and retains its current policy boundaries.

## 10. Observatory compatibility and collection

### Envelope

Observatory v6 adds:

```ts
project_controls: ProjectControlSnapshot | null
```

The reader continues accepting v1, v2, v3, v4, and v5. Existing v5 Project execution data remains valid and renderable.

### Collector

The Project Control collector accepts exactly one configured file path named `project-control-snapshot.json` and:

1. resolves the configured parent and file realpaths;
2. rejects path escape;
3. reads at most 10 MiB;
4. parses JSON;
5. applies strict Zod validation;
6. recomputes and compares the canonical SHA-256 digest;
7. applies the central privacy path detector and aggregate Snapshot privacy scan;
8. returns sanitized error codes only.

It never scans a directory, Work store, session store, Agent workspace, or Vault.

### Failure and last-known-good

- missing source: publish v6 with `project_controls=null` and `unknown` source health only when no prior valid v6 control source exists;
- invalid candidate: reject the refresh candidate and retain the latest successful Snapshot;
- stale producer data: publish valid data with `freshness=stale` and a visible warning;
- revision drift: display producer-supplied drift facts and disable claims of freshness;
- v1–v5 Snapshot: render the existing Dashboard and a bounded “Project control data not available” state.

## 11. Product information architecture

### `/dashboard/projects`

Keep the Project directory and execution portfolio. When Project Control is available, each Project card adds:

- approved Plan Revision;
- current Stage and Gate;
- fresh/stale badge;
- completed/active/blocked Stage counts;
- critical-path summary;
- pending decision count;
- link to the Project Control detail route.

The existing compact execution lanes remain available; they are not replaced by the full Stage DAG.

### `/dashboard/projects/[project-slug]`

The Project Control detail page contains, in order:

1. objective, authority, freshness, current Plan Revision, current Stage/Gate;
2. current control summary: critical path, next admissible Stage, missing evidence, pending decisions;
3. Stage DAG with parallel lanes and accessible dependency lists;
4. owner/controller panel;
5. Artifact / Verification / Gate ledger;
6. bound Work Packages and Work Tracker cards;
7. Decision and Outcome history.

The route uses the producer-supplied safe `project_slug`; it does not place a slash-bearing `project_key` in the URL.

### `/dashboard/decisions`

Show all pending, evidence-blocked, ready, and recorded decisions across Projects. Filters cover Project, status, Gate, and owner. Every row links back to the relevant Project/Stage/Gate.

### Responsive and accessible DAG

P0 does not use a canvas graph. Desktop uses CSS Grid lanes and connectors. At approximately 390px, each Stage becomes a semantic card in topological order with explicit `Depends on` and `Unlocks` text. Keyboard and screen-reader users receive the same facts without spatial interpretation.

## 12. Empty, stale, unavailable, and unmatched states

- valid Snapshot with zero Projects: “No Project control records published.”
- Project execution available but Project Control unavailable: keep execution portfolio and explain the missing control projection.
- stale source: render last valid facts with timestamp and stale warning.
- invalid refresh candidate: retain last-known-good; do not render the invalid candidate.
- registry Project without control projection: show `Unmatched Project` without inventing Plan/Stage state.
- control Project without registry match: render control card with `Registry match unavailable`.
- bound Work Item with unmatched identity: show exact logical binding and mismatch reason; never detach automatically.

## 13. Privacy and security

Every public text or logical-reference field uses the same privacy-safe primitives already proven by Project execution v1. The consumer rejects:

- POSIX, Windows, UNC, home-relative, `file://`, workspace, Vault, and private path forms;
- session keys, private Work IDs, operation IDs, raw message content, credentials, cookies, and tokens;
- unknown fields, unbounded arrays, control characters, duplicate IDs, dangling references, cycles, invalid summaries, and digest mismatch.

The UI is admin-only. Project Control is read-only. Work Tracker writes continue through authorized server actions and `SECURITY DEFINER` RPCs with row locks, expected-version checks, atomic mutation/event append, and stable sanitized errors.

## 14. Testing and verification

P0-A requires genuine RED/GREEN cycles for:

- strict Project Control schema and public-text privacy;
- digest determinism and mismatch rejection;
- duplicate/dangling references and Stage DAG cycles;
- transfer-mode and current-controller semantics;
- Artifact single-canonical invariant;
- Verification and Gate consistency;
- User Decision and User-owned Gate consistency;
- summary drift and Asgard fixture completeness;
- explicit collector path, resource limit, invalid source, and source health;
- Observatory v1–v6 read compatibility;
- Project selectors and matched/unmatched Work Item bindings;
- database all-null/all-present binding constraint, optimistic concurrency, and audit payload;
- portfolio, detail, DAG, ledger, decision, empty, stale, unavailable, and responsive views;
- Work Tracker transitions proving no Stage/Gate mutation path exists.

The release Gate runs:

- focused tests;
- full Vitest;
- ESLint;
- TypeScript;
- `git diff --check`;
- production build;
- local Snapshot collection, digest, retention, and privacy checks;
- database migration and authorization verifier;
- authenticated browser verification at 1440×1000 and 390×844;
- no horizontal overflow, keyboard reachability, scoped axe, console errors, and page errors.

P0-B adds exact real-projection checks for Asgard:

- historical complete: 01–04D and Gate 2;
- independent owner lines: 05A and 05B, with PM not waiting;
- dependency blocked: 06A, 06B, and 06C;
- planned: 07A, Gate 3, 08, 09, and 10;
- six Gate 3 freeze interfaces;
- current critical path, next admissible Stage, missing Artifact, and pending User Decision facts;
- privacy denylist zero.

## 15. Rollout and rollback

### P0-A rollout

1. apply the additive Work Tracker binding migration and verify both the legacy and binding-aware RPC signatures;
2. merge and deploy the v6-compatible consumer code;
3. keep `project_controls=null` in production until a producer export passes the contract and privacy gates;
4. verify all existing v5 pages, legacy Work Tracker flows, and binding-aware flows remain unchanged.

### P0-B rollout

1. Socrates publishes a contract-valid projection;
2. Plato collects and verifies it locally;
3. publish the v6 Snapshot;
4. deploy the production UI if P0-B consumer fixes were required;
5. perform authenticated browser verification;
6. retain the release Snapshot digest as evidence.

### Rollback

- deploy the prior v5-compatible application commit;
- stop Project Control collection while retaining append-only v6 rows;
- keep the additive Work Tracker columns; null bindings preserve old behavior;
- do not roll back or edit Orchestrator authority facts;
- restore the last retained production Snapshot if a later candidate is invalid.

## 16. Explicit exclusions

P0 does not include:

- Plan revision diff or downstream impact analysis;
- executable command proposals;
- direct User Gate decisions from 402V;
- automatic Stage admission or dispatch;
- automatic minimal rework creation;
- notification fan-out;
- Agent Runner activation;
- raw Work/session/Agent workspace reads;
- Herodotus or Aristotle signal consumption;
- Asgard Stage 06 start;
- edits to Asgard Plan v3;
- a graph/chart library or parallel visual theme.

## 17. Acceptance decision

P0-A is accepted when the fixture-backed consumer, Work Tracker bindings, compatibility, privacy, database, build, and responsive browser Gates pass while production continues to operate safely with `project_controls=null`.

P0-B is accepted when the real Asgard public projection passes the exact contract, all Plan v3 control semantics render without omissions, and production verification proves that 402V did not become a second Project authority.
