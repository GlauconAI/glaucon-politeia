# Legacy Materials Analysis

## Input Summary

The previous Trae materials contain two kinds of information:

- A full product specification in `docs/raw/CODEX_IMPLEMENTATION_SPEC.md`.
- A rebuild strategy in `docs/raw/PROJECT_START_STRATEGY.md`.

Together they describe a dynamic personal publishing product previously called `Vibe Academy`. The product combines a dev.to-like article experience, authenticated community interactions, user profiles, a local TODO tool, automatic Prompt capture, an admin Prompt dashboard, and a Bruno Simon-inspired 3D navigation experiment.

## Main Finding

The legacy specification is valuable, but it mixes product requirements, implementation details, database schema, API contracts, UI behavior, testing notes, and milestone ideas into one long document. That makes it hard to use safely as an implementation source because independent subsystems can accidentally become coupled.

The new documentation set splits the legacy material by engineering concern:

- Product intent.
- Functional requirements.
- Architecture.
- Data and permissions.
- API contracts.
- UX behavior.
- Quality and testing.
- Milestones.
- Architecture decision record.

## Product Boundary

The core product is not a static blog. It requires runtime user state and database-backed user-generated content:

- Users.
- Profiles.
- Posts.
- Tags.
- Comments.
- Reactions.
- Bookmarks.
- Admin-only Prompt workflows.

This means the project should not be rebuilt on top of a static MDX/contentlayer-style blog architecture. That architecture optimizes for build-time content, while this product needs runtime auth, RLS, mutations, private user state, and admin APIs.

## Recommended Starting Point

The legacy start strategy correctly recommends a thin Next.js + Supabase base. This analysis preserves that decision in `docs/adr/0001-project-starting-point.md`.

Reasons:

- The product complexity belongs in project-owned schema and modules.
- A large SaaS template would add billing, teams, organizations, subscriptions, and unrelated dashboard concepts.
- A static blog template would require replacing the content model, search assumptions, routing assumptions, and layout behavior.

## Subsystem Decomposition

### Core Publishing Product

This is the first release candidate:

- Auth.
- Profiles.
- Posts.
- Tags.
- Search.
- Markdown rendering.
- Comments.
- Likes.
- Bookmarks.
- Responsive three-column content shell.

It should ship before optional systems.

### Local TODO Tool

The TODO page is independent because it uses browser localStorage and does not depend on Supabase. It can be implemented after P0 without affecting content or auth.

### Prompt Capture

Prompt capture is high-risk compared with ordinary content features because it touches privacy, local event listeners, anonymous inserts, retry queues, sensitive content detection, idempotency, admin access, export, and retention. It should be isolated behind `lib/prompts`, Prompt API routes, and dedicated tests.

### Prompt Admin

Prompt Admin depends on Prompt capture data and admin authorization. It should follow capture, not ship before it.

### 3D Lab

The 3D Lab is visually important but technically optional. It should be isolated to `/lab/world` so Three.js code is not loaded into ordinary content pages.

## Key Risks Found

### Privacy Risk: Bookmark Visibility

The legacy document notes that bookmarks were previously publicly selectable. The rebuild should treat bookmark rows as private and expose only aggregate counts publicly.

### Search Risk: Supabase `.or()` Escaping

The legacy document calls out that special characters can break Supabase `.or()` query strings. Search helpers need tests and escaping/parameterization before UI integration.

### Profile Risk: Draft Leakage

The legacy profile behavior may show all author posts to visitors. The rebuild must show drafts only to the owner.

### Prompt Capture Risk: Sensitive Data

Prompt capture must exclude auth/password contexts and flag likely secrets. This is a release-blocking requirement for Prompt milestones.

### Admin Risk: Existence Leakage

Admin pages and APIs should not reveal sensitive resources to non-admins. Production non-admin access should return 404-style behavior where possible.

### 3D Risk: Bundle And Rendering

Three.js should not affect normal pages. The 3D route needs fallback rendering, mobile guardrails, and verification that the canvas is not blank.

## Requirements That Were Deferred

The following legacy gaps are intentionally not part of P0 unless reprioritized:

- Editing existing posts.
- Deleting posts from UI.
- Creating tags from the editor.
- Prompt capture and Prompt admin.
- 3D Lab.
- Advanced admin CMS functionality.

## Documentation Decisions

The new documents intentionally avoid turning the entire legacy spec into one giant implementation plan. Instead:

- `docs/project/*` defines product and engineering constraints.
- `docs/milestones/roadmap.md` defines sequence and acceptance criteria.
- A later implementation plan should be written per milestone, starting with Milestone 0.

This keeps implementation plans small enough to test, review, and execute safely.
