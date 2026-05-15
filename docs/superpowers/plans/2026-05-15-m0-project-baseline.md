# M0 Project Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a runnable Next.js + Supabase + testing foundation for Glaucon Politeia.

**Architecture:** The baseline uses Next.js App Router with TypeScript and Tailwind. Supabase access is centralized in small browser, server, and admin helpers, and tests verify environment handling before feature work begins.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Supabase JS/SSR, Vitest, Testing Library.

---

## File Structure

- `package.json`: scripts and project dependencies.
- `tsconfig.json`: TypeScript configuration.
- `next.config.ts`: Next.js configuration.
- `types/next.d.ts`: stable Next.js type references.
- `postcss.config.mjs`: Tailwind PostCSS configuration.
- `eslint.config.mjs`: lint configuration.
- `vitest.config.ts`: Vitest configuration.
- `.env.example`: required environment variable template.
- `app/layout.tsx`: root app layout.
- `app/page.tsx`: baseline home page.
- `app/globals.css`: Tailwind and global styles.
- `lib/env.ts`: typed environment configuration helper.
- `lib/supabase/browser.ts`: browser Supabase client factory.
- `lib/supabase/server.ts`: server Supabase client factory.
- `lib/supabase/admin.ts`: service-role Supabase client factory.
- `tests/env.test.ts`: environment helper tests.
- `tests/smoke.test.tsx`: baseline React render smoke test.
- `supabase/migrations/.gitkeep`: migration directory placeholder.

## Task 1: Project Tooling

- [x] Create `package.json`, TypeScript, Next, PostCSS, ESLint, and Vitest configuration.
- [x] Install dependencies with `npm install`.
- [x] Verify dependency installation creates `package-lock.json`.

## Task 2: Environment Contract

- [x] Write failing tests for missing and present Supabase environment variables.
- [x] Implement `lib/env.ts`.
- [x] Add `.env.example`.
- [x] Run `npm test -- tests/env.test.ts`.

## Task 3: Supabase Helpers

- [x] Create browser, server, and admin Supabase helpers.
- [x] Keep service-role usage isolated to `lib/supabase/admin.ts`.
- [x] Run typecheck after helpers exist.

## Task 4: App Shell Placeholder

- [x] Create root layout, global styles, and baseline home page.
- [x] Write a smoke test that renders the home page heading.
- [x] Run `npm test -- tests/smoke.test.tsx`.

## Task 5: Baseline Verification

- [x] Run `npm test`.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Commit M0 baseline implementation.

## Self-Review

- Scope matches Milestone 0 only.
- No P1/P2/P3 features are included.
- Supabase service role is isolated.
- Tests cover the baseline environment contract and page render.
