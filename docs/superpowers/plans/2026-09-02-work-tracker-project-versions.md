# Work Tracker Project Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship audited Project Version lifecycle management, Work Item version binding/filtering, preserved detail navigation, and remembered Project selection to 402v production.

**Architecture:** Add normalized admin-only Project Version tables and RPCs in Supabase, extend Work Items with a validated version foreign key, and load versions through the existing Observatory repository. Keep Project identity in the canonical registry, preserve existing Project Control plan revisions, and implement board/navigation preferences entirely in the Work Tracker client surface.

**Tech Stack:** PostgreSQL/Supabase SQL, Next.js 16 App Router, React 19, TypeScript 6, Zod 4, Vitest/Testing Library, Vercel.

---

## File map

- Create `supabase/migrations/20260902000200_work_tracker_project_versions.sql`: schema, backfill, RLS, RPCs and grants.
- Create `lib/observatory/project-versions.ts`: version types, status graph and input schemas.
- Create `components/observatory/ProjectVersionPicker.tsx`: Project-scoped version picker.
- Create `components/observatory/ProjectVersionManager.tsx`: create/edit/transition UI.
- Modify `lib/observatory/repository.ts`: rows, error mapping and version repository methods.
- Modify `lib/observatory/work-items.ts`: require `projectVersionId` in capture/update inputs.
- Modify `app/observatory/actions.ts`: version mutations and Work Item validation.
- Modify `app/work-tracker/page.tsx`: load versions and validate filters.
- Modify `app/work-tracker/items/[id]/page.tsx`: load versions and validate return context.
- Modify Work Tracker components and CSS for filtering, badges, capture/edit fields, manager and back link.
- Add/modify focused tests under `tests/` for every behavior.

### Task 1: Lock the Project Version domain and SQL contract

**Files:**
- Create: `lib/observatory/project-versions.ts`
- Create: `tests/observatory-project-versions.test.ts`
- Create: `tests/observatory-project-version-migration.test.ts`
- Create: `supabase/migrations/20260902000200_work_tracker_project_versions.sql`

- [ ] **Step 1: Write failing domain tests**

Test the exact statuses and transitions:

```ts
expect(allowedProjectVersionTransitions("planned")).toEqual(["active", "archived"])
expect(allowedProjectVersionTransitions("active")).toEqual(["released", "archived"])
expect(allowedProjectVersionTransitions("released")).toEqual(["archived"])
expect(allowedProjectVersionTransitions("archived")).toEqual([])
```

Also require trimmed `projectKey`, `versionLabel`, `title`, optional ISO date, UUID IDs and positive optimistic versions.

- [ ] **Step 2: Run RED tests**

Run: `npm test -- tests/observatory-project-versions.test.ts tests/observatory-project-version-migration.test.ts`

Expected: FAIL because the module and migration do not exist.

- [ ] **Step 3: Implement the domain module**

Export:

```ts
export const PROJECT_VERSION_STATUSES = ["planned", "active", "released", "archived"] as const
export type ProjectVersionStatus = (typeof PROJECT_VERSION_STATUSES)[number]
export function allowedProjectVersionTransitions(status: ProjectVersionStatus): ProjectVersionStatus[]
export const ProjectVersionCreateInputSchema: z.ZodType<...>
export const ProjectVersionUpdateInputSchema: z.ZodType<...>
export const ProjectVersionTransitionInputSchema: z.ZodType<...>
```

- [ ] **Step 4: Write the SQL migration**

The migration must create `observatory_project_versions`, `observatory_project_version_events`, add `project_version_id` to `observatory_work_items`, backfill per-Project Backlog rows, validate Project/version consistency in create/update RPCs, create admin-only version RPCs, enable RLS, revoke public access and grant only authenticated RPC execution.

- [ ] **Step 5: Run GREEN tests and commit**

Run the two focused files and `git diff --check`; commit `feat: add project version data model`.

### Task 2: Extend repository and server actions

**Files:**
- Modify: `lib/observatory/repository.ts`
- Modify: `lib/observatory/work-items.ts`
- Modify: `app/observatory/actions.ts`
- Modify: `tests/observatory-repository.test.ts`
- Modify: `tests/observatory-work-items.test.ts`
- Create: `tests/observatory-project-version-actions.test.ts`

- [ ] **Step 1: Write failing repository/input/action tests**

Require Work Item rows and RPC payloads to include `project_version_id`; verify list/create/update/transition Project Version methods; reject mismatched Project/version selections and expose friendly conflict/invalid-transition errors.

- [ ] **Step 2: Run RED tests**

Run: `npm test -- tests/observatory-repository.test.ts tests/observatory-work-items.test.ts tests/observatory-project-version-actions.test.ts`

- [ ] **Step 3: Implement repository and actions**

Add `ObservatoryProjectVersionRow`, repository methods, error mapping, action states and revalidation. Extend Work Item capture/update schemas with:

```ts
projectVersionId: z.uuid()
```

Before Work Item mutation, load the selected version and verify `version.project_key === projectRef` and `version.status !== "archived"`.

- [ ] **Step 4: Run GREEN tests and commit**

Run focused tests plus `npm run typecheck`; commit `feat: expose project version mutations`.

### Task 3: Add version picker and manager

**Files:**
- Create: `components/observatory/ProjectVersionPicker.tsx`
- Create: `components/observatory/ProjectVersionManager.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-project-version-picker.test.tsx`
- Create: `tests/observatory-project-version-manager.test.tsx`

- [ ] **Step 1: Write failing component tests**

Verify the picker only shows versions for the selected Project, includes Backlog, displays localized status text, and disables without a Project. Verify the manager creates planned versions, edits fields, shows only legal state actions and never offers delete.

- [ ] **Step 2: Run RED tests**

Run: `npm test -- tests/observatory-project-version-picker.test.tsx tests/observatory-project-version-manager.test.tsx`

- [ ] **Step 3: Implement accessible components and styles**

Use native labels/selects/forms/dialog semantics and existing Work Tracker drawer/feedback classes. Status labels are `计划中`, `进行中`, `已发布`, `已归档`.

- [ ] **Step 4: Run GREEN tests and commit**

Run focused tests, ESLint on the new components and `git diff --check`; commit `feat: manage work tracker project versions`.

### Task 4: Bind versions through capture, detail and cards

**Files:**
- Modify: `components/observatory/QuickCapture.tsx`
- Modify: `components/observatory/WorkTrackerCaptureDrawer.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `app/work-tracker/page.tsx`
- Modify: `app/work-tracker/items/[id]/page.tsx`
- Modify focused Work Tracker tests.

- [ ] **Step 1: Write failing integration/component tests**

Cover Project-then-Version capture, Project change clearing Version, detail edit binding, card badge `v0.2 · 进行中`, Backlog badge `待规划`, and Project-scoped exact-version filtering.

- [ ] **Step 2: Run RED tests**

Run all Work Tracker page/board/detail/capture focused tests and confirm failure for missing version behavior.

- [ ] **Step 3: Implement data flow**

Load versions with Work Items, pass them through page props, derive filtered versions by Project, add `projectVersionId` form fields, render version badges, and set/clear the `version` URL parameter with Project changes.

- [ ] **Step 4: Run GREEN tests and commit**

Run focused tests and `npm run typecheck`; commit `feat: bind work items to project versions`.

### Task 5: Preserve return context and remember the last Project

**Files:**
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `app/work-tracker/items/[id]/page.tsx`
- Create: `lib/observatory/work-tracker-navigation.ts`
- Create: `tests/observatory-work-tracker-navigation.test.ts`
- Modify: `tests/observatory-work-tracker-board.test.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`

- [ ] **Step 1: Write failing navigation/persistence tests**

Verify URL Project wins over stored Project, storage is used only when URL omits Project, stale values fall back to `all`, Project selection updates storage, card detail URLs carry validated Project/Version/view context, and the back link restores it.

- [ ] **Step 2: Run RED tests**

Run the three focused files and confirm the new expectations fail.

- [ ] **Step 3: Implement safe navigation helpers**

Use a namespaced key such as `work-tracker:last-project`. Catch storage access errors. Construct return URLs only from validated enums/known Project keys/known Version UUIDs; never accept an arbitrary return URL.

- [ ] **Step 4: Run GREEN tests and commit**

Run focused tests, TypeScript and `git diff --check`; commit `feat: preserve work tracker navigation context`.

### Task 6: Full verification, review and production release

**Files:**
- Modify: `README.md` or canonical Work Tracker handbook only if the user-facing behavior requires documentation.
- Create: `docs/superpowers/evidence/2026-09-02-work-tracker-project-versions-release.md`

- [ ] **Step 1: Run complete local gates**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: zero failures/errors and successful production build.

- [ ] **Step 2: Request independent code review**

Review the complete diff from `origin/main` to feature HEAD; fix every Critical/Important finding and rerun affected tests.

- [ ] **Step 3: Integrate exact verified commits**

Push the feature branch, merge through the repository's normal main workflow, fetch main and verify the released commit contains the exact migration and application changes.

- [ ] **Step 4: Apply Supabase migration**

Use the existing `supabase-ops.mjs` workflow. Verify tables, columns, constraints, RLS, functions, grants, Backlog rows and existing Item bindings before application deployment.

- [ ] **Step 5: Deploy and accept production**

Build/deploy with the existing Vercel workflow. In the authenticated `402v-admin` browser profile, verify desktop and mobile flows: create/manage a version, assign/filter an Item, observe card badge, return with filters preserved, reload to restore Project selection, and confirm no console/runtime errors.

- [ ] **Step 6: Record evidence and close**

Record commit, migration, deployment and acceptance evidence without secrets or private content; rerun a final production-safe readback before reporting completion.
