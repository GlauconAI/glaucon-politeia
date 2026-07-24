# Dashboard Navigation Index Design

## Goal

Make the protected 402v Dashboard faster to scan and navigate without changing
its data authority, permissions, or visual language.

## Approved scope

The user approved this design and authorized direct production release on
2026-07-24:

1. Turn every system summary card into a meaningful index link.
2. Add a unique Skills summary card.
3. Add a sticky section navigation bar that follows the reader, highlights the
   current Dashboard section, and scrolls to a section when selected.
4. Add `/dashboard/projects` and `/dashboard/skills` as protected, read-only
   directory pages.
5. Provide search, filters, sorting, and URL-persisted filter state on both
   directory pages.
6. Keep the Dashboard homepage as the operational overview; the new pages are
   dense directories rather than alternate dashboards.

## Information architecture

### Summary-card index

Each existing summary card becomes a link:

- Projects → `/dashboard/projects`
- Skills → `/dashboard/skills`
- Primary scenes, secondary scenes, execution flows, and agents → Core objects
- Bindings → System topology
- Active and failed tasks → Work Tracker
- Source repos → Source repositories
- Gateway → Snapshot source

The link destination is visible through hover/focus treatment and an arrow
indicator. Cards remain valid definition-list content.

### Sticky section navigation

The Dashboard renders a horizontally scrollable, sticky navigation strip below
the hero. It contains only sections available in the current validated
snapshot. The active label updates through `IntersectionObserver`; clicking a
label uses a normal fragment URL and smooth scrolling. The sticky offset tracks
the actual site-header height so desktop and mobile layouts do not overlap.

Sections are stable URL anchors:

`snapshot`, `index`, `sources`, `repositories`, `inventory`, `topology`,
`objects`, `projects`, `roadmap`, `analytics`, `review`, `capture`, and `work`.

### Projects directory

The Projects page flattens canonical registry project groups and enriches exact
project-key matches with repository names and latest commit time. It supports:

- search across name, key, owner, status, description, scenes, and repositories;
- owner, status, scene, and linked-repository filters;
- recent activity, name, owner, and status sorting;
- URL parameters `q`, `owner`, `status`, `scene`, `repository`, and `sort`.

No project detail editing is introduced.

### Skills directory

The Skills page groups Agent-exposed Skill assets by normalized Skill name. It
shows unique Skill count separately from Agent-Skill instance count and keeps
the underlying instances expandable. It supports:

- search across name, description, Agent, source, version, and health;
- shared/private, health, Agent, and source filters;
- name, Agent count, instance count, and health sorting;
- URL parameters `q`, `scope`, `health`, `agent`, `source`, and `sort`.

The collector retains safe Skill description and install-source metadata in
asset labels on future snapshots. Existing snapshots remain compatible and
fall back to their current summary/source fields.

## Security and data boundaries

- All three routes remain admin-only and force dynamic request-time loading.
- Directory pages use only the validated latest Observatory snapshot.
- No raw notes, local absolute paths, credentials, or private command output are
  introduced.
- Filters operate in the browser and only update the current URL.
- This release adds no write API and changes no Dashboard mutation permission.

## Failure states

Missing, invalid, or unavailable snapshots use the existing safe
`SourceStatus` states. Directory pages never render unvalidated JSON. Empty
directories and empty filter results are distinct.

## Verification

- Unit tests cover directory projection, deduplication, filtering, sorting, URL
  persistence, summary destinations, and sticky-nav active state.
- Existing Dashboard tests remain green.
- Full test, lint, typecheck, and production build gates must pass.
- Browser verification covers desktop and approximately 390 px mobile widths,
  card links, sticky navigation, section jumps, independent pages, and absence
  of horizontal page overflow.
- Production verification repeats the route and interaction checks after
  deployment.
