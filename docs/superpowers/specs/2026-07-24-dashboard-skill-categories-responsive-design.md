# Dashboard Skill Categories and Responsive Layout Design

## Goal

Make `/dashboard/skills` understandable without exposing OpenClaw's internal
source taxonomy, and make the protected Dashboard homepage usable at desktop,
tablet, and mobile widths.

The user approved the recommended design and authorized direct production
release on 2026-07-24.

## Scope

This release changes only:

1. the presentation and filtering of the existing Skills directory; and
2. responsive layout behavior on `/dashboard`.

It does not change the Skill collector, Supabase schema, Snapshot refresh
cadence, administrator authorization, write permissions, or public homepage.

## Skill category model

The existing validated Snapshot already contains enough effective source and
Agent-visibility data to derive four user-facing categories. No new collection
or database migration is required.

### Categories

1. **OpenClaw built-in**
   - The deduplicated Skill has an effective instance from
     `openclaw-bundled`.
2. **System Web Skill**
   - It has no bundled instance and has an effective instance from
     `agents-skills-personal`.
3. **Shared custom**
   - It has neither bundled nor personal-system instances, and its effective
     instances are visible to every Agent represented in the current Skills
     inventory.
4. **Agent-scoped custom**
   - It has neither bundled nor personal-system instances, and is visible to
     only one Agent or a subset of Agents.

This order is also the classification precedence. A built-in or System Web
Skill with an Agent-local effective override remains in its origin category and
receives an **Agent override** indicator. A custom Skill distributed through a
managed or extra root can still be Agent-scoped when only some Agents resolve
it.

Unknown future source labels are treated as custom. They become Shared custom
only when current effective visibility covers every represented Agent;
otherwise they default to Agent-scoped custom.

### Directory experience

The directory adds:

- four clickable category index cards with unique-Skill counts;
- a `Category` filter persisted in the `category` URL parameter;
- a category badge on every Skill card;
- an Agent-override badge where a built-in or System Web Skill also has a
  custom effective source;
- category names in search text.

The existing search, health, Agent, source, sorting, and expandable instance
controls remain. The raw `Source` filter and source values remain available as
advanced provenance rather than the primary classification.

The existing `Shared / Single Agent` scope filter is removed because the four
categories provide the requested visibility distinction without presenting two
competing scope models.

## Dashboard responsive behavior

### Root causes

The current narrow layout has three interacting defects:

1. At `960px` and below, Quick Capture is assigned `order: -1`, placing it
   before the operational overview and making primary content appear missing.
2. The route navigation and section navigation use independent sticky offsets.
   When both are stuck, they overlap.
3. The Dashboard shell and primary flex/grid children do not consistently
   permit min-content shrinkage, so wide descendants can force page-level
   overflow. A later mobile rule also returns summary cards to two columns at
   very narrow widths.

### Layout contract

- At widths above `960px`, keep the current overview-plus-capture two-column
  layout.
- At `960px` and below, use one column in DOM order: overview first, Quick
  Capture second.
- At tablet widths, summary cards use two columns.
- At `520px` and below, summary cards use one column.
- The Dashboard shell, page, overview, layout children, and directory
  containers use `min-width: 0` and `max-width: 100%` where appropriate.
- Wide tables, route labels, and section labels may scroll inside their own
  containers. The document itself must not scroll horizontally.

### Sticky navigation stack

The route navigation measures the current site-header height. The section
navigation measures both the site header and route navigation, then uses:

`site header height + route navigation height + gap`

as its sticky top offset. Both measurements update through `ResizeObserver`
with a window-resize fallback. Section anchors use the same combined stack
height for `scroll-margin-top`, so clicks never hide section headings beneath
either navigation bar.

If measurement APIs are unavailable, conservative CSS defaults keep the two
bars separated. Navigation remains usable without JavaScript because links are
ordinary route and fragment links.

## Data flow

1. The protected Skills page reads the existing validated Observatory
   Snapshot.
2. `buildSkillDirectory()` groups effective Skill instances by normalized
   name, derives the four-category field and override flag, and returns the
   existing safe metadata.
3. The client directory filters and sorts the derived entries and updates URL
   state without a server write.
4. Dashboard responsive changes operate only on already-rendered layout and do
   not alter Snapshot loading.

## Error handling and compatibility

- Invalid or unavailable Snapshots continue to use the existing `SourceStatus`
  safe state.
- Existing Skills URLs without `category` continue to show all categories.
- Obsolete `scope` URL parameters are ignored rather than producing an error.
- Empty categories show a zero count; selecting one produces the normal empty
  result state.
- Unknown source labels never fail rendering.
- Administrator checks remain on each protected page before Snapshot data is
  rendered.

## Testing and acceptance

Automated tests must prove:

1. each representative source/visibility combination maps to the correct one of
   four categories;
2. bundled and System Web Skills with custom overrides retain their origin
   category and show the override flag;
3. unknown source labels use the safe custom classification;
4. category cards and the category filter update results and preserve URL
   state;
5. existing search, Agent, source, health, sorting, and lazy instance rendering
   still work;
6. Dashboard CSS places Overview before Quick Capture at `960px` and below;
7. the sticky section offset includes the route navigation height;
8. responsive container and summary-card rules prevent page-level overflow.

Browser verification covers widths `390`, `520`, `720`, `900`, `1024`, and
`1440` pixels. At each width:

- document scroll width must not exceed viewport width;
- route and section navigations must not overlap when stuck;
- Overview, Quick Capture, and Work Tracker must remain reachable and visible;
- fragment navigation must expose the target heading;
- Skills category controls and cards must remain readable.

The full test suite, lint, typecheck, and production build must pass before
release. Production smoke checks confirm the three Dashboard routes remain
administrator-only and the public homepage is unaffected.
