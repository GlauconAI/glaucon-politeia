# Glaucon Politeia

This repository is currently in the profiles stage for rebuilding a personal website previously specified as `Vibe Academy`.

The intended product is a robust, extensible personal publishing site for AI coding notes and project retrospectives. The core application will be a dynamic Next.js + Supabase product rather than a static blog: users, profiles, posts, tags, comments, likes, bookmarks, search, and authorization are part of the first product loop. Optional modules such as a local TODO tool, Prompt capture/admin, and a 3D navigation lab are planned as later milestones.

## Current State

- A minimal Next.js App Router baseline has been scaffolded.
- Supabase browser, server, and admin client helpers are present.
- Supabase configuration uses the current publishable and secret API key names.
- Vitest, Testing Library, ESLint, TypeScript, and Tailwind are configured.
- P0 Supabase schema, RLS policies, seed tags, and deterministic slug/excerpt/username helpers are being developed on the M1 branch.
- The M2 branch adds the dev.to-style app shell, persisted theme control, auth page, OAuth callback, and logout flow.
- The M3 branch adds profile auto-creation, `/profile/me`, public profile pages, owner editing, and avatar upload support.
- The previous Trae-era implementation notes have been archived under `docs/raw/`.
- The active project documentation has been split into focused documents under `docs/project/`, `docs/milestones/`, and `docs/adr/`.
- The implementation path is to build the product in milestone-sized vertical slices from this thin foundation.

## Documentation Map

### Raw Source Material

- `docs/raw/CODEX_IMPLEMENTATION_SPEC.md`
  - Original full Trae-era product and implementation notes.
  - Preserved for historical reference, not the primary implementation source.

- `docs/raw/PROJECT_START_STRATEGY.md`
  - Original rebuild strategy and phased recommendation.
  - Preserved for traceability.

### Active Project Documents

- `docs/project/00-document-index.md`
  - Entry point for the documentation set.
  - Explains how the active documents relate to the archived raw materials.

- `docs/project/01-product-brief.md`
  - Product goal, audience, release priorities, explicit non-goals, and success criteria.

- `docs/project/02-requirements.md`
  - Functional and non-functional requirements grouped by subsystem.

- `docs/project/03-architecture.md`
  - Recommended app architecture, module boundaries, rendering strategy, and extensibility rules.

- `docs/project/04-data-permissions.md`
  - Supabase table responsibilities, RLS expectations, storage rules, seed data, and migration rules.

- `docs/project/05-api-contracts.md`
  - API route contracts, validation expectations, responses, errors, and authorization rules.

- `docs/project/06-ux-content-system.md`
  - Layout, navigation, theme, editor, post, profile, TODO, Prompt Admin, and 3D Lab UX expectations.

- `docs/project/07-quality-test-strategy.md`
  - Unit, component, API, integration, RLS, security, performance, and milestone verification strategy.

- `docs/project/08-legacy-analysis.md`
  - Analysis of the original Trae materials, extracted subsystem boundaries, known risks, and rebuild decisions.

### Milestones

- `docs/milestones/roadmap.md`
  - End-to-end milestone roadmap with deliverables, acceptance criteria, dependencies, and recommended first release scope.

### Architecture Decisions

- `docs/adr/0001-project-starting-point.md`
  - Decision record for using a thin Next.js + Supabase foundation instead of a static blog template or large SaaS starter.

## Recommended First Release

The first complete release should cover Milestones 0 through 6:

1. Project baseline.
2. Data model, RLS, and seeds.
3. Application shell, theme, and auth.
4. Profiles.
5. Posts, tags, search, and Markdown.
6. Community interactions.
7. P0 hardening and launch prep.

After that, the local TODO tool, Prompt Capture/Admin, and 3D Lab can be implemented as independent milestones.
