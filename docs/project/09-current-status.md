# Current Project Status

Last updated: 2026-05-16

## Project Summary

Glaucon Politeia is a personal publishing and AI-coding archive rebuilt from the earlier Trae-era `Vibe Academy` materials. It is now a dynamic Next.js + Supabase application rather than a static blog.

The product combines:

- A personal writing site for AI coding notes, retrospectives, projects, and pitfalls.
- A small community layer with profiles, comments, likes, and bookmarks.
- Prompt capture and admin review workflows for collecting useful AI prompts.
- A standalone local TODO tool.
- An isolated 3D navigation lab at `/lab/world`.

Production URL:

```text
https://402v.com
```

## Production State

The project is deployed on Vercel and backed by Supabase.

Current launch gate:

```text
Launch readiness: ready
```

Verified production foundations:

- Vercel production deployment is live and publicly accessible.
- Custom domain `402v.com` is verified on Vercel.
- `www.402v.com` redirects permanently to `402v.com`.
- The production favicon is served from `/icon.svg`.
- Vercel production environment variables are configured.
- Supabase migrations are applied.
- Supabase Auth Site URL and redirect allow list are configured for `402v.com`.
- Supabase avatar storage bucket exists.
- Prompt capture table and admin RPCs exist.
- At least one admin profile exists.
- Direct local Supabase ops can check readiness and promote admins.

## Implemented Milestones

### M0: Project Baseline

- Next.js App Router app.
- TypeScript, Tailwind, Vitest, Testing Library, ESLint.
- Supabase browser/server/admin helpers.
- Environment validation helpers.
- Initial documentation and migration structure.

### M1: Data Model, RLS, And Seeds

- Core Supabase schema:
  - `profiles`
  - `posts`
  - `tags`
  - `post_tags`
  - `comments`
  - `post_reactions`
  - `bookmarks`
- RLS policies for public reads, author ownership, private bookmarks, and admin access.
- Seed tags.
- Slug, excerpt, username, and migration SQL tests.

### M2: Application Shell, Theme, And Auth

- Header, sidebar, right rail, and responsive app shell.
- Theme toggle with persistence.
- `/auth` page.
- Supabase email auth flow.
- OAuth callback route.
- Logout and redirect handling.

### M3: Profiles

- Profile auto-creation.
- `/profile/me`.
- Public `/profile/[username]`.
- Profile edit form.
- Avatar upload support through Supabase Storage.

### M4: Posts, Tags, Search, And Markdown

- Home feed.
- Post cards.
- `/editor` draft/publish flow.
- Markdown rendering with GFM and code highlighting.
- `/posts/[slug]`.
- `/tags/[tag]`.
- `/search`.

### M5: Community Interactions

- Like toggle.
- Bookmark toggle.
- Comment list.
- Top-level comments and replies.
- Comment deletion by author.
- Engagement count display.

### M6: P0 Hardening And Launch Prep

- Shared error and not-found surfaces.
- Deployment checklist.
- RLS verification document.
- Build/lint/test cleanup.

### M7: Local TODO Tool

- `/todos`.
- LocalStorage-backed TODO model.
- Create, edit, priority, complete, delete.
- JSON/CSV export helpers.

### M8: Prompt Capture

- `prompts` table, indexes, RLS, and generated search vector.
- Prompt payload validation.
- Sensitive-content flagging.
- Browser capture provider.
- Idempotency key and retry queue.
- `POST /api/prompts`.

### M9: Prompt Admin

- `/admin/prompts`.
- Admin authorization helper.
- Prompt list, filter, mark, unmark, soft delete.
- CSV export.
- Hourly stats.
- Retention API.
- Prompt stats and archival RPCs.

### M10: 3D Lab

- `/lab/world`.
- React Three Fiber and Drei scene.
- Card world data model.
- Hover, click, keyboard selection, and navigation.
- Browser screenshot and canvas rendering checks during implementation.

### M11: Supabase Direct Ops

- `npm run supabase:status`.
- `npm run supabase:apply-missing`.
- `npm run supabase:make-admin`.
- Direct database readiness checks using `SUPABASE_DB_URL`.

### M12: Launch Readiness

- `npm run supabase:readiness`.
- Launch gate for environment variables, Supabase migrations, and admin presence.
- Readiness test coverage.

### M13: Vercel Launch Prep

- `vercel.json`.
- Vercel deployment scripts.
- Vercel production environment documentation.
- Production URL documented.
- `.vercel` ignored.

### M14: Admin Bootstrap Fix

- Fixed direct admin bootstrap so it can promote the first admin despite the database anti-escalation trigger.
- The script temporarily disables and re-enables `profiles_prevent_admin_escalation` inside a transaction.

### M15: Custom Domain

- Added `402v.com` and `www.402v.com` to the Vercel project.
- Verified both domains with Vercel domain ownership TXT records.
- Configured `www.402v.com` as a permanent redirect to `https://402v.com/`.
- Versioned Supabase Auth URL configuration in `supabase/config.toml`.
- Updated Supabase Auth Site URL and callback allow list for the custom domain.

### M16: Site Favicon

- Added the Knowledge Nodes favicon at `app/icon.svg`.
- Registered `/icon.svg` in Next.js metadata.
- Deployed the favicon to production and verified `https://402v.com/icon.svg`.

## Latest Project Snapshot

- Snapshot: `docs/project/snapshots/2026-05-16-production-snapshot.md`
- Latest production commit: `8492770 feat: add site favicon`
- Latest production deployment id: `dpl_5D1MpUzVyKby6dvDfsvU2PSW8F49`
- Production domain: `https://402v.com`
- Favicon URL: `https://402v.com/icon.svg`

## Current Commands

Local development:

```bash
npm install
npm run dev
```

Quality gate:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

Supabase ops:

```bash
npm run supabase:status
npm run supabase:apply-missing
npm run supabase:readiness
npm run supabase:make-admin -- --email owner@example.com
```

Vercel:

```bash
npm run vercel:link
npm run vercel:env:pull
npm run vercel:build
npm run vercel:deploy
```

Supabase project config:

```bash
npx supabase login
npx supabase link --project-ref fiicazfhjkviqaaaiksp
npx supabase config push --project-ref fiicazfhjkviqaaaiksp
```

## Documentation Map

Primary working docs:

- `docs/project/01-product-brief.md`
- `docs/project/02-requirements.md`
- `docs/project/03-architecture.md`
- `docs/project/04-data-permissions.md`
- `docs/project/05-api-contracts.md`
- `docs/project/06-ux-content-system.md`
- `docs/project/07-quality-test-strategy.md`
- `docs/project/08-legacy-analysis.md`
- `docs/project/09-current-status.md`
- `docs/project/snapshots/2026-05-16-production-snapshot.md`

Milestone planning:

- `docs/milestones/roadmap.md`
- `docs/milestones/m0-m6-release-plan.md`
- `docs/superpowers/plans/`

Architecture decisions:

- `docs/adr/0001-project-starting-point.md`

Operations:

- `docs/ops/deployment-checklist.md`
- `docs/ops/rls-verification.md`
- `docs/ops/supabase-direct-ops.md`
- `docs/ops/vercel-deployment.md`

Historical source material:

- `docs/raw/CODEX_IMPLEMENTATION_SPEC.md`
- `docs/raw/PROJECT_START_STRATEGY.md`

## Known Follow-Up Work

The current production deployment is usable, but there is still product polish and operational hardening to do:

- Complete end-to-end manual QA for authenticated publishing, comments, profile edits, prompt admin, and avatar upload.
- Add browser E2E tests for publishing, comments, admin access control, and prompt capture.
- Configure Preview environment variables in Vercel if preview deployments are needed.
- Improve empty states and real homepage content.
- Tighten SEO metadata for posts, tags, and profiles.
- Decide whether `/lab/world` should remain in the primary navigation or move under an experiments section.
