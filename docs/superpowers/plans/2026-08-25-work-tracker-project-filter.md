# Work Tracker Canonical Project Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Work Item use a canonical Project selection while keeping an all-Project default board with searchable filtering and prominent Project badges.

**Architecture:** Build Project options directly from the validated Observatory registry, share one accessible Project picker across board, Quick Capture, and Item detail, and validate submitted Project keys again in server actions. Reuse `project_ref` for the canonical key and extend only the Quick Capture RPC; formal Project Control binding remains independent and must agree with the selected Project.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Supabase PostgreSQL RPCs, Vitest, Testing Library.

---

### Task 1: Canonical Project option and resolution contract

**Files:**
- Create: `lib/observatory/work-tracker-projects.ts`
- Create: `tests/observatory-work-tracker-projects.test.ts`
- Modify: `lib/observatory/work-items.ts`
- Modify: `tests/observatory-work-items.test.ts`

- [ ] **Step 1: Write failing pure contract tests**

Cover registry-to-option sorting, exact key resolution, legacy title resolution, formal binding precedence, unknown references, and search across title/key/owner/status. Add schema cases requiring `projectRef` for Quick Capture and Item updates, plus a mismatch failure when formal binding `projectKey` differs from `projectRef`.

```ts
expect(resolveWorkItemProject(item, projects)).toEqual({
  projectKey: "plato/dashboard",
  title: "Dashboard",
});
expect(
  ObservatoryQuickCaptureInputSchema.safeParse({
    ...validQuickCapture(),
    projectRef: "",
  }).success,
).toBe(false);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/observatory-work-tracker-projects.test.ts tests/observatory-work-items.test.ts
```

Expected: FAIL because the Project option module and required schema fields do not exist.

- [ ] **Step 3: Implement minimal Project contract**

Create:

```ts
export type WorkTrackerProjectOption = {
  projectKey: string;
  title: string;
  owner: string;
  status: string;
};

export function buildWorkTrackerProjectOptions(
  registry: ObservatoryRegistrySnapshot,
): WorkTrackerProjectOption[];

export function resolveWorkItemProject(
  item: Pick<ObservatoryWorkItemRow, "project_ref" | "project_key">,
  projects: WorkTrackerProjectOption[],
): WorkTrackerProjectOption | null;

export function matchesWorkTrackerProject(
  project: WorkTrackerProjectOption,
  query: string,
): boolean;
```

Require trimmed `projectRef` in both mutation schemas. In the update schema, add a custom issue on `projectRef` when a complete Project Control binding names a different Project.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same command and expect both files to pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/observatory/work-tracker-projects.ts lib/observatory/work-items.ts tests/observatory-work-tracker-projects.test.ts tests/observatory-work-items.test.ts
git commit -m "feat: define canonical work tracker projects"
```

### Task 2: Accessible shared Project picker

**Files:**
- Create: `components/observatory/CanonicalProjectPicker.tsx`
- Create: `tests/observatory-project-picker.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing picker tests**

Prove that search filters by Chinese title and canonical key, `All Projects` is optional, current selection remains present while search changes, required forms expose an empty prompt, and an empty registry announces an unavailable state.

```tsx
render(
  <CanonicalProjectPicker
    id="project"
    label="Project"
    projects={projects}
    value="all"
    onChange={onChange}
    allowAll
  />,
);
fireEvent.change(screen.getByLabelText("Search Project"), {
  target: { value: "dashboard" },
});
expect(screen.getByRole("option", { name: /Dashboard/ })).toBeInTheDocument();
```

- [ ] **Step 2: Run the picker test and verify RED**

Run:

```bash
npm test -- tests/observatory-project-picker.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the picker and bounded styling**

Use controlled search and `<select>`, keep the selected option in the rendered option list, and emit canonical keys only. Add focused `.work-tracker-project-picker` styles without changing unrelated Dashboard controls.

- [ ] **Step 4: Run the picker test and verify GREEN**

Run the same test and expect it to pass with no accessibility warnings.

- [ ] **Step 5: Commit Task 2**

```bash
git add components/observatory/CanonicalProjectPicker.tsx tests/observatory-project-picker.test.tsx app/globals.css
git commit -m "feat: add canonical project picker"
```

### Task 3: All-Project board filter and Project badges

**Files:**
- Modify: `app/work-tracker/page.tsx`
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `tests/observatory-work-tracker-board.test.tsx`
- Modify: `tests/work-tracker-top-level-route.test.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing board and route tests**

Add two Projects and two Items. Assert the default renders both, selecting one Project filters every column and total count, the URL becomes `?project=<key>`, unknown initial keys fall back to `all`, and each card exposes `Project: <title>` as a badge with Milestone separate.

```tsx
expect(screen.getByText("2 items")).toBeInTheDocument();
fireEvent.change(screen.getByLabelText("Project"), {
  target: { value: "plato/dashboard" },
});
expect(screen.getByText("1 item")).toBeInTheDocument();
expect(screen.getByText("Project: Dashboard")).toHaveClass(
  "work-tracker-project-badge",
);
```

- [ ] **Step 2: Run board tests and verify RED**

Run:

```bash
npm test -- tests/observatory-work-tracker-board.test.tsx tests/work-tracker-top-level-route.test.ts
```

Expected: FAIL because the board has no Projects prop, filter, URL state, or badge.

- [ ] **Step 3: Load registry options and implement filtering**

Load `loadObservatoryOverviewState()` beside Items/Claims, build options with `buildWorkTrackerProjectOptions`, parse `searchParams.project`, and pass a validated initial key. In the client board, filter Items through `resolveWorkItemProject`, calculate counts from the filtered set, update the URL with `history.replaceState`, and render the badge plus legacy fallback.

- [ ] **Step 4: Run board tests and verify GREEN**

Run the same command and expect both files to pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add app/work-tracker/page.tsx components/observatory/WorkTrackerBoard.tsx tests/observatory-work-tracker-board.test.tsx tests/work-tracker-top-level-route.test.ts app/globals.css
git commit -m "feat: filter work tracker by project"
```

### Task 4: Required canonical Project in Quick Capture

**Files:**
- Modify: `components/observatory/QuickCapture.tsx`
- Modify: `app/observatory/actions.ts`
- Modify: `lib/observatory/repository.ts`
- Create: `supabase/migrations/20260826000100_work_tracker_project_capture.sql`
- Modify: `tests/observatory-quick-capture.test.tsx`
- Modify: `tests/observatory-actions.test.ts`
- Modify: `tests/observatory-repository.test.ts`
- Modify: `tests/observatory-migration.test.ts`

- [ ] **Step 1: Write failing create-path tests**

Require the picker in Quick Capture, preserve its value after successful capture, include `projectRef` in action/repository inputs, reject missing or unknown keys before RPC, and assert the migration stores/audits Project and includes it in idempotency comparison.

```ts
expect(mocks.createQuickCapture).toHaveBeenCalledWith(
  expect.objectContaining({ projectRef: "plato/dashboard" }),
);
expect(rpc).toHaveBeenCalledWith(
  "create_observatory_work_item",
  expect.objectContaining({ p_project_ref: "plato/dashboard" }),
);
```

- [ ] **Step 2: Run create-path tests and verify RED**

Run:

```bash
npm test -- tests/observatory-quick-capture.test.tsx tests/observatory-actions.test.ts tests/observatory-repository.test.ts tests/observatory-migration.test.ts
```

Expected: FAIL because `projectRef` is not rendered, validated, or sent to the RPC.

- [ ] **Step 3: Implement UI, server validation, repository call, and migration**

Pass Projects to Quick Capture, render the required shared picker, and retain the selected Project after success. Add a server helper that loads the validated registry and returns a field error for an unknown key. Extend the repository RPC arguments with `p_project_ref`. Replace the four-argument SQL create function with a five-argument function that normalizes Project, stores it, audits it, and compares it during idempotency conflict handling.

- [ ] **Step 4: Run create-path tests and verify GREEN**

Run the same command and expect all four files to pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add components/observatory/QuickCapture.tsx app/observatory/actions.ts lib/observatory/repository.ts supabase/migrations/20260826000100_work_tracker_project_capture.sql tests/observatory-quick-capture.test.tsx tests/observatory-actions.test.ts tests/observatory-repository.test.ts tests/observatory-migration.test.ts
git commit -m "feat: require project during work capture"
```

### Task 5: Canonical Project editing and binding consistency

**Files:**
- Modify: `app/work-tracker/items/[id]/page.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`
- Modify: `tests/observatory-work-item-page.test.tsx`
- Modify: `tests/observatory-actions.test.ts`

- [ ] **Step 1: Write failing detail tests**

Assert that Project is a canonical selector rather than a textbox, legacy `Dashboard` resolves to `plato/dashboard`, selecting a formal binding synchronizes the Project, unknown Projects fail before repository update, and unavailable registry state preserves the Item while preventing an unsafe Project change.

- [ ] **Step 2: Run detail tests and verify RED**

Run:

```bash
npm test -- tests/observatory-work-item-detail.test.tsx tests/observatory-work-item-page.test.tsx tests/observatory-actions.test.ts
```

Expected: FAIL because detail still accepts free text and the update action does not validate canonical membership.

- [ ] **Step 3: Implement detail selection and server enforcement**

Build Projects on the detail page, pass them to `WorkItemDetail`, resolve the current value through the compatibility resolver, synchronize a selected binding, and reuse the server registry validation before `updateWorkItem`.

- [ ] **Step 4: Run detail tests and verify GREEN**

Run the same command and expect all three files to pass.

- [ ] **Step 5: Commit Task 5**

```bash
git add 'app/work-tracker/items/[id]/page.tsx' components/observatory/WorkItemDetail.tsx tests/observatory-work-item-detail.test.tsx tests/observatory-work-item-page.test.tsx tests/observatory-actions.test.ts
git commit -m "feat: enforce canonical project editing"
```

### Task 6: Documentation and release verification

**Files:**
- Create: `docs/product/work-tracker-project-filter-acceptance.md`
- Modify: `docs/product/work-tracker-top-level-acceptance.md`
- Modify: `docs/superpowers/specs/2026-08-25-work-tracker-project-filter-design.md`

- [ ] **Step 1: Run focused Work Tracker tests**

```bash
npm test -- tests/observatory-work-tracker-projects.test.ts tests/observatory-project-picker.test.tsx tests/observatory-work-tracker-board.test.tsx tests/observatory-quick-capture.test.tsx tests/observatory-work-item-detail.test.tsx tests/observatory-actions.test.ts tests/observatory-repository.test.ts tests/observatory-migration.test.ts tests/work-tracker-top-level-route.test.ts tests/observatory-work-item-page.test.tsx
```

Expected: all focused files and tests pass.

- [ ] **Step 2: Run static and production gates**

```bash
npm run lint
npm run typecheck
git diff --check origin/main...HEAD
npm run build
```

Expected: every command exits 0; build includes `/work-tracker` and `/work-tracker/items/[id]`.

- [ ] **Step 3: Run stable full suite and isolate unrelated timeouts if necessary**

```bash
npm test -- --maxWorkers=1 --fileParallelism=false
```

Expected: 801/801 pass. If the two known HTML Note Kit child-process files time out under host load, preserve the full result and rerun those exact files in isolation before making any claim.

- [ ] **Step 4: Perform local authenticated browser acceptance**

Verify desktop and 390px mobile behavior: default all-Project board, Project search/filter, badge visibility, URL persistence, required Quick Capture selector, exact one-Item creation, detail selector, version conflict behavior, zero console/runtime errors, and no new page-level horizontal overflow.

- [ ] **Step 5: Write acceptance evidence and commit**

Record exact test counts, commands, browser sizes, created test Item cleanup disposition, migration contract, known limitations, and rollback boundary.

```bash
git add docs/product/work-tracker-project-filter-acceptance.md docs/product/work-tracker-top-level-acceptance.md docs/superpowers/specs/2026-08-25-work-tracker-project-filter-design.md
git commit -m "docs: record project filter acceptance"
```

- [ ] **Step 6: Stop at the release authorization gate**

Report the final commit SHA and verification evidence. Do not push `main`, apply the Supabase migration, or deploy 402v until the User explicitly authorizes the exact release.
