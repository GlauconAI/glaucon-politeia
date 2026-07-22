# Dashboard External Rename Design

## Goal

Rename the user-facing and actively maintained project identity from **OpenClaw Observatory** to **Dashboard** without migrating production data or destabilizing the existing M1A release.

## Decision

`Dashboard` is the canonical product and project name from this change forward.

- The canonical production route becomes `/dashboard`.
- `/observatory` remains as a compatibility route that redirects to `/dashboard`.
- User-visible names, messages, route labels, current project records, and future planning use `Dashboard`.
- Existing internal identifiers may keep `observatory` where changing them has no user-facing value or would create migration risk.

## Approaches Considered

### 1. External rename with internal compatibility — selected

Rename the public surface and active documentation while preserving production database objects, historical migrations, and other internal compatibility identifiers.

This gives the user one memorable name and one canonical URL without risking the released data model.

### 2. Display-name-only rename — rejected

Changing only headings would leave `/observatory`, project folders, active docs, and operational commands exposed. The product would continue to have two competing names.

### 3. Full physical rename — rejected

Renaming tables, RPCs, error codes, migrations, and every internal symbol would require a production database migration and a wider rollback plan. It adds risk without improving the user experience.

## Product Surface

### Canonical route

`/dashboard` is the dynamic, admin-only page. Its authorization behavior remains unchanged:

- an authenticated administrator sees the Dashboard;
- anonymous and non-admin users are sent to `/auth?redirectTo=/dashboard`;
- authentication dependency failures continue to fail closed.

### Legacy route

`/observatory` performs a permanent application redirect to `/dashboard`. It does not render a second copy of the page and does not preserve `redirectTo=/observatory` as a competing canonical destination.

### User-visible copy

The page title, access labels, operational error messages, route breadcrumbs, accessibility labels, and any current navigation references use `Dashboard`. Existing content terms such as “System summary,” “Quick Capture,” and “Work Tracker” remain unchanged.

## Code Boundary

Only the external product boundary is renamed. The canonical `app/dashboard` route is added, while existing internal implementation names remain `observatory` unless a change is required to make `/dashboard` canonical. Preserved internal identifiers include:

- TypeScript types, functions, components, import aliases, CSS classes, test filenames, and script directories;
- existing `observatory:*` npm commands and `.observatory/` generated artifacts;
- `observatory_snapshots`, `observatory_work_items`, and `observatory_work_item_events`;
- existing RPC, trigger, policy, and error-code names;
- the applied M1A migration filename and contents;
- snapshot schema versions and persisted payloads;
- historical Git commits and immutable release evidence.

No production database migration is required for this rename.

## Documentation and Project Records

Actively maintained records use `Dashboard` and live under a `dashboard` project directory. References inside the current README, design, source contract, EDAD tracker, estimate calibration, runbook, agenda, and runtime state are updated.

Historical evidence is not rewritten when its exact old identifier is necessary to verify an already shipped artifact, migration, commit, route, or release. Such references are labelled as legacy Observatory identifiers where context is needed.

The unused public `GlauconAI/openclaw-observatory` repository is not the implementation repository and remains outside this rename. Renaming it to Dashboard would incorrectly imply that it contains the live product. The live implementation continues in `GlauconAI/glaucon-politeia`.

## Testing

The rename is complete only when automated tests demonstrate:

1. `/dashboard` renders for an administrator.
2. `/dashboard` redirects anonymous and non-admin users to `/auth?redirectTo=/dashboard`.
3. `/observatory` redirects to `/dashboard`.
4. Quick Capture revalidates `/dashboard` and retains existing database behavior.
5. User-visible rendered text and operational errors say `Dashboard`.
6. Existing snapshot parsing, RLS-facing repository behavior, and production auth configuration remain unchanged.

The full test suite, lint, typecheck, production build, and Git diff check must pass before release.

## Release and Verification

The code change is committed on an isolated branch, merged into `main`, pushed to `GlauconAI/glaucon-politeia`, and deployed through the existing Vercel production project.

Production smoke checks verify:

- `/dashboard` has the expected anonymous redirect;
- `/observatory` redirects to `/dashboard`;
- the administrator can render `/dashboard` and submit one idempotent Quick Capture without duplicating retained release evidence;
- no Supabase migration, Cron change, or Gateway change occurred.

## Success Criteria

- The user and Plato refer to the project as `Dashboard` from now on.
- `https://402v.com/dashboard` is the canonical page.
- Old Observatory links continue to work through redirect compatibility.
- No user-facing active surface presents Observatory as the current project name.
- Production data and audit history remain intact.
