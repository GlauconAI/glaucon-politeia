# 402v Cosmos / Are.na Redesign V2 Spec

## Decision

The selected visual direction is `Cosmos + Are.na`: a personal knowledge universe, inspiration archive, and private/public publishing surface.

## Product Feeling

402v should feel like a curated personal archive rather than:

- a SaaS dashboard,
- a company landing page,
- a developer tool console,
- or a generic blog.

The interface should make learning notes, HTML artifacts, family pages, fragments, and product ideas feel like collections placed into one personal knowledge universe.

## V2 Scope

- Replace the V1 three-column workbench shell with a lightweight top navigation shell.
- Use `402v` as the primary brand.
- Use this tagline: `Notes, sites, fragments, and family archives.`
- Reframe `Spaces` as `Collections`.
- Reframe `Latest publishing` as `Recently placed`.
- Show content as board-like archive cards instead of a feed list.
- Make post detail pages feel more like publication pages, with restrained metadata and less dashboard framing.
- Preserve existing auth, editor, search, tags, publishing CLI, Supabase schema, and RLS behavior.

## Visual Rules

- Prefer white / off-white backgrounds, black text, muted gray labels, and thin borders.
- Avoid large blue SaaS buttons as the main visual motif.
- Avoid the three-column product-dashboard layout on the public site.
- Use collection tiles with variable proportions but stable responsive behavior.
- Preserve dark mode support through existing theme variables.

## Acceptance Criteria

- The global shell has a top-level collection nav: `Learn`, `Sites`, `Fragments`, `Family`, `Products`, `Archive`.
- The homepage renders `402v`, the chosen tagline, `Collections`, and `Recently placed`.
- Recently published posts render as archive cards with content format, visibility, and collection metadata.
- Post detail pages retain comments, likes, bookmarks, tags, and HTML sandbox rendering.
- Test, lint, typecheck, build, screenshot smoke, and production smoke pass before completion.

