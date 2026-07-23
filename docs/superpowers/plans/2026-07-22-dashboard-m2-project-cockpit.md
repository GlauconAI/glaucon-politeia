# Dashboard M2 Project Cockpit Implementation Plan

> **For Codex:** Execute task-by-task with `executing-plans` and strict
> test-driven development. Every behavior change begins with a focused failing
> test. Do not touch the unrelated anonymous-engagement work in the main
> worktree.

**Goal:** Add a production-ready, read-only Project Cockpit to `/dashboard`
using the Dashboard project's governance documents as a safely collected,
versioned dogfood dataset.

**Architecture:** Extend the existing local Collector and append-only Snapshot
pipeline with a strict `delivery_governance` read model in Snapshot v3. Parse
only four allowlisted Dashboard governance documents below the explicit Vault
root, validate and privacy-scan the projection, then render it in an accessible
client component without adding dependencies or write paths.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Zod 4, Vitest,
Testing Library, native Node filesystem/crypto APIs, existing Supabase Snapshot
repository.

---

## Task 1: Define the bounded governance read model and Snapshot v3

**Files:**

- Create: `lib/observatory/governance-schema.ts`
- Modify: `lib/observatory/collection-schema.ts`
- Modify: `package.json`
- Test: `tests/observatory-governance-schema.test.ts`
- Test: `tests/observatory-collector.test.ts`

**Step 1: Write failing schema tests**

Cover:

- a minimal valid governance model;
- maximum string/array bounds;
- duplicate Milestone, Feature, Task, Run, Gate, and Risk IDs;
- dangling Feature → Milestone and Task → Feature references;
- closed Execution Contract values;
- ISO date or `not_recorded`;
- deterministic summary counts;
- v1/v2 compatibility and v3 acceptance;
- rejection of unknown top-level fields.

**Step 2: Run the focused tests and confirm RED**

Run:

```bash
npx vitest run tests/observatory-governance-schema.test.ts tests/observatory-collector.test.ts
```

Expected: failure because the governance schema and v3 envelope do not exist.

**Step 3: Implement the smallest schema**

Create strict Zod schemas and exported types for:

- project;
- Milestones, Features, Tasks;
- Executor Runs and Gates;
- risks and dependencies;
- normalized status categories;
- summary and source metadata.

Add `3.0.0` / collector `3.0.0`, define
`ObservatoryCollectionEnvelopeV3Schema` as v2 plus
`delivery_governance`, and add v3 to the union. Preserve v1/v2 exports.

Resource limits:

- governance string: 512 characters;
- evidence string: 1,024 characters;
- milestones: 32;
- features: 256;
- tasks: 2,048;
- runs: 1,024;
- gates: 256;
- risks/dependencies: 256 each;
- source files: exactly four.

**Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

**Step 5: Commit**

```bash
git add package.json lib/observatory/governance-schema.ts lib/observatory/collection-schema.ts tests/observatory-governance-schema.test.ts tests/observatory-collector.test.ts
git commit -m "feat: define Project Cockpit read model"
```

## Task 2: Project canonical Markdown into the read model

**Files:**

- Create: `lib/observatory/governance-markdown.ts`
- Create: `tests/fixtures/observatory-governance/README.md`
- Create: `tests/fixtures/observatory-governance/development-baseline.md`
- Create: `tests/fixtures/observatory-governance/edad-tracker.md`
- Create: `tests/fixtures/observatory-governance/estimate-calibration.md`
- Create: `tests/observatory-governance-markdown.test.ts`

**Step 1: Write failing parser tests**

Cover exact known headings/table headers, complete hierarchy, contract
projection, candidate Baseline label, run ordering, Gate/risk/dependency
projection, missing dates, source digest stability, bounded text, Markdown link
stripping, absolute-path/email/secret redaction, unknown columns, duplicate
IDs, dangling parents, and format drift.

**Step 2: Run the focused test and confirm RED**

```bash
npx vitest run tests/observatory-governance-markdown.test.ts
```

**Step 3: Implement the bounded parser**

Use a small native Markdown-table reader, not a general Markdown renderer:

- locate only exact headings and table header signatures;
- split and normalize bounded cells;
- accept stable `OBS-*`, `RUN-*`, and Gate IDs only;
- preserve source status labels and derive normalized categories;
- keep only display-safe evidence summaries;
- create all dates as ISO values or `not_recorded`;
- sort every output collection deterministically;
- compute a digest over logical source labels plus source bytes;
- validate the final object through the governance Zod schema.

**Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

**Step 5: Commit**

```bash
git add lib/observatory/governance-markdown.ts tests/fixtures/observatory-governance tests/observatory-governance-markdown.test.ts
git commit -m "feat: project Dashboard governance documents"
```

## Task 3: Collect allowlisted governance sources safely

**Files:**

- Create: `lib/observatory/governance-collector.ts`
- Modify: `lib/observatory/collector.ts`
- Modify: `scripts/observatory/collect.ts`
- Modify: `package.json`
- Test: `tests/observatory-governance-collector.test.ts`
- Modify: `tests/observatory-system-collector.test.ts`

**Step 1: Write failing filesystem and upgrade tests**

Cover:

- only the four exact relative paths are opened;
- source missing/read failure;
- per-file and aggregate byte limits;
- realpath containment and symlink escape;
- v2 → v3 upgrade recomputes digest;
- parser failures become a sanitized `GOVERNANCE_INVALID` collector code;
- no partial v3 result is returned.

**Step 2: Run focused tests and confirm RED**

```bash
npx vitest run tests/observatory-governance-collector.test.ts tests/observatory-system-collector.test.ts
```

**Step 3: Implement safe collection and v3 upgrade**

Resolve and realpath the Vault root and each allowlisted path, enforce path
containment and byte limits, read with an injected bounded adapter, call the
pure parser, and expose a v2 → v3 upgrade helper that validates before and
after digest generation.

Update the CLI system-roots path to collect governance after system inventory
and write one v3 candidate atomically. The v1 path remains unchanged when
system roots are absent.

**Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

**Step 5: Commit**

```bash
git add package.json lib/observatory/governance-collector.ts lib/observatory/collector.ts scripts/observatory/collect.ts tests/observatory-governance-collector.test.ts tests/observatory-system-collector.test.ts
git commit -m "feat: collect Project Cockpit evidence safely"
```

## Task 4: Render the accessible Project Cockpit

**Files:**

- Create: `components/observatory/ProjectCockpit.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `app/globals.css`
- Create: `tests/observatory-project-cockpit.test.tsx`
- Modify: `tests/observatory-overview.test.tsx`
- Modify: `tests/observatory-page.test.tsx`

**Step 1: Write failing UI tests**

Cover:

- v1/v2 governance-unavailable notice;
- v3 portfolio summary and candidate Baseline label;
- Milestone → Feature → Task hierarchy;
- expand/collapse with native buttons;
- global search and normalized-status filtering;
- dates rendered as values or `Not recorded`;
- contracts, runs, Gates, risks, dependencies, evidence;
- zero-record, keyboard, and bounded-long-text states.

**Step 2: Run focused tests and confirm RED**

```bash
npx vitest run tests/observatory-project-cockpit.test.tsx tests/observatory-overview.test.tsx tests/observatory-page.test.tsx
```

**Step 3: Implement the cockpit**

Build `ProjectCockpit` as a client component using semantic sections, lists,
`details`/buttons, labels, and existing typography/colors. Mount it in
`ObservatoryOverview` after System Observatory inventory/topology and before
Quick Capture. No chart library, raw HTML, or write action.

**Step 4: Run focused tests and confirm GREEN**

Run the command from Step 2.

**Step 5: Commit**

```bash
git add components/observatory/ProjectCockpit.tsx components/observatory/ObservatoryOverview.tsx app/globals.css tests/observatory-project-cockpit.test.tsx tests/observatory-overview.test.tsx tests/observatory-page.test.tsx
git commit -m "feat: add read-only Project Cockpit"
```

## Task 5: Verify the real dogfood collection and privacy boundary

**Files:**

- Modify: `scripts/observatory/verify-snapshot.ts`
- Modify: `tests/observatory-privacy-scan.test.ts`
- Modify: `tests/observatory-collection-cli.test.ts`
- Modify: `docs/observatory/README.md`
- Modify: `docs/observatory/runbook.md`

**Step 1: Write failing verification tests**

Require the verification script to accept v3, report governance counts/source
health, and fail privacy categories for absolute paths, emails, credentials,
message bodies, and raw Markdown links inside governance data.

**Step 2: Run focused tests and confirm RED**

```bash
npx vitest run tests/observatory-privacy-scan.test.ts tests/observatory-collection-cli.test.ts
```

**Step 3: Update verification and operational docs**

Make snapshot verification parse v3, retain v2 compatibility where needed,
report the cockpit summary, and document collection failure/rollback behavior.

**Step 4: Run a real local dogfood collection**

Use the current canonical registry, workspace root, and Vault root to generate a
temporary v3 Snapshot. Verify:

- `delivery_governance.source.health = healthy`;
- real project hierarchy and evidence counts are non-zero;
- schema validation and privacy scan pass;
- no absolute Vault/workspace paths occur in JSON.

Do not publish during this task.

**Step 5: Commit**

```bash
git add scripts/observatory/verify-snapshot.ts tests/observatory-privacy-scan.test.ts tests/observatory-collection-cli.test.ts docs/observatory/README.md docs/observatory/runbook.md
git commit -m "docs: operationalize Project Cockpit snapshots"
```

## Task 6: Full quality gate and documentation evidence

**Files:**

- Modify: `STATE.md`
- Modify after verified evidence:
  `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/projects/dashboard/README.md`
- Modify after verified evidence:
  `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/projects/dashboard/edad-tracker.md`
- Modify after verified evidence:
  `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/projects/dashboard/estimate-calibration.md`

**Step 1: Run the full local gate**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
```

**Step 2: Review security and scope**

Inspect the complete branch diff for:

- no secrets/private paths/raw source text;
- no dependencies or write APIs added;
- no anonymous-engagement files;
- no production/Gateway/Cron mutation;
- design and implementation-plan compliance.

**Step 3: Update project evidence**

Record actual run IDs, duration, test counts, commit IDs, known limitations,
and Gate status in `STATE.md` and the canonical Dashboard project documents.
Do not mark Production Accepted before deployment and online smoke.

**Step 4: Commit local evidence**

Stage only files belonging to this slice and commit the verified evidence.

## Task 7: Production release Gate

This task starts only after local evidence is complete.

1. Rebase/merge safely without including anonymous-engagement changes.
2. Obtain explicit authority for any shared-`main` push not already granted.
3. Push the exact verified commit.
4. Wait for Vercel `READY`.
5. Allow the natural 15-minute refresh to publish v3; do not use
   `launchctl kickstart -k`.
6. Verify the latest Snapshot is v3, privacy-clean, healthy, and has
   `consecutive_failures = 0`.
7. Smoke:
   - authenticated `/dashboard` Project Cockpit;
   - anonymous `/dashboard` login redirect;
   - legacy `/observatory` permanent redirect;
   - System Observatory and Quick Capture regression.
8. Mark the slice Production Accepted and write final evidence.
