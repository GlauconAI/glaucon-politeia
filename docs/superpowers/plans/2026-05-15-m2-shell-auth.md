# M2 Application Shell, Theme, And Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the navigable application shell, persisted theme controls, and Supabase authentication entry points.

**Architecture:** The site shell is server-rendered around shared layout components. Auth mutations are handled by server actions and an OAuth callback route, with small pure helpers for redirect sanitization and theme script generation that are tested independently.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Supabase SSR, Vitest, Testing Library.

---

## File Structure

- `app/layout.tsx`: root shell wrapper and theme initialization script.
- `app/page.tsx`: baseline home content inside the app shell.
- `app/auth/page.tsx`: login/register/OAuth screen.
- `app/auth/actions.ts`: email login, registration, OAuth, and logout server actions.
- `app/auth/callback/route.ts`: OAuth code exchange and redirect.
- `components/layout/AppShell.tsx`: fixed header, left navigation, main column, and right panel.
- `components/layout/Header.tsx`: brand, search, write action, theme toggle, and user menu.
- `components/layout/Sidebar.tsx`: desktop navigation.
- `components/layout/RightRail.tsx`: desktop information panel.
- `components/theme/ThemeToggle.tsx`: client theme toggle.
- `components/auth/AuthForm.tsx`: auth form UI.
- `lib/auth/redirect.ts`: safe redirect helper.
- `lib/theme/init.ts`: no-flash theme initialization script.
- `tests/auth-redirect.test.ts`: redirect helper tests.
- `tests/theme-init.test.ts`: theme init script tests.
- `tests/app-shell.test.tsx`: layout smoke tests.

## Task 1: Redirect And Theme Helpers

- [x] Write failing tests for safe redirect behavior.
- [x] Write failing tests for theme init script contents.
- [x] Implement `lib/auth/redirect.ts` and `lib/theme/init.ts`.
- [x] Run focused helper tests.

## Task 2: Layout Shell

- [x] Create app shell components.
- [x] Add fixed header, desktop sidebars, mobile-safe main layout, search, write action, and user menu states.
- [x] Add theme toggle client component.
- [x] Update root layout and home page.
- [x] Run layout smoke tests.

## Task 3: Authentication Routes

- [x] Create `/auth` page and form.
- [x] Add server actions for email login, registration, OAuth, and logout.
- [x] Add `/auth/callback` route.
- [x] Preserve sanitized `redirectTo`.

## Task 4: Verification

- [x] Run `npm test`.
- [x] Run `npm run lint`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `npm audit --omit=dev`.
- [x] Commit M2 implementation.

## Self-Review

- Scope stays within M2 shell, theme, and auth.
- Profile auto-creation remains deferred to M3.
- Content publishing remains deferred to M4.
- Theme initialization avoids an initial light/dark flash.
