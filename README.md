# Glaucon Politeia

Glaucon Politeia is a personal publishing and AI-coding archive rebuilt from the earlier Trae-era `Vibe Academy` materials. It is a dynamic Next.js + Supabase product for writing, project retrospectives, prompt workflows, community interaction, and small personal tools.

Production:

```text
https://402v.com
```

Current launch state:

```text
Launch readiness: ready
```

## 402v Publishing System

`402v Publishing System` is the next project package for maintaining
`https://402v.com` as a personal publishing surface for AI-coding knowledge,
HTML artifacts, project reports, and private notes. It packages the existing
Glaucon Politeia site, the completed local HTML artifact generator, and the
next public/private HTML publishing workflow into one product direction.

The goal is simple: when there is an existing HTML page or a generated HTML
artifact, the owner should be able to say "publish" and place it on `402v.com`
as either:

- `public`: readable by anonymous visitors without login.
- `private`: readable only after login.

The current production site already provides the base product:

- Next.js App Router application.
- Vercel production hosting for `https://402v.com`.
- Supabase Auth, database, Row Level Security, and local operator scripts.
- Authenticated editor flow at `/editor`.
- Post detail pages at `/posts/[slug]`.
- Public content feed, tags, search, profiles, comments, likes, and bookmarks.

The existing companion generator is `html-artifact-publisher` v1. It currently
lives outside this repository as a local development asset:

```text
/Users/glaucon/.config/superpowers/worktrees/plato/html-artifact-publisher-v1/skills-dev/html-artifact-publisher/
```

That tool can already turn Markdown reports into a local HTML site package with
`index.html`, `site.json`, `manifest.json`, `sources.json`, `latest.json`,
`README.md`, and a zip package. It is an upstream artifact generator, not the
online publishing target. This repository is the online publishing target.

The intended pipeline is:

```text
Markdown/report/source material
  -> html-artifact-publisher or an existing hand-authored HTML file
  -> local publish command
  -> Supabase posts table
  -> 402v.com post route
  -> public or login-required access control
```

The next implementation will extend the current post model instead of creating
a separate CMS. The expected application changes are:

- Add post visibility: `public` or `private`.
- Add post content format: `markdown` or `html`.
- Keep existing Markdown posts working without migration breakage.
- Render HTML artifacts in a safe sandboxed viewer.
- Keep anonymous access limited to public published content.
- Allow authenticated users to read private published content.
- Add editor controls for public/private and Markdown/HTML content.
- Add a local CLI command for publishing an HTML file into `402v.com`.
- Keep Vercel/Supabase operations under the existing launch gates.

The implementation plan is saved at:

```text
docs/superpowers/plans/2026-07-01-402v-html-publishing.md
```

Deployment remains Vercel-based. Database and authorization changes must be
represented as Supabase migrations and verified before deployment.

For the full project introduction, milestone completion record, commands, production state, and follow-up work, read:

```text
docs/project/09-current-status.md
```

Latest project snapshot:

```text
docs/project/snapshots/2026-05-16-production-snapshot.md
```

## What Is Implemented

- Next.js App Router, TypeScript, Tailwind, Vitest, Testing Library, and ESLint.
- Supabase browser, server, and admin clients using publishable and secret keys.
- Supabase schema, RLS, seed tags, storage bucket, prompt tables, and admin RPCs.
- App shell, theme persistence, auth entrypoints, and OAuth callback.
- Profiles, profile editing, and avatar upload support.
- Posts, tags, search, Markdown rendering, and editor flow.
- Likes, bookmarks, comments, replies, and comment deletion.
- Local TODO tool at `/todos`.
- Prompt capture and retry queue.
- Prompt Admin at `/admin/prompts`.
- 3D navigation lab at `/lab/world`.
- Supabase direct ops and launch readiness checks.
- Vercel production deployment configuration.
- Custom domain `402v.com` with `www.402v.com` redirect.
- Knowledge Nodes favicon served from `/icon.svg`.
- Admin-only Dashboard with production System Observatory, Project Cockpit,
  Three-track Roadmap, Flow Analytics / Forecast, and Governance Reports /
  Review. These governance surfaces consume a strict sanitized read model and
  never write back to their authority sources.
- M1 Source Repository Observatory discovers Git repositories below two
  explicitly approved roots: the OpenClaw workspace and the Obsidian Vault.
  Snapshot v4 publishes only bounded local Git metadata and canonical,
  credential-free GitHub coordinates. It does not publish repository content,
  absolute paths, raw remotes, commit messages, authors, email addresses,
  diffs, or status filenames. Archive state remains `unknown` until a trusted
  enrichment source is separately approved.
- M3 manual Work Tracker core is Production Accepted: Quick Capture feeds an
  admin-only nine-state Board and item detail surface. Server-authoritative
  RPCs enforce allowed transitions, the Ready Gate, optimistic versions,
  evidence lifecycle, and append-only history. The production migration,
  retained full-state workflow smoke, authenticated UI checks, and anonymous
  route protection Gate have passed.
- M3 Low-risk Agent Claim Engine and Dashboard Dogfood Pilot are Production
  Accepted in dormant mode. The server-authoritative claim, heartbeat,
  release, completion, sweep, lease, administrator policy, and cancellation
  paths are deployed. No runner token is configured and no production claim
  exists, so every runner API fails closed until a separately approved runner
  identity and token are supplied.
- Planned 402v Publishing System direction for public/private HTML artifact publishing.

## Core Commands

Install and run locally:

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

M3 Work Tracker database Gate:

```bash
supabase start
supabase db reset --local --no-seed
npm run observatory:verify-local-db
npm run observatory:verify-local-claims
npm run observatory:pilot-local
supabase stop --no-backup
```

After the Project Version contract migration is applied to the disposable
Supabase CLI database, its release/state lock protocol has an explicit
two-connection exercise:

```bash
npm run observatory:project-version-contract-v1 -- \
  --mode concurrency --confirm-local-concurrency
```

Set `OBSERVATORY_LOCAL_DB_URL` through the local host environment before
running the command; do not place database credentials in shell history. This
mode rejects every non-loopback/non-CLI target, uses bounded lock and
statement timeouts, commits only a uniquely named fixture Work Item state
change, rolls the release transaction back, and removes the event-free fixture
rows. It is opt-in and must never be run against Production.

The core verifier requires 32 passing checks. The Agent Claim verifier adds
42 checks for exact grants/RLS, principals, eligibility, idempotency,
concurrency, leases, recovery, completion, human approval, evidence, and
append-only audit. The pilot also requires a loopback Next.js API configured
with a fixture token. Every command fails closed unless its database/API
target is disposable and loopback. Never point these tools at a remote
database.

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

## Documentation Map

### Current Status

- `docs/project/09-current-status.md`
  - Current project summary, production status, implemented milestones, commands, and follow-up work.

- `docs/project/snapshots/2026-05-16-production-snapshot.md`
  - Point-in-time project snapshot after custom domain, favicon, and production deployment.

### Active Project Documents

- `docs/project/00-document-index.md`
  - Entry point for the documentation set.

- `docs/project/01-product-brief.md`
  - Product goal, audience, release priorities, non-goals, and success criteria.

- `docs/project/02-requirements.md`
  - Functional and non-functional requirements grouped by subsystem.

- `docs/project/03-architecture.md`
  - App architecture, module boundaries, rendering strategy, and extensibility rules.

- `docs/project/04-data-permissions.md`
  - Supabase table responsibilities, RLS expectations, storage rules, seed data, and migration rules.

- `docs/project/05-api-contracts.md`
  - API route contracts, validation expectations, responses, errors, and authorization rules.

- `docs/project/06-ux-content-system.md`
  - Layout, navigation, theme, editor, post, profile, TODO, Prompt Admin, and 3D Lab UX expectations.

- `docs/project/07-quality-test-strategy.md`
  - Unit, component, API, integration, RLS, security, performance, and milestone verification strategy.

- `docs/project/08-legacy-analysis.md`
  - Analysis of the original Trae materials, subsystem boundaries, known risks, and rebuild decisions.

### Milestones

- `docs/milestones/roadmap.md`
  - End-to-end milestone roadmap.

- `docs/milestones/m0-m6-release-plan.md`
  - Initial release plan for the core product loop.

- `docs/superpowers/plans/`
  - Implementation plans created during milestone execution.

- `docs/superpowers/plans/2026-07-01-402v-html-publishing.md`
  - Implementation plan for public/private HTML artifact publishing on `402v.com`.

### Architecture Decisions

- `docs/adr/0001-project-starting-point.md`
  - Starting point decision for rebuilding from the archived Trae-era implementation materials.

### Operations

- `docs/ops/deployment-checklist.md`
  - Deployment checklist and release verification.

- `docs/ops/rls-verification.md`
  - RLS verification record.

- `docs/ops/supabase-direct-ops.md`
  - Local Supabase database checks, missing migration application, and admin promotion commands.

- `docs/ops/vercel-deployment.md`
  - Vercel environment variables, CLI workflow, Auth callback configuration, and launch gate.

### Raw Source Material

- `docs/raw/CODEX_IMPLEMENTATION_SPEC.md`
  - Original Trae-era product and implementation notes.

- `docs/raw/PROJECT_START_STRATEGY.md`
  - Original rebuild strategy and phased recommendation.
