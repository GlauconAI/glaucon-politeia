# Dashboard Agents Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a precise Agents section to the existing Dashboard that safely shows configured defaults, the latest Telegram Direct runtime values, and each Telegram group's latest runtime values.

**Architecture:** Preserve the existing v1-v6 Observatory envelopes and add a v7 top-level `agent_activity` projection produced by a dedicated, fail-soft collector. Render that projection through a focused `AgentStatusDirectory` component while retaining configured Agent cards when live activity is unavailable.

**Tech Stack:** TypeScript, Next.js App Router, React, Zod, Vitest, Testing Library, OpenClaw CLI, existing Observatory snapshot pipeline.

---

## File map

- Create `lib/observatory/agent-activity-schema.ts`: strict bounded v7 activity types.
- Create `lib/observatory/agent-activity-collector.ts`: whitelist, normalize, deduplicate, and redact OpenClaw config/activity output.
- Create `components/observatory/AgentStatusDirectory.tsx`: full-width Agent status presentation.
- Create `tests/observatory-agent-activity-collector.test.ts`: collector red/green coverage.
- Create `tests/observatory-agent-status-directory.test.tsx`: component red/green coverage.
- Modify `lib/observatory/collection-schema.ts`: add v7 envelope and union type.
- Modify `lib/observatory/collector.ts`: add deterministic v6-to-v7 upgrade.
- Modify `scripts/observatory/collect.ts`: collect activity after v6 and write v7.
- Modify `scripts/observatory/verify-snapshot.ts`: validate v7 while preserving v5/v6 support.
- Modify `components/observatory/ObservatoryOverview.tsx`: place the new section and remove duplicate mixed-grid Agents.
- Modify `app/dashboard/page.tsx`: add the Agents section-navigation link.
- Modify `app/globals.css`: responsive status cards, rows, badges, and disclosure styling.
- Modify existing Observatory tests for schema evolution, script wiring, navigation, and compatibility.

### Task 1: Define the bounded Agent activity contract

**Files:**
- Create: `lib/observatory/agent-activity-schema.ts`
- Modify: `lib/observatory/collection-schema.ts`
- Test: `tests/observatory-collector.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests that construct a v7 envelope with `agent_activity`, reject raw/unbounded fields, and continue accepting an unchanged v6 envelope. The v7 fixture must contain one Agent, one fixed-label Direct activity row, and one hashed group row.

- [ ] **Step 2: Run the focused schema tests and verify RED**

Run: `npm test -- tests/observatory-collector.test.ts`

Expected: FAIL because v7 constants and schemas do not exist.

- [ ] **Step 3: Implement strict activity schemas and v7 envelope**

Define:

```ts
export const ObservatoryActivityValueSourceSchema = z.enum([
  "configured", "override", "inherited", "unknown",
]);
export const ObservatoryAgentActivityRowSchema = z.strictObject({
  identity: Sha256Schema,
  label: ActivityTextSchema.min(1),
  model_label: ActivityTextSchema.min(1),
  model_source: ObservatoryActivityValueSourceSchema,
  thinking_level: ActivityTextSchema.min(1),
  thinking_source: ObservatoryActivityValueSourceSchema,
  run_state: z.enum(["running", "queued", "done", "failed", "unknown"]),
  active: z.boolean(),
  updated_at: IsoTimestampSchema,
});
export const ObservatoryAgentActivityEntrySchema = z.strictObject({
  agent_id: ActivityTextSchema.min(1),
  default_thinking_level: ActivityTextSchema.nullable(),
  latest_direct: ObservatoryAgentActivityRowSchema.nullable(),
  telegram_groups: z.array(ObservatoryAgentActivityRowSchema).max(128),
});
export const ObservatoryAgentActivitySnapshotSchema = z.strictObject({
  status: z.enum(["ready", "partial", "unavailable"]),
  collected_at: IsoTimestampSchema,
  agents: z.array(ObservatoryAgentActivityEntrySchema).max(256),
});
```

Add `OBSERVATORY_COLLECTION_SCHEMA_VERSION_V7`, `OBSERVATORY_COLLECTOR_VERSION_V7`, `ObservatoryCollectionEnvelopeV7Schema`, its exported type, and the v7 member in `ObservatoryCollectionEnvelopeSchema`.

- [ ] **Step 4: Run the focused schema tests and verify GREEN**

Run: `npm test -- tests/observatory-collector.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/observatory/agent-activity-schema.ts lib/observatory/collection-schema.ts tests/observatory-collector.test.ts
git commit -m "feat(observatory): define agent activity snapshot"
```

### Task 2: Collect safe defaults, Direct activity, and group activity

**Files:**
- Create: `lib/observatory/agent-activity-collector.ts`
- Create: `tests/observatory-agent-activity-collector.test.ts`

- [ ] **Step 1: Write failing collector tests**

Cover these exact behaviors:

- argv is `config get agents --json` and `gateway call sessions.list --json --params {"limit":500}`;
- per-Agent Thinking overrides inherit the global default when absent;
- newest Telegram Direct activity wins and receives the fixed label `Telegram Direct`;
- newest row per Telegram group wins and groups sort newest first;
- provider/model normalization yields `openai/gpt-5.6-sol`;
- explicit Thinking values differ from inherited defaults and retain source metadata;
- malformed config or activity output produces `partial`, while both unavailable produce `unavailable`;
- raw keys, IDs, usernames, Direct display names, emails, paths, and command output never appear in serialized output;
- more than 128 groups is rejected or deterministically truncated before validation.

- [ ] **Step 2: Run collector tests and verify RED**

Run: `npm test -- tests/observatory-agent-activity-collector.test.ts`

Expected: FAIL because the collector module does not exist.

- [ ] **Step 3: Implement the fail-soft collector**

Export:

```ts
export async function collectAgentActivity(
  input: { agents: readonly ObservatoryAgent[] },
  dependencies: { runCommand: CommandRunner; now(): Date; commandTimeoutMs?: number },
): Promise<ObservatoryAgentActivitySnapshot>
```

Run both read-only commands concurrently. Parse each source independently with the existing 5 MiB and timeout limits. Build every output row from an explicit whitelist; use SHA-256 of the internal activity key for `identity`; use a fixed Direct label; sanitize group labels; convert epoch timestamps to ISO; derive effective Thinking from explicit then inherited defaults; and never throw solely because an optional activity source failed.

- [ ] **Step 4: Run collector tests and verify GREEN**

Run: `npm test -- tests/observatory-agent-activity-collector.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/observatory/agent-activity-collector.ts tests/observatory-agent-activity-collector.test.ts
git commit -m "feat(observatory): collect safe agent activity"
```

### Task 3: Wire v7 into the collection and verification pipeline

**Files:**
- Modify: `lib/observatory/collector.ts`
- Modify: `scripts/observatory/collect.ts`
- Modify: `scripts/observatory/verify-snapshot.ts`
- Modify: `tests/observatory-system-collector.test.ts`
- Modify: `tests/observatory-collect-script.test.ts`

- [ ] **Step 1: Write failing pipeline tests**

Add tests proving that `upgradeObservatorySnapshotToV7` preserves v6 fields, adds validated activity, and recomputes both digest locations. Assert the collect script invokes activity collection and the verifier accepts v7 with nine source-health domains. Assert previous Project Control can be retained from either v6 or v7.

- [ ] **Step 2: Run pipeline tests and verify RED**

Run: `npm test -- tests/observatory-system-collector.test.ts tests/observatory-collect-script.test.ts`

Expected: FAIL because v7 wiring is absent.

- [ ] **Step 3: Implement pipeline wiring**

Add `upgradeObservatorySnapshotToV7(v6, activity)` beside the existing upgrade functions. In `scripts/observatory/collect.ts`, collect activity after v6, upgrade to v7, and write that snapshot. Update last-known-good Project Control parsing to accept v6 or v7. Update `verify-snapshot.ts` to parse v5-v7, use nine source domains whenever `project_controls` exists, and report the Agent activity count.

- [ ] **Step 4: Run pipeline tests and verify GREEN**

Run: `npm test -- tests/observatory-system-collector.test.ts tests/observatory-collect-script.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/observatory/collector.ts scripts/observatory/collect.ts scripts/observatory/verify-snapshot.ts tests/observatory-system-collector.test.ts tests/observatory-collect-script.test.ts
git commit -m "feat(observatory): publish agent activity in v7"
```

### Task 4: Render the full-width Agents section

**Files:**
- Create: `components/observatory/AgentStatusDirectory.tsx`
- Create: `tests/observatory-agent-status-directory.test.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/dashboard/page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/observatory-overview.test.tsx`
- Modify: `tests/observatory-page.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Assert:

- `View Agents` points to `#dashboard-agents`;
- section navigation contains `Agents` with the same href;
- the new region renders every configured Agent;
- default Model/Thinking and latest TD Model/Thinking are visible;
- an `Override` label appears when either effective value differs;
- Telegram groups start collapsed and expand through `<details>`;
- group name, effective Model/Thinking, state, and semantic timestamp render;
- a v1-v6 snapshot shows configured Model and an activity compatibility message;
- private Direct identity strings are absent.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test -- tests/observatory-agent-status-directory.test.tsx tests/observatory-overview.test.tsx tests/observatory-page.test.tsx`

Expected: FAIL because the section and component do not exist.

- [ ] **Step 3: Implement the component and navigation**

Create `AgentStatusDirectory` with a semantic region, one card per configured Agent, visible Default and Latest TD rows, and native collapsed group disclosures. Merge activity by `agent_id`; derive `Override` from value/source metadata; never render a Direct display label from source data. Place the section after topology and before Core objects. Remove the Agents `ObjectList`, update Core objects search copy, add the section-nav link, and change the summary href.

- [ ] **Step 4: Add responsive CSS**

Add `.agent-status-*` rules using the existing palette and breakpoints. Keep labels textual, preserve focus visibility, and switch the card grid to one column on narrow screens.

- [ ] **Step 5: Run UI tests and verify GREEN**

Run: `npm test -- tests/observatory-agent-status-directory.test.tsx tests/observatory-overview.test.tsx tests/observatory-page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/observatory/AgentStatusDirectory.tsx components/observatory/ObservatoryOverview.tsx app/dashboard/page.tsx app/globals.css tests/observatory-agent-status-directory.test.tsx tests/observatory-overview.test.tsx tests/observatory-page.test.tsx
git commit -m "feat(dashboard): add agent status section"
```

### Task 5: Verify, review, release, and accept production

**Files:**
- Modify only files required by verified review findings.

- [ ] **Step 1: Run focused verification**

Run:

```bash
npm test -- tests/observatory-agent-activity-collector.test.ts tests/observatory-agent-status-directory.test.tsx tests/observatory-collector.test.ts tests/observatory-system-collector.test.ts tests/observatory-collect-script.test.ts tests/observatory-overview.test.tsx tests/observatory-page.test.tsx tests/observatory-privacy-scan.test.ts
npm run lint
npm run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 2: Run the repository release gate**

Run `npm run release:verify` when present. If `origin/main` does not expose that script, run the repository's complete `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` gates and record the exact baseline-only exceptions separately; do not claim a clean gate without evidence.

- [ ] **Step 3: Perform independent code review**

Review the diff against the approved design for privacy, schema compatibility, bounds, fail-soft behavior, accessibility, and responsive layout. Fix every Critical or Important finding, then rerun Steps 1-2.

- [ ] **Step 4: Prepare the PR through the host-owned release entry**

Verify the branch is clean, linear, and ahead of `origin/main`, then run:

```bash
/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh
```

Wait for PR checks and Preview deployment to pass.

- [ ] **Step 5: Squash merge after the authorized release gate**

Use the one authorized `gh pr merge <number> --squash` execution path. If it times out, query PR state read-only before any retry.

- [ ] **Step 6: Verify production**

Wait for the exact merge SHA's production deployment and smoke workflow. With the authenticated `402v-admin` browser profile, verify desktop and mobile `/dashboard`, the Agents summary/section-nav anchor, the Default and Latest TD rows, group disclosure, override markers, and absence of private Direct identity. Close the browser session and release the profile.

- [ ] **Step 7: Record evidence and close the Work**

Record commit, PR, CI, deployment, and browser acceptance evidence. Update the progress card and close the self-owned Thin Work only after every required verification passes.
