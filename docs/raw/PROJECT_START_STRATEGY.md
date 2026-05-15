# Vibe Academy Project Start Strategy

This document records the recommended engineering approach for rebuilding Vibe Academy from the existing product specification in `docs/CODEX_IMPLEMENTATION_SPEC.md`.

## Decision

Build Vibe Academy from a thin Next.js + Supabase starting point instead of continuing from the current static blog template or cloning a large third-party template.

Recommended starting command:

```bash
cd /Users/glaucon/Workspaces/codex_projects
npx create-next-app@latest -e with-supabase vibe-academy
```

Alternative fully manual start:

```bash
cd /Users/glaucon/Workspaces/codex_projects
npx create-next-app@latest vibe-academy
cd vibe-academy
npm install @supabase/supabase-js @supabase/ssr
```

The `with-supabase` route is preferred because it provides the minimum useful foundation: Next.js App Router, TypeScript, Tailwind, and Supabase SSR/auth wiring without adding unrelated SaaS product assumptions.

## Why Not Continue From This Blog Template

The current project is based on a static blog architecture:

- Blog posts are local MDX files processed by Contentlayer.
- Tags and search indexes are generated at build time.
- The home page reads `allBlogs` from generated Contentlayer data.
- The layout is a classic blog shell, not an application shell with authenticated user state.

Vibe Academy requires a dynamic community product architecture:

- Supabase-backed posts, tags, comments, likes, bookmarks, profiles, and prompts.
- Runtime authentication and authorization.
- Row Level Security policies.
- User-generated content publishing.
- Admin-only prompt management APIs.
- Client-side prompt capture and retry queue.

Keeping the static blog template would require replacing the core content model, routing assumptions, search flow, and layout system. That is not meaningfully cheaper than starting clean, and it increases the risk of carrying unused template complexity.

## Why Not Clone A Large Template

Large SaaS templates usually include features that do not match this product:

- Billing and Stripe integration.
- Teams, organizations, invitations, and subscription roles.
- Marketing pages and pricing flows.
- Opinionated dashboards unrelated to content publishing.

Those features create deletion and adaptation work. They also make it harder to keep the schema, RLS policies, and route structure aligned with `CODEX_IMPLEMENTATION_SPEC.md`.

For this project, a thin starter is better than a feature-rich starter.

## Template Options Considered

### Recommended: Official Supabase Next.js Starter

Repository/example:

- `vercel/next.js/examples/with-supabase`
- Created through `npx create-next-app@latest -e with-supabase`

Use this as the base if the priority is clean architecture and long-term maintainability.

Pros:

- Minimal.
- Official ecosystem path.
- Good fit for Supabase SSR auth.
- Low amount of unrelated code.

Cons:

- Most business features must be implemented from scratch.

### Acceptable Alternative: Razikus Supabase Next.js Template

Repository:

- `https://github.com/Razikus/supabase-nextjs-template`

Use this only if saving initial auth/profile/storage/RLS setup time matters more than keeping the project minimal.

Pros:

- Includes Supabase, authentication, user management, storage, RLS, themes, and demo app patterns.
- Closer to an app foundation than a static blog template.

Cons:

- May still contain product assumptions that need removal.
- Requires audit before adoption.

### Reference Only: w3labkr Next.js Supabase Blog

Repository:

- `https://github.com/w3labkr/nextjs14-supabase-blog`

Use only as a reference for ideas around Supabase auth, RBAC, editor, upload, and dashboard structure.

Reason:

- The repository is archived, so it should not be used as the main project base.

### Reference Only: ElectricCodeGuy SupabaseAuthWithSSR

Repository:

- `https://github.com/ElectricCodeGuy/SupabaseAuthWithSSR`

Use only as a reference if Prompt capture later expands into AI search, RAG, document search, or file workflows.

Reason:

- It is too heavy for the P0 content community product.

### Not Recommended: Generic SaaS Starters

Examples:

- `nextjs/saas-starter`
- Stripe-heavy Supabase SaaS starters

Reason:

- They optimize for SaaS billing and team dashboards, not a personal content community with prompt capture.

## Implementation Phases

### Phase 0: New Project Baseline

Create a new sibling project using the official Supabase starter. Copy `docs/CODEX_IMPLEMENTATION_SPEC.md` into the new project and treat it as the product source of truth.

Deliverables:

- Clean Next.js App Router project.
- Supabase SSR auth baseline.
- Tailwind configured.
- Environment variable template.
- Test framework selected and running.

### Phase 1: Data Model And Supabase Foundation

Implement the database schema, migrations, seed data, RLS policies, and Supabase clients.

Deliverables:

- `profiles`
- `posts`
- `tags`
- `post_tags`
- `comments`
- `post_reactions`
- `bookmarks`
- `prompts`
- `prompts_archive`
- RPC functions for prompt stats and retention
- Browser/server/admin Supabase client helpers

### Phase 2: Application Shell

Build the Vibe Academy layout before implementing content features.

Deliverables:

- Fixed top header.
- Desktop three-column layout.
- Mobile single-column layout.
- Left navigation.
- Right information panel.
- Theme switching.
- Search entry.
- User menu.

### Phase 3: Authentication And Profiles

Implement user access and identity flows.

Deliverables:

- `/auth`
- `/auth/callback`
- `/profile/me`
- `/profile/[username]`
- Profile auto-creation.
- Profile editing.
- Avatar upload.

### Phase 4: Dynamic Content System

Implement the core publishing loop.

Deliverables:

- Home article feed.
- Article cards.
- `/editor`
- Draft and publish flows.
- Slug generation.
- Excerpt generation.
- `/posts/[slug]`
- Markdown rendering.
- `/tags/[tag]`
- `/search`

### Phase 5: Community Interactions

Complete the content community loop.

Deliverables:

- Likes.
- Bookmarks.
- Comment list.
- Nested replies.
- Comment creation.
- Comment deletion by author.
- Login redirects for protected interactions.

### Phase 6: Local TODO Tool

Implement the self-contained TODO sample app.

Deliverables:

- `/todos`
- Local storage model.
- Create, edit, complete, delete.
- Filtering.
- Sorting.
- JSON export.
- CSV export.

### Phase 7: Prompt Capture

Add global prompt capture after the main app behavior is stable.

Deliverables:

- `PromptCaptureProvider`.
- Capture rules for submit/click/keydown.
- Sensitive form filtering.
- Client session ID.
- Idempotency key.
- Retry queue.
- `POST /api/prompts`.
- Sensitive content detection.

### Phase 8: Prompt Admin

Build the admin backend and UI.

Deliverables:

- `/admin/prompts`.
- Admin access checks.
- `GET /api/prompts`.
- `POST /api/prompts/bulk`.
- `GET /api/prompts/export`.
- `GET /api/prompts/stats`.
- `POST /api/prompts/retention`.
- Filtering, pagination, CSV export, stats, mark, unmark, soft delete.

### Phase 9: 3D Lab

Add the interactive experiment after the primary app is complete.

Deliverables:

- `/lab/world`.
- Three.js canvas.
- Card world navigation.
- Scroll, hover, click, and keyboard interactions.
- Suspense fallback.
- Mobile performance guardrails.

### Phase 10: Hardening And Launch

Polish behavior, verify permissions, and prepare deployment.

Deliverables:

- Empty and error states.
- Mobile QA.
- SEO metadata.
- RLS verification.
- Prompt security checks.
- Build and test verification.
- Deployment environment checklist.

## Recommended Scope Boundary

The first shippable milestone should be Phase 0 through Phase 5 only.

That produces the core Vibe Academy product:

- Users can sign up and log in.
- Users can maintain profiles.
- Users can publish posts.
- Visitors can read posts by feed, tag, search, and detail page.
- Logged-in users can comment, like, and bookmark.

TODO, Prompt Admin, and 3D Lab should follow as separate milestones because they are independent subsystems.

## Final Recommendation

Use a clean Supabase-enabled Next.js starter, not this static blog template and not a large SaaS template.

The right base is intentionally small. The product complexity belongs in Vibe Academy's own schema, RLS, routes, and components, not in inherited template assumptions.
