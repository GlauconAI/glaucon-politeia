# Sinfonia Brand and Functional Names v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved Partitura and Concerto functional subtitles while preserving all technical compatibility contracts.

**Architecture:** Keep existing routes and components. Change only user-visible subtitle and metadata contracts, then synchronize the external Sinfonia brand foundation. Tests explicitly preserve the brand names, slogans, and technical routes.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Testing Library, Vercel.

---

### Task 1: Lock the approved display contracts

**Files:**
- Modify: `tests/observatory-dashboard-layout.test.tsx`
- Modify: `tests/concerto-brand.test.ts`
- Modify: `tests/work-tracker-page.test.tsx`

- [ ] Change Partitura metadata and rendered subtitle expectations to `AI System Handbook`.
- [ ] Change Concerto metadata and rendered subtitle expectations to `Work Tracker`.
- [ ] Run the focused tests and verify they fail only on the old subtitles.
- [ ] Commit the failing contracts.

### Task 2: Implement the minimal product copy change

**Files:**
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/work-tracker/layout.tsx`
- Modify: `app/work-tracker/page.tsx`

- [ ] Replace the Partitura functional subtitle and metadata title.
- [ ] Replace the Concerto functional subtitle and metadata title.
- [ ] Run the focused tests and verify all pass.
- [ ] Audit current application code for competing product subtitles while preserving routes and technical identifiers.
- [ ] Commit the implementation.

### Task 3: Synchronize brand documentation and verify the candidate

**Files:**
- Modify outside repository: `plato-academy/projects/openclaw-orchestrator/sinfonia-brand-foundation-v1.md`
- Modify outside repository: `plato-academy/agenda.md`
- Modify outside repository: `plato-academy/agenda-changelog.md`

- [ ] Add the brand/functional-name rule and canonical mapping to the brand foundation.
- [ ] Replace Partitura and Concerto definitions with the approved wording.
- [ ] Run focused tests and `npm run release:verify`.
- [ ] Perform authenticated desktop and 390px mobile browser acceptance.
- [ ] Request independent review of the frozen candidate.

### Task 4: Release and production acceptance

**Files:**
- No source changes after candidate freeze.

- [ ] Use the host-owned release prepare entry to create the PR.
- [ ] Wait for GitHub Quality and Vercel Preview on the exact candidate SHA.
- [ ] Squash merge after the authorized release gate.
- [ ] Wait for exact merge SHA Production deployment and production smoke.
- [ ] Verify `/dashboard` and `/work-tracker` show the approved subtitles on desktop and mobile.
- [ ] Record the production SHA and close the Agenda item.
