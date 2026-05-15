# Implementation Milestone Roadmap

## Strategy

Build the project in vertical, testable slices. The first shippable milestone should be the core content community loop only. TODO, Prompt Capture/Admin, and 3D Lab are independent subsystems and should follow after the main product is stable.

Each milestone must leave the repository in a coherent state:

- The app can still start, test, and build once application scripts exist.
- New database tables include RLS in the same milestone.
- Privacy-sensitive behavior is verified before dependent UI ships.
- Documentation is updated when the milestone changes product behavior or scope.

## Release Bands

### P0 Release: Milestones 0-6

This is the first public-ready release. It covers the dynamic personal publishing product: auth, profiles, posts, tags, search, Markdown, comments, likes, bookmarks, responsive shell, RLS, and launch hardening.

### P1 Enhancements: Milestone 7

The local TODO tool is useful but independent. It should not block P0 because it does not affect the core publishing loop.

### P2 Prompt System: Milestones 8-9

Prompt Capture and Prompt Admin should ship after the main product because they add privacy, retention, admin authorization, export, retry queue, and sensitive-content concerns.

### P3 Experiment: Milestone 10

The 3D Lab is isolated to a dedicated route and should not affect ordinary content page performance.

## Milestone 0: Project Baseline

Goal: Create a clean application foundation with Supabase, testing, and documentation in place.

Deliverables:

- Next.js App Router + TypeScript app.
- Tailwind configured.
- Supabase browser/server/admin client helpers.
- `.env.example`.
- Vitest and Testing Library configured.
- Base layout shell placeholder.
- Initial Supabase migration structure.

Acceptance criteria:

- App starts locally.
- Tests run with at least one passing smoke test.
- Build runs.
- Supabase env absence produces clear local guidance.

Dependencies:

- None.

## Milestone 1: Data Model, RLS, And Seeds

Goal: Establish the database foundation before building user-facing features.

Deliverables:

- Migrations for profiles, posts, tags, post_tags, comments, post_reactions, and bookmarks.
- RLS policies for all P0 tables.
- Seed tags.
- Helper functions for profile creation, slug generation, excerpt generation, and username generation.
- Unit tests for helper functions.

Acceptance criteria:

- Anonymous users can read only public data.
- Authors can read their own drafts.
- Users cannot mutate other users' rows.
- Bookmark details are private.
- Seed tags exist.

Dependencies:

- Milestone 0.

## Milestone 2: Application Shell, Theme, And Auth

Goal: Build the navigable app frame and authentication flows.

Deliverables:

- Fixed header.
- Desktop three-column layout.
- Mobile single-column layout.
- Theme toggle with persistence and no initial flash.
- `/auth` login/register/OAuth UI.
- `/auth/callback`.
- User menu and logout.

Acceptance criteria:

- Logged-out users see login state.
- Logged-in users see menu and can log out.
- `redirectTo` works after auth.
- Theme persists across reloads.
- Layout works on desktop and mobile widths.

Dependencies:

- Milestone 1.

## Milestone 3: Profiles

Goal: Make user identity stable and editable.

Deliverables:

- Profile auto-creation.
- `/profile/me` resolver.
- `/profile/[username]` public profile.
- Owner profile edit form.
- Avatar upload to Supabase Storage.
- Owner article/bookmark tabs, with bookmarks initially empty until later interaction milestone.

Acceptance criteria:

- First login creates a unique profile.
- `/profile/me` redirects correctly.
- Owners can update display name and bio.
- Owners can upload avatar.
- Visitors do not see drafts or bookmarks.

Dependencies:

- Milestone 2.

## Milestone 4: Posts, Tags, Search, And Markdown

Goal: Complete the publishing and reading loop.

Deliverables:

- Home feed with pagination.
- Article card.
- `/editor` draft/publish flow.
- Tag selection, max 3.
- `/posts/[slug]`.
- Markdown rendering with GFM and code highlighting.
- `/tags/[tag]`.
- `/search`.

Acceptance criteria:

- Authenticated users can save drafts and publish posts.
- Published posts appear on home, tag, search, and detail pages.
- Drafts do not appear publicly.
- Slug collisions are handled.
- Search handles special characters safely.
- Empty and missing states are clear.

Dependencies:

- Milestone 3.

## Milestone 5: Community Interactions

Goal: Add the interaction layer around published content.

Deliverables:

- Like toggle.
- Bookmark toggle.
- Comment list.
- Top-level comments.
- Nested replies.
- Comment deletion by author.
- Optimistic UI and revalidation.

Acceptance criteria:

- Logged-out like/bookmark/comment actions redirect to auth with `redirectTo`.
- Logged-in users can like and unlike.
- Logged-in users can bookmark and unbookmark.
- Users can create comments and replies.
- Users can delete only their own comments.
- Public pages show counts without exposing private bookmark details.

Dependencies:

- Milestone 4.

## Milestone 6: P0 Hardening And Launch Prep

Goal: Make the core product launchable.

Deliverables:

- Empty states and error states across P0 routes.
- Mobile QA fixes.
- SEO metadata for home, posts, tags, and profiles.
- RLS verification record.
- Build, lint, and test cleanup.
- Deployment environment checklist.

Acceptance criteria:

- P0 user journeys pass manually.
- Automated tests pass.
- Production build passes.
- Required environment variables are documented.
- No known P0 privacy leaks remain.

Dependencies:

- Milestone 5.

## Milestone 7: Local TODO Tool

Goal: Add the standalone local utility page.

Deliverables:

- `/todos`.
- Local storage model.
- Create, edit, notes, priority, complete, delete.
- Filter and sort.
- JSON and CSV export.
- Unit and component tests.

Acceptance criteria:

- TODOs persist across reloads.
- Corrupt localStorage data falls back safely.
- Exports are valid.
- No Supabase dependency is introduced.

Dependencies:

- Milestone 6.

## Milestone 8: Prompt Capture

Goal: Add automatic Prompt capture without destabilizing the core app.

Deliverables:

- Prompt tables, indexes, generated tsvector, and RLS.
- Prompt validation and sensitive detection helpers.
- Client session id and idempotency key.
- Capture provider.
- Retry queue.
- `POST /api/prompts`.
- Tests for validation, detection, queue, and ingest.

Acceptance criteria:

- Auth and password forms are never captured.
- Valid prompt-like submissions are captured.
- Duplicate idempotency keys return existing rows.
- Failed submissions queue and flush on reconnect.
- Sensitive content is flagged.

Dependencies:

- Milestone 6.

## Milestone 9: Prompt Admin

Goal: Provide administrator review, export, and retention workflows.

Deliverables:

- `/admin/prompts`.
- Admin authorization helper.
- `GET /api/prompts`.
- `POST /api/prompts/bulk`.
- `GET /api/prompts/export`.
- `GET /api/prompts/stats`.
- `POST /api/prompts/retention`.
- RPCs for stats and archival.
- Tests for API authorization and behavior.

Acceptance criteria:

- Non-admins cannot access admin page or APIs.
- Admins can filter, paginate, mark, unmark, soft delete, and export.
- Stats always return 24 hourly buckets.
- Retention requires the configured secret.
- Batch operations update UI without full page reload.

Dependencies:

- Milestone 8.

## Milestone 10: 3D Lab

Goal: Add the interactive navigation experiment as an isolated route.

Deliverables:

- `/lab/world`.
- React Three Fiber canvas.
- Card world data model.
- Scroll, hover, click, and keyboard interaction.
- Suspense fallback.
- Mobile performance guardrails.

Acceptance criteria:

- Ordinary site pages do not load Three.js bundles.
- Canvas renders non-blank on desktop.
- Active card navigation works by click and Enter.
- Mobile behavior remains usable or falls back gracefully.

Dependencies:

- Milestone 6.

## Recommended First Delivery

Milestones 0 through 6 form the first complete release. That release is useful without the optional subsystems and creates a stable base for future expansion.

For execution details, use `docs/milestones/m0-m6-release-plan.md`.
