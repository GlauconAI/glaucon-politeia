# 402v Calm Personal OS Redesign Spec

## Goal

Redesign the public 402v.com surface into a modern, quiet personal publishing system that can hold learning notes, essays, HTML sites, family pages, project logs, and future product pages without feeling like a generic blog.

## Product Direction

The first version uses a Calm Personal OS model:

- Arc-like spaces for information architecture.
- Linear-like navigation density and operational clarity.
- Vercel Geist-like restrained visual language.
- Editorial reading quality for public posts and essays.

The site brand should move from the current mixed `Vibe Academy / Glaucon Politeia` presentation to `402v` as the primary shell identity. Vibe Academy remains a content area and historical concept, not the whole site brand.

## First-Version Scope

- Replace the current generic homepage hero with a `402v` publishing-system intro.
- Add visible spaces: `Learn`, `Notes`, `Sites`, `Family`, `Products`, and `Archive`.
- Keep existing routes working; spaces may initially link to existing tag/search routes where no dedicated route exists yet.
- Make latest posts feel like a publishing feed, not a starter-blog list.
- Keep editor, auth, search, profile, TODO, lab, and prompt admin reachable.
- Keep HTML artifact reading through the existing sandbox route.
- Do not introduce new database columns in this UI pass.
- Do not change Supabase RLS or publishing CLI behavior in this UI pass.

## Interaction Model

Anonymous users should immediately understand:

- `402v` is a personal publishing system.
- Content is grouped by spaces rather than only by tags.
- Published HTML sites are a first-class content type.
- Family and product areas exist but can grow gradually.

Authenticated users should still have fast access to:

- Writing/editor flow.
- Profile.
- Admin prompt tools.
- Existing operational pages.

## Visual System

- Use neutral backgrounds, thin borders, strong typography, and restrained accent colors.
- Avoid decorative gradients, hero illustrations, and oversized marketing-page composition.
- Prefer compact panels, rows, pills, and stable grids.
- Keep cards at small radii and avoid nested card-heavy layout.
- Preserve dark/light theme support.

## Acceptance Criteria

- Homepage presents `402v` as the top-level brand.
- Global navigation includes the new space labels.
- Homepage includes a spaces overview and latest publishing feed.
- Existing published posts remain visible and clickable.
- App shell still renders banner, primary navigation, main content, and right rail landmarks.
- Tests, lint, typecheck, and production build pass.

