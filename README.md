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

For the full project introduction, milestone completion record, commands, production state, and follow-up work, read:

```text
docs/project/09-current-status.md
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
