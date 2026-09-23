# Partitura Brand Migration Design

## Status

- Product: `Partitura — System Dashboard`
- Parent brand: `Sinfonia — Multi-Agent System`
- Owner: Plato
- Decision owner: Glaucon
- Scope: visible brand layer only
- Canonical brand source: `plato-academy/projects/openclaw-orchestrator/sinfonia-brand-foundation-v1.md`

## Goal

Make Partitura the clear user-facing name of the existing System Dashboard while preserving every technical integration and authority boundary underneath it.

The migration should let a user understand two facts immediately:

1. **Partitura** is the product name.
2. **System Dashboard** is what the product does.

## Chosen approach

Use the existing Dashboard interface and visual system. Change only the visible brand lockup, browser metadata, navigation labels, loading copy, and return links that refer to the product itself.

Do not introduce a logo, new color system, splash page, route migration, data migration, or parallel Dashboard implementation. Partitura is a brand-layer migration, not a rebuild.

## Information architecture

### Product lockup

The canonical visible lockup is:

> **PARTITURA**
>
> System Dashboard
>
> *The score for a society of minds.*

The main `/dashboard` hero should render this hierarchy in the existing terminal-inspired visual language:

- keep `402v /dashboard` as the technical path eyebrow;
- change the primary heading from `Dashboard` to `Partitura`;
- add `System Dashboard` as the functional subtitle;
- add `The score for a society of minds.` as the brand slogan;
- keep the existing read-only access and authority status line unchanged.

### Sinfonia relationship

Partitura belongs to Sinfonia, but the first release should not add a second global site brand or redesign the 402v header. The relationship is established by the functional lockup and the canonical brand foundation, not by placing `Sinfonia` on every Dashboard surface.

This avoids turning the first migration into a full-site rebrand. A later Sinfonia shell may be designed only when Maestro, Concerto, and Contrappunto have comparable product surfaces.

### Navigation

- The authenticated global operator link changes from `Dashboard` to `Partitura` while keeping `href="/dashboard"`.
- The first item in the Dashboard route bar changes from `Dashboard` to `Partitura` while keeping `href="/dashboard"` and the current active-route behavior.
- Subpage links that return to the product root change from `Back to Dashboard` to `Back to Partitura`.
- Functional subpage labels remain direct: `Projects`, `Decisions`, `Skills`, and `Automations`.
- Technical path strings such as `402v /dashboard/automations` remain unchanged.

### Browser metadata

The `/dashboard` route family receives the title `Partitura — System Dashboard` and a concise description based on the approved slogan. This is presentation metadata only; routes and indexing behavior do not change.

## Naming boundary

The implementation must distinguish product-brand text from technical or data text.

### Rename

- product heading `Dashboard`;
- authenticated site-header link `Dashboard`;
- Dashboard route-bar product link `Dashboard`;
- `Back to Dashboard` return copy;
- user-facing loading copy for the product;
- accessibility labels that name the product-level navigation or access surface;
- route-family page metadata.

### Preserve

- `/dashboard` and all nested routes;
- source paths under `app/dashboard`, component names, exported symbols, CSS class names, and test filenames;
- project key `plato/dashboard`;
- repository, package, API, database, snapshot, Registry, Automation, and audit identifiers;
- data values or project records whose canonical title is `Dashboard`;
- phrases such as `Dashboard snapshot` when they refer to an established technical artifact rather than the product lockup;
- Work Tracker and Orchestrator branding, which migrate in later independent releases.

## Components

### 1. Product hero

Update the root Dashboard hero to express brand name, function, and slogan without changing the existing status line or overview content.

The subtitle and slogan should use existing typography and spacing where possible. A small focused CSS addition is acceptable if needed to keep the hierarchy readable on desktop and mobile; a new design system is out of scope.

### 2. Shared Dashboard shell

Update the route navigation, loading state, and route-family metadata so the product name remains consistent while moving among Dashboard pages.

### 3. Global authenticated header

Update only the visible label of the `/dashboard` operator link. Keep the route, authorization condition, and neighboring Orchestrator / Work Tracker links unchanged.

### 4. Subpage return links

Use `Partitura` when a link names the product root. Do not rename functional page headings or canonical data titles.

## Accessibility

- The main heading must have the accessible name `Partitura`.
- The functional subtitle and slogan must be ordinary readable text, not CSS-generated content.
- Product-level route navigation should be labelled `Partitura routes`.
- The read-only access status should be labelled `Partitura access`.
- Loading feedback should say `Loading Partitura data…` while retaining `role="status"`, `aria-busy="true"`, and live-region behavior.
- Color must not carry brand meaning by itself.

## Responsive behavior

The existing Dashboard breakpoints and route-nav horizontal scrolling behavior remain authoritative. The new lockup must fit at 390px without horizontal page overflow, clipped slogan text, or overlap with the access status line.

## Error and empty states

Snapshot validation, unavailable states, authentication redirects, and data-loading failures retain their current behavior and privacy boundaries. This migration changes their product-facing name only where the copy explicitly names the Dashboard product.

## Testing

Use test-driven updates for visible naming contracts:

1. Root page renders `Partitura`, `System Dashboard`, and the approved slogan.
2. Root page no longer uses `Dashboard` as its product heading.
3. Shared route navigation exposes `Partitura` at `/dashboard`.
4. Loading state announces `Loading Partitura data…`.
5. Authenticated global header links `Partitura` to `/dashboard`.
6. Directory pages return to `Partitura` without changing their routes.
7. Browser metadata uses `Partitura — System Dashboard`.
8. Existing read-only, privacy, authorization, snapshot validation, and navigation tests continue to pass.
9. Desktop and 390px browser acceptance show no overflow or console error.

## Release boundary

This is a normal Dashboard production release through the existing low-friction release process. It does not change OpenClaw runtime configuration, Gateway state, Automations, Orchestrator schemas, or the current P7 Usage Guardian Shadow Work.

The release is complete only after focused tests, the full `npm run release:verify` gate, independent review, production deployment, and production smoke against the exact released commit.

## Acceptance criteria

- Users see `Partitura — System Dashboard` as one clear product identity.
- The approved slogan appears on the root product surface.
- `/dashboard` and every existing integration continue to work unchanged.
- No internal identifier or historical record is renamed.
- No Maestro, Concerto, Contrappunto, Opus, or Baton terminology is introduced by this release.
- Product function and authority remain at least as clear as before the migration.
