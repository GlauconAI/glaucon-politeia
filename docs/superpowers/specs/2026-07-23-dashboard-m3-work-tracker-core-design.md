# Dashboard M3 Manual Work Tracker Core Design

**Scope:** Deliver the first M3 vertical slice: an admin-only manual Work Tracker with a server-authoritative workflow, Ready Gate, accessible Board, item detail, evidence links, optimistic concurrency, and append-only audit history.

**Out of scope:** agent claiming, leases, automated execution, human approval queues for agents, external-source write-back, Gateway control, and non-admin collaboration.

## Outcome

The Dashboard administrator can capture an Idea, Feature, or Bug, triage it, make it Ready, execute it through Review and Done, reopen it when needed, and inspect every field, transition, and evidence change in one auditable product surface.

## Workflow

The database is authoritative for allowed transitions:

- `inbox → triage`
- `triage → inbox | ready`
- `ready → triage | in_progress`
- `in_progress → review | blocked | waiting`
- `blocked → in_progress | waiting`
- `waiting → in_progress | blocked`
- `review → in_progress | done | blocked | waiting`
- `done → reopened`
- `reopened → ready | in_progress`

No other transition is accepted. Entering `ready` or `in_progress` from `reopened` requires the Ready Gate: non-empty acceptance criteria, a priority, and an owner.

## Data model

Extend `observatory_work_items` with:

- `priority`: `low | medium | high | urgent`, nullable before triage completes.
- `owner_id`: nullable profile reference.
- `acceptance_criteria`: bounded text.
- `project_ref` and `milestone_ref`: optional bounded references into read-only governance data; they never write back to that data.

Add `observatory_work_item_evidence` with a bounded label, HTTPS/HTTP URL, creator, creation time, and soft-removal metadata. Active evidence is readable by administrators only.

Expand event types to `created`, `updated`, `state_transitioned`, `evidence_added`, and `evidence_removed`. Events remain append-only and retain the before/after state, expected/new version, and bounded evidence metadata. Work-item field edits, transitions, evidence additions, and evidence removals increment the work-item version inside the same locked transaction.

## Server boundary

All writes use `SECURITY DEFINER` RPCs that:

1. require an authenticated 402V administrator;
2. lock the target work item;
3. compare `expected_version`;
4. validate the operation and Ready Gate;
5. mutate the row/evidence and append the event atomically;
6. return a stable row or a stable error code.

Table grants remain read-only. Anonymous and non-admin callers cannot read or mutate Work Tracker data. Direct browser writes remain impossible.

## Application boundary

`lib/observatory/work-items.ts` owns enums, schemas, transition rules, labels, and form limits. `repository.ts` owns database reads/RPC calls and maps database errors into stable application errors. Server actions authorize before validation, call only the repository, revalidate affected routes after commits, and never leak database details.

## UI

- `/dashboard` keeps Quick Capture and adds a Board beneath the read-only observatory views.
- The Board groups cards by state. Native drag-and-drop is progressive enhancement; every card also exposes an explicit keyboard-operable “Move to” control listing only allowed targets.
- Each card links to `/dashboard/work-items/[id]`.
- The detail page provides bounded field editing, transitions, evidence add/remove, and chronological audit history.
- Conflict errors instruct the administrator to refresh. Illegal transitions and Ready Gate failures are explained without exposing internal SQL.
- On narrow screens, columns become a horizontally scrollable region and all controls remain reachable without dragging.

## Error handling

- Missing item: stable not-found page.
- Stale version: reject without mutation and ask for refresh.
- Ready Gate: reject without mutation and list the missing requirements.
- Illegal transition: reject without mutation.
- Dependency outage: render a bounded unavailable state; never print raw error text.
- Revalidation failure after a committed RPC is best-effort and does not misreport the mutation as failed.

## Verification

- Domain tests cover every allowed/forbidden transition, Ready Gate inputs, field limits, and URL validation.
- Migration contract tests verify constraints, exact grants, RLS, admin checks, row locks, expected-version checks, atomic event writes, evidence soft removal, and append-only protection.
- Repository/action tests cover reads, mutations, stable error mapping, authorization-first behavior, and revalidation.
- Component/page tests cover Board columns, accessible move controls, drag fallback, detail forms, evidence, history, empty/error states, and admin redirect.
- A disposable local Supabase Gate proves live authorization, transitions, Ready Gate, conflicts, audit/event immutability, evidence lifecycle, and direct-write denial.
- Final Gate runs the full tests, lint, typecheck, production build, diff/privacy checks, and regressions for System Observatory and Delivery Governance.

## Local release Gate

Passed on 2026-07-23 from production base
`417501e234ac7e0325d34b0539f8d15857aaa44c`:

- 72 test files / 365 tests, lint, typecheck, and production build passed.
- A clean disposable migration reset passed through
  `20260723000100_work_tracker_core.sql`.
- The live database verifier passed 32 checks, including invalid evidence URL
  rejection, exact grants/RLS, Ready Gate, state graph, concurrency, rollback,
  evidence soft removal, append-only events, immutability, and retention.
- The disposable stack and loopback listeners were removed after validation.
- Production migration, shared-main push, deployment, and retained production
  mutation remain explicit owner-authorized release actions.
