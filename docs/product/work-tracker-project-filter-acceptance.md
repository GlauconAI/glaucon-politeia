# Work Tracker Canonical Project Filter Acceptance

Date: 2026-08-25
Status: Local implementation accepted; production release pending explicit authorization
Branch: `feat/work-tracker-project-filter`
Base: `96c5419d31ea6aff55f505f899230fd3d5f70949`

## Accepted scope

- `/work-tracker` opens on the all-Project board and supports a searchable canonical Project filter.
- The selected Project is stored in `?project=<canonical-key>`; clearing the filter restores the canonical route.
- Every Item card displays a prominent Project badge, with Milestone and Project Control binding shown separately.
- Quick Capture requires a canonical Project and preserves the selected Project after a successful capture.
- Work Item detail uses the same canonical Project selector. Legacy exact-title values such as `Dashboard` resolve to `plato/dashboard` and are normalized on the next save.
- Server actions reject missing, stale, or unknown Project keys before repository mutation.
- The create RPC accepts `p_project_ref`, stores and audits the Project, includes it in idempotency comparison, and rejects a missing Project at the database boundary.
- Existing nine-state workflow, Ready Gate, Evidence, audit history, optimistic concurrency, Project Control authority, and bounded Agent Claim behavior are unchanged.

## Canonical Project inventory and current Items

- The validated Projects Directory supplies 64 selectable Projects.
- Current production-backed read-only data contains 8 Work Items.
- All 8 current Items resolve to the canonical `Dashboard` Project; there are no `No project` Items.
- All 8 current titles, descriptions, and acceptance criteria are Chinese-first, while appropriate terms such as React, Project Control, API, paths, and hashes remain in English.

## Automated verification

- Focused Work Tracker regression: 12 files / 136 tests passed.
- Stable complete suite: 121 files / 818 tests passed, 0 failed.
- ESLint: exit code 0.
- TypeScript: exit code 0.
- `git diff --check origin/main...HEAD`: no output.
- Next.js 16.2.6 production build: exit code 0, 28/28 static pages generated. The build emitted `/work-tracker`, `/work-tracker/items/[id]`, and the compatibility `/dashboard/work-items/[id]` route.
- The first sandboxed build attempt could not bind Turbopack's temporary port because of host sandbox policy. The identical build command passed outside that restriction; this was an execution-environment limitation, not an application failure.

## Authenticated browser acceptance

The release build was served locally and opened with the dedicated authenticated `402v-admin` profile. The browser session was closed after acceptance so the profile is not left locked.

Desktop, 1280px wide:

- Default route showed all 8 Items, `All Projects`, 64 canonical options, 8 `Project: Dashboard` badges, and a required empty Quick Capture Project choice.
- Searching for `问芽` reduced the filter choices to `All Projects` and `问芽 AI`.
- Selecting `问芽 AI` changed the URL to `?project=shared%2Fwenya-ai` and showed 0 matching Items; resetting to all Projects restored the canonical URL and all 8 badges.
- Opening an existing Item showed a required `projectRef` select with canonical value `plato/dashboard`; there was no editable free-text Project reference.
- The detail page had no page-level horizontal overflow at 1280px.

Mobile, 390×844:

- The all-Project default, canonical filter, required Quick Capture Project, and all 8 Project badges remained present.
- No runtime or console error was observed during the desktop or mobile flow.
- The board still has the previously recorded page-level horizontal overflow (`scrollWidth` 1889 at a 390px viewport; 1919 at a 1280px viewport). This predates and is independent of the Project filter. It remains tracked as the existing High / Triage responsive-container Bug; this change introduces no new overflow class.

The browser flow was intentionally read-only because the local release build used production-backed data and the five-argument create RPC migration has not been applied. Exact-one create, retained Project selection, idempotency, stale Project rejection, and database-required Project behavior are covered by the automated action, repository, component, and migration tests. A real create-and-cleanup smoke test belongs to production acceptance after the migration is explicitly authorized and applied.

## Release and rollback boundary

- No push to canonical `main`, Supabase migration, or 402v deployment has been performed for this change.
- Release order is: apply `20260826000100_work_tracker_project_capture.sql`, fast-forward the approved branch head to canonical `main`, deploy 402v, then run authenticated desktop/mobile production acceptance including one real Quick Capture create-and-cleanup cycle.
- Application rollback must be coordinated with the RPC signature. Rolling the application back to the four-argument caller requires restoring the previous RPC signature; reverting only one side would break Quick Capture.
- The canonical Agent handbook still describes the current production behavior. It must be updated only after the production release succeeds, so Agents never receive unreleased operating instructions.
