# M0-M6 P0 Release Plan

## Purpose

This plan defines the first shippable release for Glaucon Politeia. It turns the milestone roadmap into a concrete release boundary: a dynamic personal publishing site with authentication, profiles, posts, tags, search, Markdown, comments, likes, bookmarks, responsive layout, and verified Supabase permissions.

## Release Boundary

Included:

- Project scaffold and test foundation.
- Supabase schema, RLS, and seed data for P0 tables.
- App shell, responsive layout, theme, and authentication.
- Profile auto-creation, public profiles, owner editing, and avatar upload.
- Post feed, editor, drafts, publishing, detail pages, tags, search, and Markdown rendering.
- Comments, nested replies, likes, bookmarks, optimistic interactions, and private bookmark details.
- Launch hardening, SEO metadata, mobile QA, RLS verification, and deployment checklist.

Excluded:

- Local TODO tool.
- Prompt Capture.
- Prompt Admin.
- 3D Lab.
- Article edit/delete UI.
- New tag creation UI.
- Billing, teams, organizations, subscriptions, or SaaS dashboard features.

## Milestone Dependency Graph

```text
M0 Project Baseline
  -> M1 Data Model, RLS, And Seeds
    -> M2 Application Shell, Theme, And Auth
      -> M3 Profiles
        -> M4 Posts, Tags, Search, And Markdown
          -> M5 Community Interactions
            -> M6 P0 Hardening And Launch Prep
```

## M0: Project Baseline

### Objective

Create a clean, runnable engineering foundation.

### Scope

- Scaffold Next.js App Router with TypeScript and Tailwind.
- Add Supabase helper structure for browser, server, and admin clients.
- Add `.env.example`.
- Configure Vitest and Testing Library.
- Create baseline app layout placeholder.
- Create Supabase migration directory.

### Exit Criteria

- `npm run dev` starts the app.
- `npm test` runs with a smoke test.
- `npm run build` completes.
- Missing Supabase environment variables produce clear local guidance.

### Primary Risks

- Pulling in too much starter-template product logic.
- Accidentally exposing service-role configuration to client code.

## M1: Data Model, RLS, And Seeds

### Objective

Establish trusted data and permission foundations before UI depends on them.

### Scope

- Add migrations for profiles, posts, tags, post_tags, comments, post_reactions, and bookmarks.
- Enable RLS for every table.
- Add policies for public published reads, owner draft reads, owner mutations, private bookmarks, and comment/reaction ownership.
- Seed required tags.
- Implement deterministic helpers for slug generation, excerpt generation, and username generation.
- Add unit tests for helpers.

### Exit Criteria

- Anonymous users can read published content and public metadata only.
- Authors can read their own drafts.
- Users cannot mutate rows owned by another user.
- Bookmark row details are private to the owner or admin.
- Seed tags exist.

### Primary Risks

- UI relying on client-side filtering for privacy.
- Bookmark counts accidentally exposing bookmark owners.
- Drafts leaking through profile or tag queries.

## M2: Application Shell, Theme, And Auth

### Objective

Make the site navigable and make authentication usable.

### Scope

- Fixed header.
- Desktop three-column shell.
- Mobile single-column shell.
- Left navigation and right information panel.
- Theme toggle with persisted light/dark mode.
- `/auth` login, registration, GitHub OAuth, and Google OAuth UI.
- `/auth/callback` session exchange.
- User menu and logout.

### Exit Criteria

- Logged-out and logged-in states render correctly.
- `redirectTo` survives login and OAuth callback.
- Theme persists across reloads without obvious flash.
- Layout is usable at mobile and desktop widths.

### Primary Risks

- Theme logic causing hydration mismatch.
- Auth callback losing redirect state.
- Layout becoming too marketing-oriented instead of content-focused.

## M3: Profiles

### Objective

Make user identity stable, editable, and safe to display publicly.

### Scope

- Profile auto-creation after login or `/profile/me`.
- Unique username generation from email.
- `/profile/me` resolver.
- `/profile/[username]` public profile.
- Owner edit controls for display name and bio.
- Avatar upload to Supabase Storage bucket `avatars`.
- Owner-only article and bookmark tabs.

### Exit Criteria

- First login creates a unique profile.
- `/profile/me` redirects to the real username page.
- Owners can update display name and bio.
- Owners can upload avatar.
- Visitors see only published posts and never bookmarks.

### Primary Risks

- Username collision handling being non-deterministic or untested.
- Storage policies allowing cross-user avatar writes.
- Visitor profile queries returning drafts.

## M4: Posts, Tags, Search, And Markdown

### Objective

Complete the publish-read-discover loop.

### Scope

- Home feed with published posts and pagination.
- Article card with author, relative time, excerpt, tags, like count, and bookmark count.
- `/editor` with title, existing tag selection, Markdown body, save draft, and publish.
- Slug collision handling.
- Excerpt generation from Markdown.
- `/posts/[slug]` detail page.
- Markdown rendering with GFM, code highlighting, and dark mode.
- `/tags/[tag]`.
- `/search?q=...`.

### Exit Criteria

- Authenticated users can save drafts and publish posts.
- Published posts appear on home, tag, search, and detail pages.
- Drafts do not appear publicly.
- Search handles special characters safely.
- Missing posts and tags return appropriate not-found states.

### Primary Risks

- Search query construction allowing malformed Supabase `.or()` filters.
- Markdown rendering creating unsafe HTML assumptions.
- Post/tag queries bypassing visibility rules.

## M5: Community Interactions

### Objective

Add the social layer around published content.

### Scope

- Like toggle with optimistic UI.
- Bookmark toggle with optimistic UI.
- Comment list.
- Top-level comment form.
- Nested reply flow.
- Comment delete by author.
- Revalidation after mutations.

### Exit Criteria

- Logged-out users are redirected to login for like, bookmark, and comment actions.
- Logged-in users can like/unlike and bookmark/unbookmark.
- Users can create comments and replies.
- Users can delete only their own comments.
- Public pages show aggregate counts without exposing private bookmark rows.

### Primary Risks

- Optimistic UI drifting from server state.
- Delete operations missing author filter.
- Bookmark privacy being weakened to simplify counts.

## M6: P0 Hardening And Launch Prep

### Objective

Make the core product ready for first deployment.

### Scope

- Empty states across P0 routes.
- Error states for auth, editor, profile, post detail, search, and tag pages.
- SEO metadata for home, posts, tags, and profiles.
- Mobile QA pass.
- RLS verification record.
- Environment variable checklist.
- Build, lint, and test cleanup.

### Exit Criteria

- P0 user journeys pass manually.
- `npm test`, `npm run lint`, and `npm run build` pass.
- Required deployment environment variables are documented.
- RLS verification confirms no known P0 privacy leaks.

### Primary Risks

- Treating launch prep as visual polish only.
- Not verifying RLS with anonymous, authenticated, owner, non-owner, and admin contexts.
- Deferring known privacy issues into production.

## P0 Manual Verification Matrix

Before P0 launch, manually verify:

- Anonymous visitor can browse home, tag, search, and post detail pages.
- Anonymous visitor cannot create posts, comments, likes, or bookmarks.
- New user can register, log in, and receive a profile.
- Logged-in user can edit profile and upload avatar.
- Author can save draft and publish post.
- Non-author cannot see draft.
- Logged-in user can comment, reply, delete own comment, like, and bookmark.
- User cannot delete another user's comment.
- Bookmark details are not visible to public queries.
- Theme, layout, and core pages work on mobile and desktop widths.

## Documentation Updates Required During P0

Keep these documents in sync as implementation decisions become concrete:

- `docs/project/03-architecture.md`
- `docs/project/04-data-permissions.md`
- `docs/project/05-api-contracts.md`
- `docs/project/07-quality-test-strategy.md`
- `docs/milestones/roadmap.md`
