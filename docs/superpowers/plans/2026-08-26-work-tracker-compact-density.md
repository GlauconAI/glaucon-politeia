# Work Tracker Compact Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate Work Tracker framing and apply a compact, coherent visual hierarchy to the page toolbar, tabs, cards, claim label, and action menu.

**Architecture:** Keep all workflow and data behavior inside the existing `WorkTrackerBoard`; change only its presentation structure and the reusable Project picker display contract. Scope the typography and spacing rules under Work Tracker classes so other Observatory surfaces keep their current density.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS, Vitest, Testing Library, agent-browser.

---

### Task 1: Lock the compact board contract with failing tests

**Files:**
- Modify: `tests/observatory-work-tracker-board.test.tsx`

- [ ] **Step 1: Write the failing structural test**

Add assertions that the board no longer renders the inner `Daily write surface`, `Work Tracker` level-two heading, or audit implementation copy; that `Work Tracker controls` contains `2 of 2 items`; and that `Projects available` is absent from the board filter.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/observatory-work-tracker-board.test.tsx`

Expected: FAIL because the duplicate heading/copy still render and the compact toolbar does not exist.

### Task 2: Implement the compact toolbar contract

**Files:**
- Modify: `components/observatory/CanonicalProjectPicker.tsx`
- Modify: `components/observatory/WorkTrackerBoard.tsx`

- [ ] **Step 1: Add an optional availability-count contract**

Add `showAvailabilityCount?: boolean` to `CanonicalProjectPickerProps`, default it to `true`, and render the `<small>` count only when the registry is available and the option is true. Registry errors remain visible regardless of the option.

- [ ] **Step 2: Replace duplicate framing with one toolbar**

Remove the board-level `observatory-panel-heading` and `observatory-panel-copy`. Render:

```tsx
<div className="work-tracker-toolbar" role="group" aria-label="Work Tracker controls">
  <div className="work-tracker-filter">...</div>
  <span className="work-tracker-item-count">
    {filteredItems.length} of {state.items.length} items
  </span>
</div>
```

Pass `showAvailabilityCount={false}` to the board filter picker. Keep error-state framing unchanged because it needs its own recovery context.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `npm test -- tests/observatory-work-tracker-board.test.tsx`

Expected: all focused tests pass.

### Task 3: Apply the Work Tracker density scale

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Compact the page hero and board shell**

Scope Work Tracker hero adjustments under `.work-tracker-page` and reduce board padding to 14px. Cap the page title at 36px and reduce its supporting copy/status badges without changing generic Observatory pages.

- [ ] **Step 2: Lay out the toolbar**

Use a flex toolbar with two bounded Project columns (`200–250px` search and `230–300px` select), 36px controls, and a right-aligned 11px Item count. Remove the old filter max-width and margin that created a separate row.

- [ ] **Step 3: Compact tabs, columns, cards, badges, and menus**

Apply the design scale: 13px/32px tabs, 14px columns, 13px card titles, 10px/20px badges, 26×24px three-dot trigger, and 12px/30px menu actions. Set the claim badge font size explicitly so `Manual` no longer inherits body text.

- [ ] **Step 4: Preserve responsive containment**

At 720px and below, stack the toolbar and Project picker, keep the count readable, retain the full-screen capture drawer, and preserve internal board scrolling.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/observatory-work-tracker-board.test.tsx tests/observatory-work-tracker-page.test.tsx`

Expected: all focused tests pass.

### Task 4: Verify, release, and accept production

**Files:**
- Create: `docs/superpowers/evidence/2026-08-26-work-tracker-compact-density.md`

- [ ] **Step 1: Run release gates**

Run: `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`.

Expected: zero failures/errors and successful production build.

- [ ] **Step 2: Commit and push the exact reviewed diff**

Review `git diff --check`, confirm no unrelated files changed, commit the implementation and evidence, and fast-forward the authorized branch to `origin/main`.

- [ ] **Step 3: Verify deployment**

Confirm GitHub `main`, Vercel deployment readiness, and the `402v.com` production alias resolve to the new commit.

- [ ] **Step 4: Run browser acceptance**

Using a named agent-browser session with the dedicated `402v-admin` profile, verify at 1280px and 390×844: one page title only, toolbar/count layout, control height, tab/card/menu density, `Manual` readability, internal board scrolling, and zero console/runtime errors. Do not mutate production Items.

- [ ] **Step 5: Record evidence and close the self-owned Work**

Write exact commands, commit/deployment identifiers, viewport measurements, and browser observations to the evidence file, re-run `git diff --check`, then close the Work as completed.

