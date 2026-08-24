# Dashboard Hydration #418 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dashboard server and client markup deterministic across UTC and America/Vancouver and verify Quick Capture's visible submit path.

**Architecture:** Preserve the current SSR and component boundaries. Add a real React SSR-to-hydrate regression harness that changes the host time zone between renders, then pin the two implicit operational date formatters to UTC. Extend Quick Capture coverage to activate the visible submit button.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, JSDOM

---

### Task 1: Add hydration and submit-path regression tests

**Files:**
- Create: `tests/observatory-dashboard-hydration.test.tsx`
- Modify: `tests/observatory-quick-capture.test.tsx`

- [ ] **Step 1: Write the failing hydration test**

Create a JSDOM hydration helper that renders with `process.env.TZ = "UTC"`,
hydrates with `process.env.TZ = "America/Vancouver"`, captures `console.error`,
and asserts that no message contains `Hydration failed` or `didn't match`.
Exercise both components with an instant that crosses the local date boundary:

```tsx
const boundaryInstant = "2026-07-23T04:30:00.000Z";

async function expectTimeZoneStableHydration(ui: ReactElement) {
  process.env.TZ = "UTC";
  const html = renderToString(ui);
  document.body.innerHTML = `<div id="hydration-root">${html}</div>`;
  process.env.TZ = "America/Vancouver";
  const messages: string[] = [];
  const error = vi.spyOn(console, "error").mockImplementation((...args) => {
    messages.push(args.map(String).join(" "));
  });
  const container = document.getElementById("hydration-root");
  if (!container) throw new Error("Hydration root missing.");
  let root!: Root;
  await act(async () => {
    root = hydrateRoot(container, ui);
    await Promise.resolve();
  });
  expect(messages.join("\n")).not.toMatch(/hydration failed|didn't match/iu);
  await act(async () => root.unmount());
  error.mockRestore();
}
```

Use a single-repository `ObservatorySourceRepositoryInventory` and a
single-project `DashboardProjectEntry` whose timestamps equal
`boundaryInstant`.

- [ ] **Step 2: Add the visible Quick Capture button test**

In `tests/observatory-quick-capture.test.tsx`, render with a mocked action,
fill the title, click `Capture work item`, then assert one action call, the
submitted title and idempotency key, and the success status:

```tsx
fireEvent.change(screen.getByLabelText("Title"), {
  target: { value: "Hydration regression" },
});
fireEvent.click(
  screen.getByRole("button", { name: /capture work item/i }),
);
expect(await screen.findByRole("status")).toHaveTextContent(
  /captured in inbox/i,
);
expect(action).toHaveBeenCalledTimes(1);
expect((action.mock.calls[0][1] as FormData).get("title")).toBe(
  "Hydration regression",
);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/observatory-dashboard-hydration.test.tsx tests/observatory-quick-capture.test.tsx
```

Expected: the Quick Capture test passes, while the hydration tests fail with a
server/client date-text mismatch for both components.

- [ ] **Step 4: Commit the regression tests**

```bash
git add tests/observatory-dashboard-hydration.test.tsx tests/observatory-quick-capture.test.tsx
git commit -m "test: reproduce dashboard hydration mismatch"
```

### Task 2: Make operational timestamp rendering deterministic

**Files:**
- Modify: `components/observatory/SourceRepositoryInventory.tsx`
- Modify: `components/observatory/ProjectDirectory.tsx`
- Test: `tests/observatory-dashboard-hydration.test.tsx`

- [ ] **Step 1: Pin repository timestamps to UTC**

```tsx
new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
}).format(date);
```

- [ ] **Step 2: Pin Project recent-activity dates to UTC**

```tsx
new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeZone: "UTC",
}).format(date);
```

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/observatory-dashboard-hydration.test.tsx tests/observatory-quick-capture.test.tsx tests/observatory-source-repository-inventory.test.tsx tests/observatory-project-directory.test.tsx
```

Expected: all focused tests pass with no hydration mismatch output.

- [ ] **Step 4: Commit the minimal implementation**

```bash
git add components/observatory/SourceRepositoryInventory.tsx components/observatory/ProjectDirectory.tsx
git commit -m "fix: stabilize dashboard hydration timestamps"
```

### Task 3: Verify, publish, and close the Work Tracker items

**Files:**
- Modify: `docs/product/dashboard-hydration-418-acceptance.md`

- [ ] **Step 1: Run complete verification**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: 0 failures, 0 lint errors, 0 TypeScript errors, and all production
routes build successfully.

- [ ] **Step 2: Record acceptance evidence**

Document root cause, Red/Green evidence, complete command results, browser
console checks, exact commit, deployment, rollback, and Work Tracker outcomes
in `docs/product/dashboard-hydration-418-acceptance.md`.

- [ ] **Step 3: Commit acceptance evidence**

```bash
git add docs/product/dashboard-hydration-418-acceptance.md
git commit -m "docs: accept dashboard hydration fix"
```

- [ ] **Step 4: Fast-forward and deploy**

Verify the remote `main` head is the accepted P0-A commit, push the exact fix
head to `main`, and deploy that commit through the existing Vercel project.

- [ ] **Step 5: Browser verification**

At desktop and mobile widths, verify `/dashboard`, `/dashboard/projects`,
`/dashboard/decisions`, and an existing Work Item route. Require zero React
hydration errors, no horizontal overflow, working route navigation, and normal
Quick Capture button/keyboard submission when an existing user-operated admin
session is available.

- [ ] **Step 6: Update Work Tracker**

Move the canonical-main reconciliation item and React #418 Bug through Review
to Done with the GitHub commit and production URL as evidence. Do not activate
Agent Claim.
