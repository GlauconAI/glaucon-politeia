# Orchestrator Shell Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Orchestrator inside the same authenticated 402v shell as Dashboard and Work Tracker while preserving its standalone artifact in an isolated frame.

**Architecture:** `/orchestrator` becomes a normal Next.js server page, so the root `AppShell` provides the site header and peer navigation. The published HTML moves to the independently protected `/orchestrator/artifact` route and is embedded in an iframe to prevent CSS and script collisions.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Testing Library, CSS.

---

### Task 1: Lock the page and artifact route contracts

**Files:**
- Create: `tests/orchestrator-page.test.tsx`
- Modify: `tests/orchestrator-route.test.ts`

- [ ] **Step 1: Write the failing page tests**

Test that anonymous access redirects before rendering, while admin access renders an `Orchestrator` level-one heading, an access status region, and an iframe titled `Orchestrator control surface` whose source is `/orchestrator/artifact`.

- [ ] **Step 2: Update the route test URL**

Exercise `resolveOrchestratorRequest` using `https://402v.com/orchestrator/artifact` and preserve the existing exact-HTML, auth redirect, and unavailable-artifact assertions.

- [ ] **Step 3: Run RED verification**

Run: `npx vitest run tests/orchestrator-page.test.tsx tests/orchestrator-route.test.ts`

Expected: the page test fails because `app/orchestrator/page.tsx` does not exist.

### Task 2: Build the shared-shell page and protected artifact endpoint

**Files:**
- Create: `app/orchestrator/page.tsx`
- Create: `app/orchestrator/artifact/route.ts`
- Delete: `app/orchestrator/route.ts`

- [ ] **Step 1: Implement the minimal server page**

Authorize with `getCurrentObservatoryAdmin`, redirect anonymous users to `/auth?redirectTo=/orchestrator`, and render the shared hero plus an iframe targeting `/orchestrator/artifact`.

- [ ] **Step 2: Move the route adapter**

Call the unchanged `resolveOrchestratorRequest` from `app/orchestrator/artifact/route.ts`, keeping `dynamic = "force-dynamic"`.

- [ ] **Step 3: Run GREEN verification**

Run: `npx vitest run tests/orchestrator-page.test.tsx tests/orchestrator-route.test.ts`

Expected: both files pass.

### Task 3: Add compact responsive presentation

**Files:**
- Modify: `app/globals.css`
- Create: `tests/orchestrator-responsive.test.ts`

- [ ] **Step 1: Write a failing CSS contract test**

Assert that `.orchestrator-page` uses compact spacing, `.orchestrator-artifact-frame` is full-width with a desktop minimum height and border, and the phone media query reduces the frame minimum height without introducing horizontal overflow.

- [ ] **Step 2: Run RED verification**

Run: `npx vitest run tests/orchestrator-responsive.test.ts`

Expected: FAIL because the Orchestrator CSS selectors do not exist.

- [ ] **Step 3: Add minimal CSS**

Reuse Work Tracker's compact hero scale, add a framed full-width artifact region, and contain it at `max-width: 720px`.

- [ ] **Step 4: Run GREEN verification**

Run: `npx vitest run tests/orchestrator-responsive.test.ts tests/orchestrator-page.test.tsx tests/orchestrator-route.test.ts`

Expected: all tests pass.

### Task 4: Release gates and production acceptance

**Files:**
- Create: `docs/superpowers/evidence/2026-08-26-orchestrator-shell-alignment.md`

- [ ] **Step 1: Run complete local gates**

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`; record exact totals and exit statuses.

- [ ] **Step 2: Verify local requirements**

Confirm the diff only changes Orchestrator routing/presentation, tests, and evidence; confirm no secret or production data is included.

- [ ] **Step 3: Push and deploy**

Fast-forward the authorized commit to canonical `main`, then wait for Vercel Git integration to report success for the exact SHA.

- [ ] **Step 4: Run production browser acceptance**

Using the dedicated `402v-admin` browser profile, verify `/orchestrator` at desktop and 390×844 mobile: site header visible, peer links available, hero visible, artifact frame loaded, no page-level horizontal overflow, and no fresh console/runtime errors.

- [ ] **Step 5: Record evidence and final SHA**

Write the exact commit, deployment state, viewport checks, and non-mutation statement to the evidence file and push the evidence-only release commit.
