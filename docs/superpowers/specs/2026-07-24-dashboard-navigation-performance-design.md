# Dashboard Navigation Performance Design

## Goal

Make navigation among `/dashboard`, `/dashboard/projects`, and
`/dashboard/skills` feel immediate while preserving administrator-only access,
the current 15-minute Observatory refresh cadence, and the complete validated
Snapshot as the audit source.

## Evidence

The current implementation performs the following work on every route change:

1. authenticate the user and query the administrator profile;
2. download the latest full Observatory Snapshot;
3. validate the full Snapshot with Zod;
4. derive the route-specific view;
5. hydrate large client components.

The production Snapshot response is approximately 1.53 MB. Projects needs only
about 23–33 KB of the validated data, while Skills currently sends about 540 KB
of derived entries. Diagnostic renders produced approximately 52,473 DOM nodes
on Dashboard, 8,692 on Skills, and 1,606 on Projects.

## Considered Approaches

### A. Loading state and forced route prefetch only

This gives faster visual feedback but preserves the full database read,
validation, serialization, and render cost. Forced prefetch would also download
large dynamic routes before the user requests them.

### B. New database tables for every route projection

This provides the smallest possible reads but expands the collector, publisher,
retention, migration, and recovery surface. It is appropriate if Dashboard data
continues growing, but it is unnecessary for the first repair.

### C. Cached validated Snapshot plus route-local projection and progressive rendering

This reuses the existing Snapshot contract, removes repeated database and Zod
work during navigation, preserves existing refresh semantics, and directly
reduces the observed DOM explosion. This is the selected approach.

## Architecture

### Shared authorization layout

`app/dashboard/layout.tsx` is the single authorization boundary for all
Dashboard routes. It calls `getCurrentObservatoryAdmin()` before rendering any
child route. Direct unauthenticated requests preserve the requested Dashboard
path through a request header set by `proxy.ts`.

The layout also renders stable Dashboard, Projects, and Skills navigation.
Because App Router layouts persist across client navigation, the authenticated
shell does not repeat its profile lookup on each sibling route transition.

Existing mutation endpoints and server actions keep their own authorization
checks. The shared layout only replaces duplicate page-level read checks.

### Cached validated Snapshot

`loadObservatoryOverviewState()` reads through a server-only cached function.
The cached fill:

1. creates a Supabase admin client;
2. reads the latest successful Snapshot;
3. validates it with the existing
   `ObservatoryCollectionEnvelopeSchema`;
4. returns only the validated state or a safe error state.

The cache revalidates every 60 seconds. This is shorter than the 15-minute
collector interval, so new successful Snapshots remain visible within the
existing freshness contract while route changes within the window avoid another
1.5 MB database read and validation pass. Authentication occurs before the
cached value is rendered; request cookies are never read inside the cache.

### Progressive client rendering

The initial HTML and hydrated DOM use bounded result windows:

- System Inventory renders 40 matching assets initially and adds 40 per
  “Show more” action.
- System Topology keeps the 20-edge SVG limit and renders 40 semantic
  relationships initially, adding 40 per action.
- Skills renders the 132 summary cards but mounts Agent-instance rows only when
  the corresponding disclosure is opened.

Search and filters continue to operate across all in-memory validated records.
Changing a query or filter resets the visible window so the first matching
results are immediately visible.

### Transition feedback

`app/dashboard/loading.tsx` provides a lightweight accessible skeleton while a
dynamic sibling route is resolving. It improves perceived responsiveness
without hiding actual server work.

## Error Handling

- Missing or invalid auth redirects before Snapshot data is rendered.
- Auth dependency failures continue to use the existing safe error behavior.
- Missing, invalid, or unreadable Snapshots continue to return the existing
  empty/error states without exposing database details.
- Cache failures are not persisted as partial data; the loader returns the same
  safe error state as the current implementation.
- “Show more” controls are absent when all matching records are visible.

## Testing

Regression tests must prove:

1. the shared layout redirects anonymous users before rendering children and
   preserves the exact Dashboard return path;
2. child pages no longer call administrator auth independently;
3. the Snapshot loader uses a cookie-free admin client and is wrapped in a
   60-second server cache;
4. Inventory and Topology initially render bounded rows and reveal the
   remainder on demand;
5. Skill instance rows are absent from the DOM until their disclosure opens;
6. existing search, filter, sorting, empty, and safe-error behavior remains;
7. production build, lint, typecheck, and the complete test suite pass.

## Performance Acceptance

- A warm sibling route transition must not trigger another full Snapshot read
  inside the 60-second cache window.
- Dashboard initial DOM must remain below 5,000 nodes for the current production
  Snapshot.
- Skills initial DOM must remain below 3,000 nodes for the current production
  Snapshot.
- Projects remains below 2,000 nodes.
- A route transition must expose an accessible loading state immediately.
- All Dashboard routes remain administrator-only.

## Deferred Work

Dedicated database projections (`dashboard_summary`, `project_directory`,
`skill_directory_summary`, and per-Skill instances) remain the next scaling step
if the validated Snapshot grows enough that cached in-process projection is no
longer sufficient. They are intentionally excluded from this release.
