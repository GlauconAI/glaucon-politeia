# Dashboard System Observatory V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebaseline Dashboard around its three modules and complete the read-only System Observatory with safe asset inventory, provenance, topology, freshness, runtime health, and automated last-known-good refresh.

**Architecture:** Extend the existing local Collector and append-only Snapshot read model with strict v2 asset/relationship contracts. Keep v1 read compatibility, render the new inventory in the existing admin-only Dashboard, and schedule the trusted local collect/publish command through OpenClaw Cron only after local and production gates pass.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Zod 4, Supabase/Postgres/RLS, Vitest/Testing Library, native Node.js filesystem/process APIs, OpenClaw CLI/Cron, Vercel.

---

## File Structure

- Create `lib/observatory/asset-schema.ts`: strict safe asset, source, health, and relationship types.
- Create `lib/observatory/freshness.ts`: deterministic age-derived freshness and source rollups.
- Create `lib/observatory/system-assets.ts`: pure whitelist projections for skills, plugins/tools, cron, Gateway, and filesystem metadata.
- Create `lib/observatory/system-collector.ts`: bounded read-only command/file orchestration.
- Modify `lib/observatory/collection-schema.ts`: versioned v1/v2 envelope union and v2 cross-field validation.
- Modify `lib/observatory/collector.ts`: compose core and system collection without weakening current security behavior.
- Modify `scripts/observatory/collect.ts`: accept explicit safe roots and write a v2 Snapshot.
- Create `scripts/observatory/refresh.ts`: lock, collect, validate, publish, failure-state, and retention orchestration.
- Create `components/observatory/FreshnessSummary.tsx`: health/freshness rollup.
- Create `components/observatory/SystemInventory.tsx`: searchable/filterable domain inventory.
- Create `components/observatory/SystemTopology.tsx`: semantic relationship list and bounded visual enhancement.
- Modify `components/observatory/ObservatoryOverview.tsx`: integrate System Observatory sections while preserving v1 fallback and Quick Capture.
- Modify `app/globals.css`: scoped Dashboard system inventory/topology styles.
- Add/modify focused tests under `tests/observatory-*.test.ts(x)`.
- Modify `docs/dashboard-m1a-runbook.md`: v2 collection, refresh, failure, rollback, and release procedure.
- Modify the Dashboard knowledge-base `README.md`, `design.md`, `source-contract.md`, `development-baseline.md`, `edad-tracker.md`, and Plato `agenda.md` after verified implementation.

### Task 1: Record the approved three-module Plan Revision

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-dashboard-three-module-milestones-system-observatory-design.md`
- Create: `docs/superpowers/plans/2026-07-22-dashboard-system-observatory-v1.md`

- [ ] Verify the design has no placeholders or conflicting M0–M3 mappings.
- [ ] Record the plan revision in the knowledge-base candidate Baseline and EDAD Tracker only after implementation evidence is available; preserve all historical IDs and Gate evidence.
- [ ] Commit the design and plan separately from product code.

### Task 2: Define strict v2 asset and relationship contracts

**Files:**
- Create: `lib/observatory/asset-schema.ts`
- Create: `lib/observatory/freshness.ts`
- Create: `tests/observatory-asset-schema.test.ts`
- Create: `tests/observatory-freshness.test.ts`

- [ ] Write failing schema tests for all ten asset kinds, bounded text/arrays, logical sources, ISO timestamps, whitelisted labels, endpoint integrity, duplicate IDs, and unknown-field rejection.
- [ ] Run `npm test -- tests/observatory-asset-schema.test.ts tests/observatory-freshness.test.ts` and confirm failures are caused by missing modules.
- [ ] Implement strict schemas with this public shape:

```ts
export const ObservatoryAssetSchema = z.strictObject({
  id: LogicalIdSchema,
  kind: z.enum(["skill", "tool", "profile", "rule", "config", "knowledge", "agenda", "cron", "gateway", "runtime"]),
  name: SafeTextSchema.min(1),
  owner: SafeTextSchema.min(1),
  authority: z.enum(["canonical", "declared", "observed", "derived"]),
  source: LogicalSourceSchema,
  collected_at: IsoTimestampSchema,
  freshness: z.enum(["fresh", "stale", "failed", "unknown"]),
  health: z.enum(["healthy", "degraded", "failed", "unknown", "disabled"]),
  summary: SafeTextSchema,
  labels: z.array(ObservatoryAssetLabelSchema).max(16),
});
```

- [ ] Implement deterministic freshness thresholds and a pure rollup that never turns `failed` into `stale`.
- [ ] Re-run focused tests and confirm green.
- [ ] Run `npm run typecheck` and commit.

### Task 3: Project safe OpenClaw command results

**Files:**
- Create: `lib/observatory/system-assets.ts`
- Create: `tests/observatory-system-assets.test.ts`

- [ ] Write failing tests using adversarial fixtures containing tokens, absolute paths, emails, Cron payload messages, delivery destinations, URLs, session keys, and unknown nested fields.
- [ ] Test strict safe projections for:
  - per-agent `skills list --json` results;
  - `plugins list --json` as tool-provider assets;
  - `cron list --all --json` with only logical schedule and safe state;
  - `gateway status --json` and existing runtime status;
  - failed command source records.
- [ ] Run the focused test and confirm RED.
- [ ] Implement pure projection functions. Do not serialize raw CLI objects or spread unknown input.
- [ ] Confirm every forbidden fixture string is absent from `JSON.stringify(result)`.
- [ ] Re-run focused tests, typecheck, and commit.

### Task 4: Collect safe filesystem metadata and compose v2 Snapshot

**Files:**
- Create: `lib/observatory/system-collector.ts`
- Modify: `lib/observatory/collection-schema.ts`
- Modify: `lib/observatory/collector.ts`
- Modify: `scripts/observatory/collect.ts`
- Create: `tests/observatory-system-collector.test.ts`
- Modify: `tests/observatory-collector.test.ts`

- [ ] Write failing tests for explicit-root enforcement, symlink escape rejection, bounded directory/file counts, metadata-only rule/config/knowledge/agenda projection, command allowlists, partial-domain failures, deterministic ordering/digest, and v1/v2 parsing.
- [ ] Run focused tests and confirm RED.
- [ ] Implement `ObservatoryCollectionEnvelopeV1Schema`, `ObservatoryCollectionEnvelopeV2Schema`, and a discriminated union. V2 adds `assets`, `relationships`, and `source_health` while retaining the core v1 fields.
- [ ] Implement filesystem adapters that expose only basename/logical reference, owner, existence, mtime, size class, and digest; never file content or absolute roots.
- [ ] Run skills commands sequentially with a bounded agent count; run global plugins/Cron/Gateway commands once; represent a failed domain as safe health evidence.
- [ ] Derive only declared/observed relationships: agent→skill, tool-provider→profile, agenda→knowledge area, cron→agent, Gateway→runtime. Reject dangling endpoints.
- [ ] Re-run focused tests, the full test suite, typecheck, and commit.

### Task 5: Render complete System Observatory UX

**Files:**
- Create: `components/observatory/FreshnessSummary.tsx`
- Create: `components/observatory/SystemInventory.tsx`
- Create: `components/observatory/SystemTopology.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-system-inventory.test.tsx`
- Create: `tests/observatory-system-topology.test.tsx`
- Modify: `tests/observatory-overview.test.tsx`

- [ ] Write failing tests for v1 fallback, v2 summary, domain grouping, search, owner/authority/freshness/health filters, empty/partial/failed states, provenance visibility, relationship search, keyboard semantics, and visual-map item cap.
- [ ] Run focused UI tests and confirm RED.
- [ ] Implement the three focused components with native controls and semantic lists. Use SVG only as an `aria-hidden` enhancement; the relationship list is the accessible source.
- [ ] Keep the existing Core Objects UI and Quick Capture unchanged. Place new System Observatory content before the write surface.
- [ ] Add route-scoped responsive styles without new dependencies.
- [ ] Re-run focused tests, full tests, lint, typecheck, build, and commit.

### Task 6: Implement bounded refresh, retention, and failure state

**Files:**
- Create: `lib/observatory/refresh-state.ts`
- Create: `scripts/observatory/refresh.ts`
- Create: `tests/observatory-refresh-state.test.ts`
- Create: `tests/observatory-refresh-script.test.ts`
- Modify: `package.json`
- Modify: `docs/dashboard-m1a-runbook.md`

- [ ] Write failing tests for exclusive lock acquisition, stale-lock recovery, consecutive failure increments, notification threshold at three failures, stale escalation after 45 minutes, one recovery notice, idempotent publish, and successful Snapshot retention to 30 rows.
- [ ] Run focused tests and confirm RED.
- [ ] Implement a single-run refresh command using atomic state files with mode `0600`; never store raw stderr, tokens, or payloads.
- [ ] Add `observatory:refresh` and `observatory:retention` scripts. Retention must require an explicit command and preserve release evidence.
- [ ] Document exact collect, validate, publish, failure simulation, recovery, disable, and rollback commands.
- [ ] Re-run focused tests, full tests, lint, typecheck, build, and commit.

### Task 7: Execute local security and integration Gate

**Files:**
- Modify: `docs/dashboard-m1a-runbook.md`
- Create ignored artifacts under `.observatory/` only.

- [ ] Run a real v2 collection using explicit workspace/Vault roots and verify file mode `0600`.
- [ ] Run the privacy scanner for secrets, credentials, private absolute paths, emails, message content, Cron payloads, config values, and browser data; require zero findings.
- [ ] Start disposable local Supabase, apply all migrations from zero, publish the same valid Snapshot twice, and verify one digest row plus last-known-good behavior after an invalid Snapshot.
- [ ] Run focused database checks and stop/delete all disposable containers, database volumes, and networks.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` from a clean worktree.
- [ ] Record exact evidence in the runbook and commit.

### Task 8: Production release and automation Gate

**Files:**
- Modify: Dashboard Vault project records and Plato `agenda.md`.

- [ ] Merge verified work to local `main` without touching unrelated anonymous-interaction changes.
- [ ] Push `main` to `GlauconAI/glaucon-politeia`.
- [ ] Publish one privacy-clean v2 Snapshot and verify the latest successful row while retaining v1 history.
- [ ] Deploy to Vercel and verify anonymous redirect, non-admin denial, admin rendering, v1 fallback, v2 inventory, topology, source health, and Quick Capture regression.
- [ ] Create the 15-minute OpenClaw isolated refresh Cron with overlap protection, failure/stale/recovery notifications, and no Gateway restart action.
- [ ] Force one successful Cron run, verify run history and Snapshot freshness, then execute a safe failure/recovery drill without changing Gateway.
- [ ] Update Baseline/EDAD/README/design/source contract/agenda with the approved M0–M3 mapping, actual evidence, residual risks, rollback, and next milestone M2 Delivery Governance.
- [ ] Run final production smoke and verify the worktree/branch completion flow.

## Plan Self-Review

- Spec coverage: all milestone remapping, inventory domains, provenance, freshness, topology, automation, resilience, privacy, accessibility, and release requirements map to Tasks 1–8.
- Type consistency: all new components consume the v2 `assets`, `relationships`, and `source_health` fields defined in Task 4; v1 remains supported.
- Dependency check: no new npm dependency is required.
- Scope check: Delivery Governance and Work Tracker expansion remain outside this plan.

