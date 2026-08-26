# Work Tracker Canonical Project Filter Design

**Status:** Implemented and locally accepted on 2026-08-25; production release pending explicit authorization
**Owner:** Plato
**Target:** 402v admin-only `/work-tracker`

## Problem

Work Tracker currently renders every Item on one nine-state board. Each card shows a small free-text `Project · Milestone` line, Quick Capture has no Project field, and Item detail accepts arbitrary Project text. The canonical Project registry already contains 64 Projects, but Work Tracker does not use it as the selection authority.

## Approved outcome

Keep the default all-Project board and add Project-aware navigation:

1. `/work-tracker` defaults to all Items.
2. A searchable canonical Project filter limits the board without changing workflow state.
3. Every card shows a prominent Project badge and a separate Milestone label.
4. Quick Capture requires a Project selected from the canonical registry.
5. Item detail replaces free-text Project entry with the same canonical selector.
6. Project selection is validated again on the server; untrusted or stale keys are rejected.
7. Existing nine states, Ready Gate, Evidence, audit history, optimistic concurrency, Project Control binding, and Agent Claim behavior remain unchanged.

## Authority and data model

- Canonical Project choices come only from the validated Observatory registry snapshot used by the existing Projects Directory.
- `observatory_work_items.project_ref` stores the selected canonical Project key for new and edited Items.
- No new Project table or duplicate registry is introduced.
- Existing human-readable values such as `Dashboard` remain readable through a compatibility resolver that matches a Project key or exact Project title. A subsequent edit stores the canonical key.
- Formal Project Control binding remains independent. When a binding exists, its `project_key` must agree with the selected `project_ref`; parent Stage and Gate remain Orchestrator-owned.

## UI design

### Shared Project picker

A reusable client component provides:

- a search input matching Project title, key, owner, and status;
- a native `<select>` for keyboard and screen-reader compatibility;
- an optional `All Projects` choice for board filtering;
- a required empty choice for create/edit forms;
- preservation of the current selection while the search query changes;
- an explicit unavailable state when no canonical Project data can be loaded.

### Board

- The filter sits above the nine status columns.
- Default selection is `All Projects`.
- Selecting a Project updates `?project=<canonical-key>` with `history.replaceState`, enabling refresh/share without navigation churn.
- Column counts and the total count reflect the filtered Item set.
- Every card shows `Project: <title>` as a high-contrast badge. Milestone and formal binding detail remain secondary metadata.
- Legacy or invalid data is shown as `未归属` or `Legacy: <value>` and never silently assigned.

### Quick Capture

- Project is required before submission.
- The selector submits the canonical key as `projectRef`.
- Successful capture resets Type, Title, and Description but retains the chosen Project for low-friction batch entry.
- If the registry is unavailable, capture is disabled with a bounded explanation.

### Item detail

- The free-text Project input is replaced by the shared required selector.
- The current canonical or compatibility-resolved Project is selected.
- Choosing a formal Project Control binding synchronizes the Project selector to the binding Project.
- A mismatched Project reference and formal binding is rejected by schema validation.

## Server and database behavior

- Quick Capture validation requires a non-empty `projectRef`.
- Update validation requires a non-empty `projectRef`.
- Both server actions load the current validated registry and reject keys not present in it.
- The Quick Capture repository call passes `p_project_ref`.
- A Supabase migration replaces the four-argument create RPC with a five-argument version that normalizes, stores, audits, and includes Project in idempotency comparison.
- Existing rows and the update RPC schema remain intact.

## Failure handling

- Registry empty/error: board still renders existing Items and legacy labels, but create/edit Project mutation is unavailable.
- Unknown `?project=`: fall back to `All Projects` without hiding data.
- Version conflict: existing refresh-and-retry behavior remains unchanged.
- Unknown submitted Project key: return a field-level Project error; do not call the mutation RPC.

## Testing and acceptance

- Pure tests cover canonical option building, compatibility resolution, filtering, and unknown references.
- Component tests cover searchable selection, all-Project default, URL updates, card badges, required Quick Capture selection, and detail binding synchronization.
- Action tests prove unknown Project keys are rejected before mutation.
- Repository and SQL migration tests prove `p_project_ref` reaches the audited create RPC and idempotency contract.
- Existing Work Tracker workflow, Ready Gate, Project Control, Agent Claim, route, lint, typecheck, full tests, production build, and desktop/mobile browser gates must remain green.

## Out of scope

- Grouping every status column by Project.
- A separate Project-first landing page.
- Changing Project registry authority or Project Control semantics.
- Automatically creating Projects from Work Tracker.
- Language enforcement that blocks reasonable English technical terms.
