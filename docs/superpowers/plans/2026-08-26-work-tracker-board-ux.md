# Work Tracker Board UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a denser four-group Work Tracker with an unobtrusive Quick Capture drawer, relevant Project filtering, compact actions, and visible Item types.

**Architecture:** Keep the nine-state domain model and transition graph unchanged. Add pure view-group and tracked-Project derivation helpers, render four active groups plus a completed view, and isolate Quick Capture overlay behavior in a client component.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, CSS, Supabase-backed server actions.

---

### Task 1: Encode the visual grouping and tracked Project model

**Files:**
- Modify: `lib/observatory/work-items.ts`
- Modify: `lib/observatory/work-tracker-projects.ts`
- Test: `tests/observatory-work-items.test.ts`
- Test: `tests/observatory-work-tracker-projects.test.ts`

- [ ] Write failing tests asserting the four active groups, the separate Done state, and Project options restricted to canonical Projects referenced by current Items.
- [ ] Run the two focused test files and confirm they fail for missing exports.
- [ ] Add typed visual-group constants and `filterTrackedWorkTrackerProjects()` without changing the transition graph.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Replace nine columns with four groups and a completed view

**Files:**
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `tests/observatory-work-tracker-board.test.tsx`

- [ ] Replace the nine-column expectations with failing tests for four active regions, a Completed tab, state badges, compact visible metadata, and tracked-only Project options.
- [ ] Add a failing test that opens a card's three-dot menu and submits a permitted transition with the expected version.
- [ ] Run the component test and confirm failures describe the missing grouped UI.
- [ ] Implement active/completed view switching, grouped cards, type/state badges, and accessible three-dot action menus.
- [ ] Remove ambiguous grouped-column drag behavior and update explanatory copy.
- [ ] Re-run the component test and confirm it passes.

### Task 3: Move Quick Capture into an accessible drawer

**Files:**
- Create: `components/observatory/WorkTrackerCaptureDrawer.tsx`
- Modify: `app/work-tracker/page.tsx`
- Modify: `tests/work-tracker-page.test.tsx`

- [ ] Write failing page tests for a top-level “新建 Item” button, a closed-by-default drawer, opening/closing behavior, and URL validation against tracked Projects.
- [ ] Run the page test and confirm it fails for the current permanent sidebar.
- [ ] Implement the client drawer with close button, backdrop click, Escape handling, and dialog semantics; keep all canonical Projects available inside Quick Capture.
- [ ] Validate `?project=` using tracked Project options derived from loaded Items.
- [ ] Re-run the page test and confirm it passes.

### Task 4: Apply responsive density and control alignment

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/observatory-work-tracker-board.test.tsx`

- [ ] Add semantic class assertions for the four-column grid, type variants, action menu, and drawer.
- [ ] Implement a four-column desktop grid, responsive horizontal snap on smaller screens, compact cards, fixed equal-height Project controls, overlay drawer, and mobile layout.
- [ ] Re-run focused Work Tracker tests.

### Task 5: Verify, document, release, and accept production

**Files:**
- Create: `docs/superpowers/evidence/2026-08-26-work-tracker-board-ux.md`

- [ ] Run full `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; record exact results.
- [ ] Run an independent code review against the approved design and fix all Critical/Important findings.
- [ ] Commit the scoped branch, fast-forward canonical `main`, and push to GitHub.
- [ ] Wait for Vercel Git integration to report success for the exact commit.
- [ ] Use authenticated browser acceptance at 1280px and 390×844; record layout measurements, relevant Project choices, interactions, console errors, and screenshots.
- [ ] Add the evidence document, run final gates again if code changed, push the documentation commit, and verify production remains healthy.
