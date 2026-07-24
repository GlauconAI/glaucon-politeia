# Dashboard Source Repository Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover Git repositories under the approved Vault and OpenClaw workspace roots, publish only strict safe metadata in a v4 Snapshot, and render a read-only repository inventory in M1.

**Architecture:** Add a bounded local discovery unit and a strict typed repository contract. Upgrade validated v3 Snapshots to v4, project repositories into existing system assets/relationships, and render a native accessible inventory without adding dependencies.

**Tech Stack:** Node.js filesystem and child-process APIs, TypeScript, Zod, React 19, Vitest, Testing Library, Next.js.

---

## File Map

- Create `lib/observatory/source-repository-schema.ts`: strict repository, inventory, and source-health schemas.
- Create `lib/observatory/source-repository-discovery.ts`: bounded root traversal, Git command projection, remote sanitization, exact project mapping, and repository asset projection.
- Create `components/observatory/SourceRepositoryInventory.tsx`: semantic summary, search, filters, and repository rows.
- Create `tests/observatory-source-repository-schema.test.ts`: schema limits and privacy-shaped validation.
- Create `tests/observatory-source-repository-discovery.test.ts`: two-root, Git state, mapping, symlink, dedupe, and bounds tests.
- Create `tests/observatory-source-repository-inventory.test.tsx`: accessible UI behavior.
- Modify `lib/observatory/asset-schema.ts`: repository kind and source domain.
- Modify `lib/observatory/collection-schema.ts`: v4 envelope and types.
- Modify `lib/observatory/collector.ts`: v3 → v4 upgrade and stable digest.
- Modify `scripts/observatory/collect.ts`: invoke discovery for explicit roots and publish v4.
- Modify `components/observatory/ObservatoryOverview.tsx`: v4 summary and repository inventory.
- Modify `app/globals.css`: repository inventory layout using existing visual tokens.
- Modify relevant collector, overview, privacy, and script tests for v4.
- Modify `README.md`: document M1 repository coverage and local-only archive-state boundary.

### Task 1: Strict v4 Repository Contract

**Files:**
- Create: `lib/observatory/source-repository-schema.ts`
- Create: `tests/observatory-source-repository-schema.test.ts`
- Modify: `lib/observatory/asset-schema.ts`
- Modify: `lib/observatory/collection-schema.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
import { describe, expect, it } from "vitest";
import {
  ObservatorySourceRepositoryInventorySchema,
  ObservatorySourceRepositorySchema,
} from "@/lib/observatory/source-repository-schema";

const repository = {
  id: "repository:0123456789abcdef",
  name: "glaucon-politeia",
  scope: "workspace",
  local_ref: "workspace/plato/glaucon-politeia",
  maintainer_agent_id: "plato",
  knowledge_area: null,
  github: {
    owner: "GlauconAI",
    repo: "glaucon-politeia",
    url: "https://github.com/GlauconAI/glaucon-politeia",
  },
  current_branch: "main",
  detached: false,
  head: "a".repeat(40),
  default_branch: "main",
  last_commit_at: "2026-07-23T00:00:00.000Z",
  working_tree: "clean",
  activity: "active",
  archive_state: "unknown",
  registry_project_keys: ["plato/dashboard"],
  authority: "observed",
  source: "local-git/workspace",
  collected_at: "2026-07-23T00:00:00.000Z",
  health: "healthy",
};

describe("ObservatorySourceRepositorySchema", () => {
  it("accepts strict safe repository metadata and rejects unknown fields", () => {
    expect(ObservatorySourceRepositorySchema.parse(repository)).toEqual(repository);
    expect(() =>
      ObservatorySourceRepositorySchema.parse({
        ...repository,
        absolute_path: "/Users/private/repository",
      }),
    ).toThrow();
  });

  it("validates repository counts and source health", () => {
    expect(
      ObservatorySourceRepositoryInventorySchema.parse({
        repositories: [repository],
        source_health: {
          status: "fresh",
          health: "healthy",
          collected_at: repository.collected_at,
          last_success_at: repository.collected_at,
          repository_count: 1,
          omitted_count: 0,
        },
      }).repositories,
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/observatory-source-repository-schema.test.ts`

Expected: FAIL because `source-repository-schema.ts` does not exist.

- [ ] **Step 3: Implement the strict schemas**

Define:

```ts
export const ObservatorySourceRepositorySchema = z.strictObject({
  id: RepositoryIdSchema,
  name: SafeTextSchema.min(1),
  scope: z.enum(["workspace", "vault"]),
  local_ref: LogicalSourceSchema,
  maintainer_agent_id: LogicalTokenSchema.nullable(),
  knowledge_area: SafeTextSchema.nullable(),
  github: ObservatoryGitHubRepositorySchema.nullable(),
  current_branch: SafeTextSchema.nullable(),
  detached: z.boolean(),
  head: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u).nullable(),
  default_branch: SafeTextSchema.nullable(),
  last_commit_at: IsoTimestampSchema.nullable(),
  working_tree: z.enum(["clean", "dirty", "unknown"]),
  activity: z.enum(["active", "stale", "unknown"]),
  archive_state: z.enum(["active", "archived", "unknown"]),
  registry_project_keys: z.array(SafeTextSchema.min(1)).max(32),
  authority: z.literal("observed"),
  source: z.enum(["local-git/workspace", "local-git/vault"]),
  collected_at: IsoTimestampSchema,
  health: z.enum(["healthy", "degraded", "failed", "unknown"]),
});
```

Set a 1,000-repository maximum, reject duplicate IDs, and require the health `repository_count` to equal the array length. Add `repository` and `source_repositories` to the existing asset enums.

- [ ] **Step 4: Run the schema test and verify GREEN**

Run: `npm test -- tests/observatory-source-repository-schema.test.ts tests/observatory-asset-schema.test.ts tests/observatory-schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Add v4 collection envelope tests**

Extend `tests/observatory-system-collector.test.ts` with a v4 upgrade case asserting:

```ts
expect(upgraded.schema_version).toBe("4.0.0");
expect(upgraded.collector_version).toBe("4.0.0");
expect(upgraded.source_repositories.repositories).toHaveLength(1);
expect(upgraded.source_digest).toBe(computeObservatorySnapshotDigest(upgraded));
expect(ObservatoryCollectionEnvelopeSchema.parse(upgraded)).toEqual(upgraded);
```

- [ ] **Step 6: Run the v4 envelope test and verify RED**

Run: `npm test -- tests/observatory-system-collector.test.ts`

Expected: FAIL because v4 constants, schema, and upgrade do not exist.

- [ ] **Step 7: Implement the v4 envelope**

Add `OBSERVATORY_COLLECTION_SCHEMA_VERSION_V4`, `OBSERVATORY_COLLECTOR_VERSION_V4`, `ObservatoryCollectionEnvelopeV4Schema`, and union/type exports. The v4 shape is the v3 shape plus:

```ts
source_repositories: ObservatorySourceRepositoryInventorySchema
```

- [ ] **Step 8: Run the contract tests and commit**

Run: `npm test -- tests/observatory-source-repository-schema.test.ts tests/observatory-asset-schema.test.ts tests/observatory-system-collector.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: add source repository snapshot contract"` after staging new files.

### Task 2: Bounded Two-root Discovery

**Files:**
- Create: `lib/observatory/source-repository-discovery.ts`
- Create: `tests/observatory-source-repository-discovery.test.ts`

- [ ] **Step 1: Write a failing two-root discovery test**

Build real temporary Git repositories with `git init`, one under `workspace/plato/projects/app` and one under `vault/plato-academy/projects/tool`. Configure credential-bearing and SCP-style GitHub remotes. Assert:

```ts
expect(result.repositories.map((item) => item.scope)).toEqual([
  "vault",
  "workspace",
]);
expect(result.repositories).toEqual(
  expect.arrayContaining([
    expect.objectContaining({
      maintainer_agent_id: "plato",
      github: {
        owner: "GlauconAI",
        repo: "app",
        url: "https://github.com/GlauconAI/app",
      },
    }),
    expect.objectContaining({
      knowledge_area: "plato-academy",
      github: {
        owner: "GlauconAI",
        repo: "tool",
        url: "https://github.com/GlauconAI/tool",
      },
    }),
  ]),
);
expect(JSON.stringify(result)).not.toMatch(/token@|\/private\/|commit message/u);
```

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/observatory-source-repository-discovery.test.ts`

Expected: FAIL because the discovery module does not exist.

- [ ] **Step 3: Implement traversal and command boundaries**

Use `lstat`, `readdir`, and `realpath`. Never follow directory symlinks. Skip:

```ts
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
  ".cache",
  ".worktrees",
  "worktrees",
  "__pycache__",
]);
```

Enforce depth 8, 50,000 visited directories, 1,000 repositories, 5 MiB aggregate Git output, and 10-second command timeout. Commands use fixed argv with `shell: false`.

- [ ] **Step 4: Implement strict Git projection**

Collect:

```text
git -C <path> rev-parse --absolute-git-dir
git -C <path> rev-parse --git-common-dir
git -C <path> rev-parse --verify HEAD
git -C <path> symbolic-ref --quiet --short HEAD
git -C <path> symbolic-ref --quiet --short refs/remotes/origin/HEAD
git -C <path> log -1 --format=%cI
git -C <path> status --porcelain=v1 --untracked-files=normal
git -C <path> remote get-url origin
```

Only the derived strict fields enter output. Validate any Git directory resolved from a `.git` file is inside `workspaceRoot` or `vaultRoot`.

- [ ] **Step 5: Implement safe identity and mapping**

Create IDs from a SHA-256 digest of `scope + canonical Git common directory`. Emit `local_ref` with only root type, exact Agent/knowledge-area segment, repository basename token, and a 10-character non-reversible relative-path digest when needed for collision safety.

Parse only `github.com` HTTPS, SSH, and SCP remotes and emit the canonical HTTPS URL. Strip `.git`, credentials, port, query, and fragment. Match registry projects by exact normalized project key suffix, name, or title.

- [ ] **Step 6: Add edge-case tests**

Cover:

- symlinked directory ignored;
- `.git` file outside both roots rejected;
- duplicate common Git directory emitted once;
- detached HEAD;
- dirty output reduced to a boolean;
- invalid/missing remote becomes `github: null`;
- old commit becomes `stale`;
- fuzzy project name does not map;
- traversal limit returns sanitized failure health.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- tests/observatory-source-repository-discovery.test.ts tests/observatory-source-repository-schema.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: discover safe source repository metadata"` after staging new files.

### Task 3: Snapshot Upgrade And Collection Pipeline

**Files:**
- Modify: `lib/observatory/collector.ts`
- Modify: `scripts/observatory/collect.ts`
- Modify: `tests/observatory-collector.test.ts`
- Modify: `tests/observatory-refresh-script.test.ts`

- [ ] **Step 1: Write failing v4 upgrade and script-wiring tests**

Test that `upgradeObservatorySnapshotToV4(v3, inventory)`:

- rejects invalid repository input;
- preserves v3 delivery governance;
- projects repository assets and `maintains` / `contains` relationships only for known endpoints;
- replaces the digest in both envelope and registry source.

Test that collection with explicit roots invokes repository discovery and emits v4, while the legacy no-root command still emits v1.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/observatory-collector.test.ts tests/observatory-refresh-script.test.ts`

Expected: FAIL because v4 upgrade and script wiring are absent.

- [ ] **Step 3: Implement deterministic v4 upgrade**

Parse both inputs before constructing output. Derive one repository asset per repository and relationships only when endpoints exist. Sort repositories, assets, and relationships deterministically before digest computation.

- [ ] **Step 4: Wire the collection script**

After v3 governance collection:

```ts
snapshot = upgradeObservatorySnapshotToV4(
  governanceSnapshot,
  await collectSourceRepositories({
    workspaceRoot: resolve(options.systemRoots.workspaceRoot),
    vaultRoot: resolve(options.systemRoots.vaultRoot),
    agents: governanceSnapshot.agents,
    projectGroups: governanceSnapshot.registry.project_groups,
  }),
);
```

Use the shared fixed-argv command runner adapter and no shell strings.

- [ ] **Step 5: Run focused pipeline tests and commit**

Run: `npm test -- tests/observatory-collector.test.ts tests/observatory-refresh-script.test.ts tests/observatory-system-collector.test.ts`

Expected: PASS.

Commit: `git commit -am "feat: collect source repositories into snapshot v4"`.

### Task 4: Privacy And Real-fixture Verification

**Files:**
- Modify: `lib/observatory/privacy-scan.ts`
- Modify: `tests/observatory-privacy-scan.test.ts`
- Modify: `scripts/observatory/verify-snapshot.ts`

- [ ] **Step 1: Add failing privacy fixtures**

Build a v4 payload containing:

- `https://user:token@github.com/owner/repo.git`;
- `/Users/glaucon/private/repo`;
- `person@example.com`;
- a commit message;
- an untracked filename.

Assert the scanner rejects these values, while accepting canonical `https://github.com/owner/repo`.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/observatory-privacy-scan.test.ts`

Expected: FAIL for at least the credential-bearing remote or absolute path fixture not currently covered by repository-specific verification.

- [ ] **Step 3: Extend privacy validation**

Keep the existing global scan and add repository-specific checks that permit only canonical GitHub HTTPS URLs and logical root references. Never log rejected values.

- [ ] **Step 4: Run privacy and snapshot tests and commit**

Run: `npm test -- tests/observatory-privacy-scan.test.ts tests/observatory-schema.test.ts tests/observatory-publisher.test.ts`

Expected: PASS.

Commit: `git commit -am "test: harden repository snapshot privacy"`.

### Task 5: Accessible Repository Inventory

**Files:**
- Create: `components/observatory/SourceRepositoryInventory.tsx`
- Create: `tests/observatory-source-repository-inventory.test.tsx`
- Modify: `components/observatory/ObservatoryOverview.tsx`
- Modify: `tests/observatory-overview.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing component tests**

Render two repositories and assert:

```ts
expect(screen.getByRole("region", { name: /source repositories/i })).toBeInTheDocument();
expect(screen.getByText("2 repositories")).toBeInTheDocument();
expect(screen.getByText("1 GitHub linked")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "GlauconAI/app" })).toHaveAttribute(
  "href",
  "https://github.com/GlauconAI/app",
);
```

Change the labelled searchbox and native scope/state/activity selects. Assert non-matching rows disappear and the empty-result explanation remains.

- [ ] **Step 2: Run and verify RED**

Run: `npm test -- tests/observatory-source-repository-inventory.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component**

Use `useMemo` and native controls. Render summary counts and a semantic `<ul>`. Display the first 12 HEAD characters, `Not recorded` for missing facts, and `Archive status unknown` rather than inferring archive state.

- [ ] **Step 4: Integrate v4 overview**

For snapshots containing `source_repositories`, add the repository count to the summary and render the inventory after `FreshnessSummary`. Keep v1-v3 behavior unchanged.

- [ ] **Step 5: Add bounded responsive CSS**

Reuse `.observatory-panel-heading`, form-control, badge, and health color tokens. Use responsive grid/list rules and visible focus styles. Do not introduce fixed viewport heights or horizontal-only interaction.

- [ ] **Step 6: Run UI tests and commit**

Run: `npm test -- tests/observatory-source-repository-inventory.test.tsx tests/observatory-overview.test.tsx tests/observatory-system-inventory.test.tsx`

Expected: PASS.

Commit: `git commit -am "feat: show source repository observatory"`.

### Task 6: Documentation, Review, And Production Candidate Gate

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-23-dashboard-source-repository-observatory.md`

- [x] **Step 1: Document the operating boundary**

Record:

- two explicit roots;
- local Git metadata only;
- archive state stays unknown without a trusted enrichment source;
- no repository file content, raw remote, author, email, diff, or status filename is published;
- production release requires explicit authorization.

- [x] **Step 2: Run focused verification**

Run:

```bash
npm test -- \
  tests/observatory-source-repository-schema.test.ts \
  tests/observatory-source-repository-discovery.test.ts \
  tests/observatory-source-repository-inventory.test.tsx \
  tests/observatory-collector.test.ts \
  tests/observatory-privacy-scan.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check 0a8959e..HEAD
```

Expected: all commands exit 0.

- [x] **Step 4: Run real two-root collection locally**

Collect against the approved workspace and Vault roots into a task-owned temporary file. Run `observatory:verify-snapshot` with the positional file path. Inspect only bounded aggregate fields:

- schema version;
- repository count;
- scope counts;
- GitHub-linked count;
- dirty/stale/unknown counts;
- privacy-scan result.

Do not print absolute source paths, raw remotes, repository file names, or credentials.

- [x] **Step 5: Request code review**

Review the committed range `0a8959e..HEAD` against the design and this plan. Fix every Critical and Important issue, rerun affected tests, and record any accepted Minor issue.

Self-review note: session policy did not permit delegating a review subagent.
The committed range and pending documentation were reviewed directly. The
review found and fixed three Important issues: a root Git repository masking
nested Agent repositories, repository-configured filesystem monitors being
eligible to run during `git status`, and colliding safe logical references.
The stale canonical-registry path in this runbook was also corrected. No
Critical or Important issue remains. Accepted boundary: archive state remains
`unknown` without a separately approved trusted enrichment source.

- [ ] **Step 6: Re-run final evidence and commit**

After the review fixes and documentation:

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check 0a8959e..HEAD
git status --short
```

Expected: all verification commands exit 0 and the feature worktree is clean.

Commit: `git commit -am "docs: record source repository production candidate"`.
