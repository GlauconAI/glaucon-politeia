# Dashboard Navigation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repeated full-Snapshot work and excessive initial DOM creation when navigating among Dashboard, Projects, and Skills.

**Architecture:** Keep read authorization at each Dashboard data page, add a persistent Dashboard navigation layout, cache the validated Snapshot server-side for 60 seconds, and progressively mount large Inventory, Topology, and Skill-instance lists. Preserve the complete Snapshot, existing filters, admin-only access, and collector freshness.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Zod, Vitest, Testing Library.

---

### Task 1: Persistent Dashboard navigation and transition boundary

**Files:**
- Create: `app/dashboard/layout.tsx`
- Create: `app/dashboard/loading.tsx`
- Create: `components/observatory/DashboardRouteNav.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-dashboard-layout.test.tsx`
- Modify: `tests/observatory-page.test.tsx`
- Modify: `tests/observatory-directory-pages.test.tsx`

- [ ] **Step 1: Write failing layout tests**

Test that the layout renders persistent route links and an accessible loading
state while every child page continues to reject anonymous reads before loading
Snapshot data.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run tests/observatory-dashboard-layout.test.tsx tests/observatory-page.test.tsx tests/observatory-directory-pages.test.tsx
```

Expected: failures because the layout, route navigation, and loading state do
not exist.

- [ ] **Step 3: Implement the minimal shared boundary**

Create an async layout with stable links to `/dashboard`,
`/dashboard/projects`, and `/dashboard/skills`. Keep page-level administrator
checks so reused App Router layouts cannot become an authorization bypass. Add
an accessible `aria-busy="true"` loading skeleton.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused Vitest command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard app/globals.css components/observatory/DashboardRouteNav.tsx tests/observatory-dashboard-layout.test.tsx tests/observatory-page.test.tsx tests/observatory-directory-pages.test.tsx
git commit -m "perf: persist dashboard navigation shell"
```

### Task 2: Cache the validated Snapshot

**Files:**
- Modify: `lib/observatory/dashboard-state.ts`
- Create: `tests/observatory-dashboard-state.test.ts`
- Modify: `tests/observatory-page.test.tsx`

- [ ] **Step 1: Write failing loader tests**

Test a dependency-injected uncached loader for valid, missing, invalid, and
failed Snapshot reads. Test that the default cached loader uses
`createSupabaseAdminClient`, does not depend on request cookies, and registers a
60-second `unstable_cache` policy.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run tests/observatory-dashboard-state.test.ts tests/observatory-page.test.tsx
```

Expected: failure because the current loader creates a cookie-bound server
client on every invocation and has no cache boundary.

- [ ] **Step 3: Implement the cached server-only loader**

Expose:

```ts
export async function readObservatoryOverviewState(
  dependencies: ObservatoryOverviewDependencies,
): Promise<ObservatoryOverviewState>
```

Create the default dependency with `createSupabaseAdminClient()` and wrap the
default read in:

```ts
unstable_cache(readDefaultState, ["observatory-overview-v1"], {
  revalidate: 60,
  tags: ["observatory-overview"],
});
```

Keep the current safe empty/error messages and Zod validation unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/observatory/dashboard-state.ts tests/observatory-dashboard-state.test.ts tests/observatory-page.test.tsx
git commit -m "perf: cache validated observatory snapshot"
```

### Task 3: Bound initial Inventory and Topology rendering

**Files:**
- Modify: `components/observatory/SystemInventory.tsx`
- Modify: `components/observatory/SystemTopology.tsx`
- Modify: `app/globals.css`
- Modify: `tests/observatory-system-inventory.test.tsx`
- Modify: `tests/observatory-system-topology.test.tsx`

- [ ] **Step 1: Write failing progressive-render tests**

Create more than 40 fixture rows. Assert only 40 list items initially, the
heading still reports the complete filtered count, “Show 40 more” reveals the
next window, and changing a filter resets the window.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx vitest run tests/observatory-system-inventory.test.tsx tests/observatory-system-topology.test.tsx
```

Expected: both components currently render every matching row and have no
progressive control.

- [ ] **Step 3: Implement bounded windows**

Use a shared per-component constant of `40`, track `visibleCount`, slice the
filtered data before rendering, and reset the count when Inventory filters
change. Render the control only when hidden rows remain, with text that reports
the remaining count.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused command. Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/observatory/SystemInventory.tsx components/observatory/SystemTopology.tsx app/globals.css tests/observatory-system-inventory.test.tsx tests/observatory-system-topology.test.tsx
git commit -m "perf: progressively render observatory lists"
```

### Task 4: Mount Skill instances only on disclosure

**Files:**
- Modify: `components/observatory/SkillDirectory.tsx`
- Modify: `tests/observatory-skill-directory.test.tsx`

- [ ] **Step 1: Write a failing lazy-disclosure test**

Assert that Agent instance owners are absent from the result DOM before opening
the associated disclosure and appear after clicking its summary.

- [ ] **Step 2: Run the test and verify RED**

```bash
npx vitest run tests/observatory-skill-directory.test.tsx
```

Expected: failure because collapsed `<details>` currently contains all instance
rows in the DOM.

- [ ] **Step 3: Implement lazy instance mounting**

Track opened Skill keys in component state. On the details `toggle` event, add
or remove the key. Render `skill.instances` only when the key is open while
preserving native disclosure behavior and existing labels.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same focused command. Expected: all Skill directory tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/observatory/SkillDirectory.tsx tests/observatory-skill-directory.test.tsx
git commit -m "perf: lazy mount skill instances"
```

### Task 5: Performance regression and release verification

**Files:**
- Create: `tests/observatory-dashboard-performance.test.tsx`
- Modify only if a regression is found in the files above.

- [ ] **Step 1: Add production-scale DOM budget tests**

Load the sanitized production fixture already used by Observatory tests and
assert initial DOM budgets:

```ts
expect(document.querySelectorAll("*").length).toBeLessThan(5_000);
```

Use route-specific tests for Dashboard, Skills, and Projects with their accepted
5,000 / 3,000 / 2,000 limits.

- [ ] **Step 2: Verify the budget test fails against the old behavior**

Temporarily restore eager rendering in the affected component, run:

```bash
npx vitest run tests/observatory-dashboard-performance.test.tsx
```

Expected: Dashboard and Skills exceed their budgets. Restore the implementation
and rerun; expected: all budgets pass.

- [ ] **Step 3: Run all release gates**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: zero test failures, zero lint/type errors, successful production
build, and no whitespace errors.

- [ ] **Step 4: Commit regression coverage**

```bash
git add tests/observatory-dashboard-performance.test.tsx
git commit -m "test: enforce dashboard render budgets"
```

### Task 6: Review, merge, deploy, and production smoke

**Files:**
- No planned product-file changes.

- [ ] **Step 1: Review the complete branch**

Compare the branch with `origin/main`, inspect every changed file, and resolve
all critical or important review findings.

- [ ] **Step 2: Re-run release gates after review**

Run the full commands from Task 5 again. Expected: all pass.

- [ ] **Step 3: Merge without overwriting unrelated main-worktree changes**

Push the reviewed branch, fast-forward `main` through Git, and verify the
existing anonymous-post working-tree changes remain present and untouched.

- [ ] **Step 4: Deploy the exact pushed SHA**

Use the repository's existing Vercel prebuilt production workflow. Verify the
deployment reaches `READY` and the production alias is `https://402v.com`.

- [ ] **Step 5: Production smoke**

Verify anonymous requests to all three Dashboard routes redirect to auth with
their original return paths. Verify authenticated route navigation, immediate
loading feedback, bounded initial lists, and Skill disclosure behavior using an
available administrator browser session.

- [ ] **Step 6: Clean up**

Remove the completed worktree and branch only after the production deployment
and smoke checks pass.
