# Dashboard Navigation Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add linked Dashboard index cards, sticky section navigation, and protected Projects and Skills directories with shareable filters.

**Architecture:** Pure view-model helpers project the validated Observatory
snapshot into directory entries. Client components own filtering and URL
replacement, while server route components retain request-time admin checks and
snapshot validation. The homepage uses stable fragment anchors and one sticky
observer-driven navigation component.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Testing
Library, existing 402v CSS.

---

### Task 1: Directory view models and richer Skill metadata

**Files:**
- Create: `lib/observatory/dashboard-directory.ts`
- Modify: `lib/observatory/system-assets.ts`
- Test: `tests/observatory-dashboard-directory.test.ts`
- Test: `tests/observatory-system-assets.test.ts`

- [ ] Write failing tests that flatten registry projects, attach exact repository
      matches and recent activity, group Skill instances by normalized name,
      aggregate health, and preserve safe description/install-source metadata.
- [ ] Run the focused tests and confirm failures are caused by missing behavior.
- [ ] Implement the minimal pure projections and Skill label additions.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Searchable Projects and Skills directories

**Files:**
- Create: `components/observatory/ProjectDirectory.tsx`
- Create: `components/observatory/SkillDirectory.tsx`
- Test: `tests/observatory-project-directory.test.tsx`
- Test: `tests/observatory-skill-directory.test.tsx`

- [ ] Write failing interaction tests for search, every approved filter, sorting,
      unique/instance counts, and URL replacement.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement controlled directory components with native labelled inputs and
      selects, dense result lists, and explicit empty states.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Protected directory routes and shared snapshot loader

**Files:**
- Create: `lib/observatory/dashboard-state.ts`
- Create: `app/dashboard/projects/page.tsx`
- Create: `app/dashboard/skills/page.tsx`
- Modify: `app/dashboard/page.tsx`
- Test: `tests/observatory-directory-pages.test.tsx`
- Modify: `tests/observatory-page.test.tsx`

- [ ] Write failing route tests for anonymous redirects, request-time rendering,
      validated ready state, and safe empty/error states.
- [ ] Run the route tests and confirm expected failures.
- [ ] Extract the existing validated snapshot loader and implement both routes.
- [ ] Run the route tests and confirm they pass.

### Task 4: Homepage linked index and sticky section navigation

**Files:**
- Create: `components/observatory/DashboardSectionNav.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/dashboard/page.tsx`
- Test: `tests/observatory-dashboard-section-nav.test.tsx`
- Modify: `tests/observatory-overview.test.tsx`
- Modify: `tests/observatory-page.test.tsx`

- [ ] Write failing tests for summary-card destinations, the Skills card,
      stable section anchors, sticky-nav links, click state, and observer state.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement available-section projection, fragment wrappers, linked cards,
      and the sticky client navigation.
- [ ] Run the focused tests and confirm they pass.

### Task 5: 402v styling and responsive behavior

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/observatory-dashboard-section-nav.test.tsx`
- Modify: `tests/observatory-project-directory.test.tsx`
- Modify: `tests/observatory-skill-directory.test.tsx`

- [ ] Add failing structural CSS assertions for sticky positioning, focus
      visibility, responsive horizontal tabs, directory grids, and scroll margin.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add minimal 402v dark-grid-compatible styles and mobile breakpoints.
- [ ] Run focused tests and confirm they pass.

### Task 6: Release verification and production deployment

**Files:**
- Modify: `docs/project/09-current-status.md` only if the existing release log
  requires a matching entry.

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run lint` and require zero errors.
- [ ] Run `npm run typecheck` and require exit code 0.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Start the production build locally and verify desktop and 390 px browser
      behavior with `agent-browser`.
- [ ] Deploy the verified commit to Vercel production using the repository's
      linked project configuration.
- [ ] Verify `https://402v.com/dashboard`, `/dashboard/projects`, and
      `/dashboard/skills` in an authenticated browser session.
