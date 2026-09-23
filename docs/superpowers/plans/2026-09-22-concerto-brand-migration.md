# Concerto Brand Migration Implementation Plan

> **Execution note:** Execute this plan task-by-task with test-driven development. Keep the branch isolated until all gates and independent review pass.

**Goal:** Rename the current user-facing Work Tracker product to `Concerto — Work & Collaboration System` everywhere it is presented as a product, without changing routes, behavior, data contracts, or historical records.

**Architecture:** Reuse the existing Work Tracker pages and Partitura brand-lockup styling. Add route metadata and replace product-level copy in shared navigation, page surfaces, accessibility labels, error states, current operator documentation, and release messages. Preserve `work-tracker` technical identifiers and `Work Item` domain terminology.

**Tech stack:** Next.js App Router, React, TypeScript, Vitest, Testing Library, repository release scripts.

---

## Task 1: Establish the visible brand contract

**Files:**
- Modify: `tests/work-tracker-page.test.tsx`
- Modify: `tests/app-shell.test.tsx`
- Create: `tests/concerto-brand.test.tsx`

1. Add failing assertions for the root heading `Concerto`, functional subtitle, slogan, route metadata, and global navigation label.
2. Assert `/work-tracker` remains the navigation target and the technical path eyebrow remains unchanged.
3. Run the focused files and confirm failures are limited to the old product name or missing metadata.
4. Commit the RED contract separately so the intended migration surface is reviewable.

## Task 2: Implement the product lockup and global navigation

**Files:**
- Modify: `app/work-tracker/page.tsx`
- Create: `app/work-tracker/layout.tsx`
- Modify: `components/layout/Header.tsx`
- Modify: `app/globals.css` only if the existing Partitura lockup classes cannot be reused safely

1. Change the product heading to `Concerto`.
2. Add `Work & Collaboration System` and `Where work and minds move in concert.` as readable text.
3. Add route-family metadata with the canonical product title and description.
4. Change the authenticated global navigation label to `Concerto`, preserving route and authorization behavior.
5. Change root page product-level availability errors and accessibility labels to `Concerto`.
6. Run the focused brand tests to GREEN.

## Task 3: Unify all current product-facing surfaces

**Files:**
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `components/observatory/ProjectControlView.tsx`
- Modify: `components/observatory/SourceStatus.tsx`
- Modify: `app/observatory/actions.ts`
- Modify: `lib/observatory/repository.ts`
- Modify the corresponding existing test files

1. Add or update failing assertions for board headings, accessible region/control/view names, breadcrumbs, return links, Project Control integration, status copy, and surfaced errors.
2. Replace only product-name occurrences with `Concerto`.
3. Use `Concerto items` where the UI describes product-bound units; retain `Work Item` where the domain object itself is named.
4. Keep component names, CSS classes, test IDs, paths, repository interfaces, mutations, and validation behavior unchanged.
5. Run all affected tests to GREEN.

## Task 4: Update current operator documentation and release copy

**Files:**
- Modify: `README.md`
- Modify: `docs/operations/work-tracker-release-channel.md`
- Modify: `docs/product/work-tracker-top-level-acceptance.md`
- Modify: `docs/product/work-tracker-project-filter-acceptance.md`
- Modify: `scripts/release/work-tracker-release-prepare.mjs`
- Modify: `scripts/release/work-tracker-approval-report.mjs`
- Modify corresponding release-script tests if current visible copy is asserted

1. Introduce `Concerto — Work & Collaboration System` at the first meaningful mention in each current document.
2. Preserve technical paths, npm commands, script filenames, database contracts, and historical evidence.
3. Update current product-facing release messages to `Concerto`; retain fixed repository identifiers and script names.
4. Run documentation/release-channel focused tests.

## Task 5: Run the reverse naming audit

**Files:**
- Review every remaining exact `Work Tracker` occurrence outside dependencies and generated build output
- Add a compact audit note to the design or implementation evidence only if classification cannot be inferred from context

1. Search source, current docs, tests, scripts, and fixtures for exact `Work Tracker`.
2. Classify each remaining occurrence as one of:
   - technical compatibility identifier;
   - immutable historical record;
   - canonical content or fixture value.
3. Remove or rename every remaining current product-level occurrence.
4. Search for `Concerto` and verify required surfaces are present exactly once or in the expected shared component.
5. Run `git diff --check` and inspect the exact diff for accidental route or identifier changes.

## Task 6: Verify the release candidate

**Files:**
- No additional production files unless verification exposes a defect

1. Run focused Concerto and affected Work Tracker tests.
2. Run `npm run release:verify`.
3. Start the isolated app with the existing environment loaded only into the process.
4. Verify `/work-tracker` and a Work Item detail on desktop and 390px mobile:
   - correct title, subtitle, slogan, navigation, breadcrumb, and return copy;
   - no horizontal overflow;
   - no page or console errors caused by this change;
   - routes and authorization unchanged.
5. Freeze the exact HEAD and request independent review against this Spec and plan.

## Task 7: Release through the existing channel

**Files:**
- Update governance source and Agenda only after production acceptance

1. Apply any independently verified review fixes with a new RED/GREEN cycle.
2. Re-run the complete gate on the exact reviewed HEAD.
3. Use `/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh` from the clean feature branch.
4. Wait for PR checks and Vercel Preview.
5. Request the single squash-merge authorization gate.
6. After merge, wait for exact-SHA GitHub Quality, Vercel Production, and `production-smoke`.
7. Update the Sinfonia brand source and Plato Agenda only after production acceptance.

## Definition of done

- `Concerto — Work & Collaboration System` is the only current user-facing product identity for this surface.
- The slogan appears on the root product page.
- No current product-level `Work Tracker` ambiguity remains.
- `/work-tracker`, Work Item behavior, authorization, database, API, schema, and release mechanics are unchanged.
- Focused tests, full release verification, browser acceptance, independent review, and production smoke pass on the exact released commit.
