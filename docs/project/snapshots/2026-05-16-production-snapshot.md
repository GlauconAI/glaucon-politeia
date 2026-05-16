# Production Project Snapshot

Snapshot date: 2026-05-16

## Summary

Glaucon Politeia is a live personal publishing and AI-coding archive rebuilt from the earlier Trae-era `Vibe Academy` materials. The current product is a dynamic Next.js + Supabase application with publishing, profiles, community interaction, prompt capture/admin workflows, a local TODO tool, and a 3D navigation lab.

The current production site is:

```text
https://402v.com
```

The Vercel-generated production URL remains available:

```text
https://glaucon-politeia.vercel.app
```

## Git And Deployment State

- Main branch is synchronized with `origin/main`.
- Latest production commit: `8492770 feat: add site favicon`
- Latest documented production deployment id: `dpl_5D1MpUzVyKby6dvDfsvU2PSW8F49`
- Deployment URL: `https://glaucon-politeia-ap6ya5swe-plato-8448s-projects.vercel.app`
- Production alias: `https://402v.com`

## Production Verification

Latest checks performed for this snapshot:

```text
https://402v.com           -> 200
https://402v.com/icon.svg  -> 200 image/svg+xml
```

Previously verified production routing:

```text
https://www.402v.com/         -> 301 https://402v.com/
https://www.402v.com/icon.svg -> 301 https://402v.com/icon.svg
```

Current launch gate:

```text
Launch readiness: ready
```

## Infrastructure

### Vercel

- Project: `glaucon-politeia`
- Production domain: `402v.com`
- `www.402v.com` permanently redirects to `https://402v.com/`.
- Production build uses Next.js 16 App Router.
- `app/icon.svg` is emitted as static route `/icon.svg`.

### Supabase

- Project ref: `fiicazfhjkviqaaaiksp`
- Project name: `Glaucon's Politeia`
- Region: West US (Oregon)
- Auth Site URL: `https://402v.com`
- Auth redirect allow list:
  - `https://402v.com/auth/callback`
  - `https://www.402v.com/auth/callback`
  - `https://glaucon-politeia.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`
- Auth URL configuration is versioned in `supabase/config.toml`.

## Implemented Product Surface

- App shell, responsive navigation, right rail, and theme persistence.
- Supabase email auth, OAuth callback route, logout, and safe redirect handling.
- Profile auto-creation, profile editing, public profiles, and avatar upload.
- Posts, tags, search, Markdown rendering, and editor flow.
- Likes, bookmarks, comments, replies, comment deletion, and engagement counts.
- Local TODO tool at `/todos`.
- Prompt capture, idempotency, retry queue, and `POST /api/prompts`.
- Prompt Admin at `/admin/prompts` with filtering, bulk actions, CSV export, stats, retention, and archival RPCs.
- 3D navigation lab at `/lab/world`.
- Direct Supabase ops for migration status, missing migration application, readiness checks, and admin bootstrap.
- Knowledge Nodes favicon served from `/icon.svg`.

## Implemented Milestones

- M0: Project Baseline
- M1: Data Model, RLS, And Seeds
- M2: Application Shell, Theme, And Auth
- M3: Profiles
- M4: Posts, Tags, Search, And Markdown
- M5: Community Interactions
- M6: P0 Hardening And Launch Prep
- M7: Local TODO Tool
- M8: Prompt Capture
- M9: Prompt Admin
- M10: 3D Lab
- M11: Supabase Direct Ops
- M12: Launch Readiness
- M13: Vercel Launch Prep
- M14: Admin Bootstrap Fix
- M15: Custom Domain
- M16: Site Favicon

## Operational Commands

Quality gate:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
```

Supabase:

```bash
npm run supabase:status
npm run supabase:apply-missing
npm run supabase:readiness
npm run supabase:make-admin -- --email owner@example.com
npx supabase config push --project-ref fiicazfhjkviqaaaiksp
```

Vercel production deployment:

```bash
npx vercel@latest build --prod
npx vercel@latest deploy --prebuilt --prod --yes
```

## Current Follow-Up Work

- Complete end-to-end manual QA for authenticated publishing, comments, profile edits, prompt admin, and avatar upload.
- Add browser E2E tests for publishing, comments, admin access control, and prompt capture.
- Configure Preview environment variables in Vercel if preview deployments are needed.
- Improve empty states and real homepage content.
- Tighten SEO metadata for posts, tags, and profiles.
- Decide whether `/lab/world` should remain in the primary navigation or move under an experiments section.
