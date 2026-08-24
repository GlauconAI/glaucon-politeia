# 402V Project Control P0-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fixture-proven, production-safe Observatory v6 Project Control consumer with Project/Decision views and non-authoritative Work Tracker bindings.

**Architecture:** Add a separate strict `ProjectControlSnapshot 1.0.0` beside Project execution v1, then carry it through an explicit bounded collector into a backward-compatible Observatory v6 envelope. Render read-only Project authority from the Snapshot; keep Work Tracker execution state in Supabase and bind it through four stable references that can never mutate Stage or Gate state.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zod 4, Supabase/Postgres, Vitest, Testing Library, existing 402V CSS and Observatory scripts.

---

## File map

Create:

- `lib/observatory/project-control-schema.ts` — strict public schema, invariants, digest, and types.
- `lib/observatory/project-control-collector.ts` — explicit bounded file collector and source health.
- `lib/observatory/project-control.ts` — selectors, topological ordering, decision groups, binding classification.
- `components/observatory/ProjectControlView.tsx` — Project detail UI.
- `components/observatory/ProjectDecisionCenter.tsx` — cross-Project decision UI.
- `app/dashboard/projects/[projectSlug]/page.tsx` and `app/dashboard/decisions/page.tsx`.
- `supabase/migrations/20260823000100_project_control_work_item_binding.sql`.
- `tests/fixtures/project-control/asgard-plan-v3.ts` and focused tests.
- `docs/product/project-control-p0-a-acceptance.md`.

Modify:

- `package.json` internal imports.
- Observatory asset/collection/collector/options/state/publisher/retention files for v6.
- Project portfolio, navigation, Work Tracker domain/repository/actions/components, and `app/globals.css`.
- Existing compatibility, privacy, migration, route, responsive, and Claim Engine tests.

## Task 1: Strict Project Control projection

**Files:**

- Create: `lib/observatory/project-control-schema.ts`
- Create: `tests/fixtures/project-control/asgard-plan-v3.ts`
- Create: `tests/observatory-project-control-schema.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing schema tests**

Cover valid Asgard v3 plus unknown fields, unsafe text, duplicates, dangling references, cycles, transfer semantics, summary/revision/admission drift, single-current Artifact, Verification/Gate/Decision invariants, and digest mismatch.

```ts
it("accepts the exact Asgard v3 projection", () => {
  const snapshot = asgardProjectControlFixture();
  expect(ProjectControlSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  expect(computeProjectControlDigest(snapshot)).toBe(snapshot.digest);
});

it("rejects a Stage cycle", () => {
  const snapshot = asgardProjectControlFixture();
  snapshot.projects[0].stages[0].dependency_ids = ["stage-10"];
  expect(ProjectControlSnapshotSchema.safeParse(snapshot).success).toBe(false);
});
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/observatory-project-control-schema.test.ts`

Expected: FAIL because the schema module does not exist.

- [ ] **Step 3: Implement strict schemas and digest**

Use shared `containsAbsoluteOrPrivatePath`, strict objects, bounded arrays, closed enums, ID/reference resolution, DAG checks, summary checks, and canonical SHA-256.

```ts
export const ProjectControlSnapshotSchema = z
  .strictObject({
    schema_version: z.literal("1.0.0"),
    collected_at: IsoTimestampSchema,
    summary: ProjectControlSummarySchema,
    projects: z.array(ProjectControlProjectSchema).max(128),
    digest: Sha256Schema,
  })
  .superRefine(validateProjectControlSnapshot);
```

- [ ] **Step 4: Build exact safe Asgard fixture**

Encode approved Plan v3, historical 01–04D, independent 05A/05B, blocked 06A–06C, planned 07–10, Gate 2, and Gate 3 requirements without paths or Work/session IDs.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/observatory-project-control-schema.test.ts tests/observatory-project-execution-schema.test.ts tests/observatory-privacy-scan.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json lib/observatory/project-control-schema.ts tests/fixtures/project-control/asgard-plan-v3.ts tests/observatory-project-control-schema.test.ts
git commit -m "feat: define project control projection"
```

## Task 2: Bounded collector and Observatory v6

**Files:**

- Create: `lib/observatory/project-control-collector.ts`
- Create: `tests/observatory-project-control-collector.test.ts`
- Modify: `lib/observatory/asset-schema.ts`, `collection-schema.ts`, `collector.ts`, `collect-options.ts`, and related tests

- [ ] **Step 1: Write failing collector/v6 tests**

Test the exact configured file, path escape, 10 MiB limit, strict parse, digest mismatch, null/unknown missing source, stale source, and v1–v5 compatibility.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/observatory-project-control-collector.test.ts tests/observatory-collection-schema.test.ts tests/observatory-collector.test.ts`

Expected: FAIL because the collector and v6 do not exist.

- [ ] **Step 3: Implement collector**

Mirror the proven Project execution collector, read only `project-control-snapshot.json`, and return sanitized `PROJECT_CONTROL_*` errors.

- [ ] **Step 4: Add v6 envelope**

```ts
export const ObservatoryCollectionEnvelopeV6Schema = z.strictObject({
  schema_version: z.literal("6.0.0"),
  collector_version: z.literal("6.0.0"),
  ...CollectionEnvelopeBaseShape,
  ...ObservatoryAssetInventorySchema.shape,
  delivery_governance: DeliveryGovernanceSchema,
  source_repositories: ObservatorySourceRepositoryInventorySchema,
  project_executions: ProjectExecutionSnapshotSchema.nullable(),
  project_controls: ProjectControlSnapshotSchema.nullable(),
});
```

- [ ] **Step 5: Run GREEN and lifecycle regressions**

Run: `npx vitest run tests/observatory-project-control-collector.test.ts tests/observatory-collection-schema.test.ts tests/observatory-collector.test.ts tests/observatory-refresh-state.test.ts tests/observatory-publisher.test.ts tests/observatory-retention.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json lib/observatory tests
git commit -m "feat: collect project control snapshots"
```

## Task 3: Pure selectors and binding classification

**Files:**

- Create: `lib/observatory/project-control.ts`
- Create: `tests/observatory-project-control.test.ts`
- Modify: `lib/observatory/dashboard-directory.ts`

- [ ] **Step 1: Write failing tests**

Cover slug lookup, stable topological Stage ordering, critical path, next admission, ledger/decision groups, and `matched`, `stale_revision`, `unknown_project`, `unknown_stage`, `unknown_work_package`, `control_source_unavailable` bindings.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/observatory-project-control.test.ts`

Expected: FAIL because selectors do not exist.

- [ ] **Step 3: Implement pure selectors**

Order/group only validated producer facts. Do not derive canonical Stage status.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/observatory-project-control.test.ts tests/observatory-dashboard-directory.test.ts`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/observatory/project-control.ts lib/observatory/dashboard-directory.ts tests/observatory-project-control.test.ts
git commit -m "feat: derive project control views"
```

## Task 4: Project portfolio and detail view

**Files:**

- Create: `components/observatory/ProjectControlView.tsx`
- Create: `app/dashboard/projects/[projectSlug]/page.tsx`
- Create: Project Control view/page tests
- Modify: `ProjectExecutionPortfolio.tsx`, Projects page, and `app/globals.css`

- [ ] **Step 1: Write failing semantic UI tests**

Assert objective/authority/revision/freshness, current Stage/Gate, next admission, owners/controllers, dependencies, critical path, Artifact/Verification/Gate ledgers, Work Packages, Decision/Outcome history, stale/empty/unavailable/unmatched states, and admin redirect.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/observatory-project-control-view.test.tsx tests/observatory-project-control-page.test.tsx`

Expected: FAIL because the component/route do not exist.

- [ ] **Step 3: Implement the detail view**

Use semantic topological lists and explicit `Depends on` / `Unlocks` text. The route authorizes first and reads only the latest validated Snapshot.

- [ ] **Step 4: Adapt portfolio cards**

Keep compact execution lanes; add control facts and links only for matched control records.

- [ ] **Step 5: Add responsive CSS**

Desktop uses bounded lanes/connectors. Around 390px use one card column, no canvas, no page overflow.

- [ ] **Step 6: Run GREEN**

Run: `npx vitest run tests/observatory-project-control-view.test.tsx tests/observatory-project-control-page.test.tsx tests/observatory-project-execution-view.test.tsx tests/observatory-dashboard-responsive.test.ts tests/observatory-directory-pages.test.tsx`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/dashboard/projects components/observatory app/globals.css tests
git commit -m "feat: add project control view"
```

## Task 5: Read-only User Decision Center

**Files:**

- Create: `components/observatory/ProjectDecisionCenter.tsx`
- Create: `app/dashboard/decisions/page.tsx`
- Create: decision component/page tests
- Modify: Dashboard navigation and CSS

- [ ] **Step 1: Write failing tests**

Cover evidence-blocked, pending, ready, recorded, filters, options, impact, downstream Stages, Project links, no mutation controls, empty/unavailable, and admin redirect.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/observatory-project-decision-center.test.tsx tests/observatory-project-decisions-page.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Implement semantic GET-filtered lists**

Suggested actions are explanatory labels, never Project-state write buttons.

- [ ] **Step 4: Run GREEN and commit**

Run the two new tests plus `tests/observatory-dashboard-section-nav.test.tsx`, then commit `feat: add project decision center`.

## Task 6: Work Tracker binding domain and migration

**Files:**

- Create: `supabase/migrations/20260823000100_project_control_work_item_binding.sql`
- Create: migration contract test
- Modify: `lib/observatory/work-items.ts` and domain/DB verifier tests

- [ ] **Step 1: Write failing domain/migration tests**

Test all-null/all-present, partial rejection, safe formats, four columns/constraint, updated RPC, authorization, lock, expected version, atomic before/after event, and absence of Project/Stage/Gate writes.

```ts
expect(ObservatoryWorkItemBindingSchema.safeParse({
  projectKey: "asgard/archaea-game",
  planRevision: 3,
  stageId: null,
  workPackageId: null,
}).success).toBe(false);
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/observatory-work-items.test.ts tests/observatory-project-control-binding-migration.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement schema and additive migration**

Retain legacy `project_ref` / `milestone_ref`. Add four nullable fields, one all-null/all-present constraint, and an updated admin RPC with locks/version/audit.

- [ ] **Step 4: Run GREEN and Claim regressions**

Run the new tests plus `observatory-migration` and `observatory-agent-claims` tests.

- [ ] **Step 5: Commit**

Commit `feat: bind work items to project control`.

## Task 7: Binding persistence and UI

**Files:**

- Modify: `repository.ts`, server actions, Work Item page, `WorkItemDetail.tsx`, `WorkTrackerBoard.tsx`, and their tests

- [ ] **Step 1: Write failing persistence/UI tests**

Cover row mapping, RPC arguments, audit display, matched and every unmatched state, source unavailable, legacy unbound rows, no Stage mutation action, and Claim completion remaining local.

- [ ] **Step 2: Run RED**

Run repository, action, Work Item detail, and Board tests.

- [ ] **Step 3: Implement repository/action mapping**

Authorize before validation; atomically pass all four values; revalidate only Work Tracker routes.

- [ ] **Step 4: Implement bounded binding selection/display**

Offer complete Work Package options from the validated Snapshot; never expose a free-form authority editor.

- [ ] **Step 5: Run GREEN and Claim API regressions**

Run focused repository/action/component plus Agent Claim API tests.

- [ ] **Step 6: Commit**

Commit `feat: expose work item project bindings`.

## Task 8: Full P0-A release Gate

**Files:**

- Create: `docs/product/project-control-p0-a-acceptance.md`
- Modify code/tests only for verified defects

- [ ] **Step 1: Run focused Project Control suite**

Expected: zero failures.

- [ ] **Step 2: Run complete machine Gate**

```bash
npm test
npm run lint
npm run typecheck
git diff --check
npm run build
```

- [ ] **Step 3: Run collection/privacy/retention/database Gates**

Prove v6 collection, digest, privacy denylist zero, last-known-good, migration authorization, binding audit, and no Stage/Gate write path.

- [ ] **Step 4: Deploy consumer-safe P0-A**

Deploy with `project_controls=null` until a real producer exists. Preserve all v5 pages and record deployment, commit, Snapshot compatibility, rollback, and limitations.

- [ ] **Step 5: Authenticated browser verification**

Verify Projects, Project detail preview/test state, Decisions, Board, and Work Item detail at 1440×1000 and 390×844: overflow, filters, labels, console/page errors, keyboard path, and scoped axe.

- [ ] **Step 6: Write and commit acceptance record**

Record exact commands/counts, migration proof, deployment/digest, rollback, and explicit P0-B dependency; commit `docs: accept project control p0-a`.

## Task 9: P0-B producer boundary

**Files:**

- Create/update canonical `plato-academy/docs/socrates/` file message.

- [ ] **Step 1: Publish the contract through file communication**

Include contract SHA-256, P0-A commit/deployment, filename/schema, exact Asgard checks, and privacy boundary. Do not use runtime direct messaging.

- [ ] **Step 2: Mark P0-B waiting on producer**

Do not fabricate Asgard data or edit Socrates files. Resume only when a valid public producer projection exists.

- [ ] **Step 3: Complete P0-B from the real projection**

Run exact Asgard adoption, privacy, production publication, responsive browser, and rollback Gates; fix consumer defects with TDD inside the approved scope.
