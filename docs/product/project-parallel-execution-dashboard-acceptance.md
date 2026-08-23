# Project Parallel Execution Dashboard Acceptance

- Date: 2026-08-23
- Owner: Plato
- Result: accepted with the known limitations below

## Delivered contract

- Observatory collection envelope: `5.0.0`
- Project execution producer projection: `1.0.0`
- Read compatibility: Observatory v1, v2, v3, and v4 remain accepted.
- Source boundary: one explicit absolute `project-execution-snapshot.json` path; maximum 5 MiB; realpath-contained; strict Zod allowlist; canonical SHA-256 digest; no Thin Work, session, message, or private Agent-state discovery.
- Public text privacy boundary: every Project title/status/stage/gate, execution-line title, logical reference, and Verification summary rejects embedded POSIX absolute paths, Windows drive/rooted/UNC paths, `~/`, `file://`, and known private workspace/Vault references before digest verification. Normal labels such as `Design / Review`, `iOS/Android`, `A//B comparison`, URLs, and relative logical references remain valid.
- Producer/consumer parity: the Orchestrator producer and Observatory consumer now apply the same absolute/private-path families to public text. The producer remains owned and verified by Socrates; this delivery changes only the consumer.
- Control labels:
  - `project_executor` → `Returns to PM`
  - `independent_owner_line` → `User + Owner line`
  - transferred independent line → `PM no longer waiting`
- UI: portfolio summary, Project cards, responsive execution lanes, five filters, visible collection time, fresh/stale/unknown, unavailable, valid-empty, catalog-only, and runtime-only states.

## Exact implementation commits

1. `fe86f67` — `feat: add Project execution observability`
2. `2f18fd3` — `fix: prevent authenticated header overflow`
3. `5204554` — `fix: expose execution filters as an accessible group`
4. `b80d30d` — `docs: record Project execution Dashboard acceptance`
5. `f31f98f` — `fix: fail closed on project execution paths`

Relative to `origin/main` at `9527b4fd8c3ff3c49180516440f715a6d1798c8f`, the corrected implementation changes 30 files with 2,385 insertions and 50 deletions before this acceptance update.

## Verification evidence

### Code and build

- Focused privacy/Project execution regression: 3 files, 20 tests passed.
- Full Vitest: 108 files, 751 tests passed in the runbook's serialized low-resource mode.
- The default parallel full-suite run exposed five unrelated transient failures (four 5-second HTML Note Kit timeouts and one Work Item form-state assertion); the isolated three-file rerun passed 44/44 and the serialized full suite passed 751/751. No product code was changed for those unrelated tests.
- ESLint: passed.
- TypeScript `tsc --noEmit`: passed.
- `git diff --check`: passed.
- Next.js 16.2.6 production build: passed; 28/28 static pages generated.
- Project execution render budget: 32 Projects × 3 lines stayed below 5,000 DOM nodes.

### Production data

- Corrected release refresh: `OBSERVATORY_REFRESH_OK`, `OBSERVATORY_RETENTION_OK`.
- Published row: schema `5.0.0`, collector `5.0.0`, status `success`.
- Published source digest: `44eef782c168eec1312631723a5be77d9e1b19b232856054bc0e039cd4bbb1c1`.
- Project execution projection digest: `600afbc9352edf4e5117dc6d387024dc25cd67b9dce9d31fab5b627d604769d2`.
- Database row digest, embedded payload digest, and locally verified candidate digest matched.
- The exact v5 digest was marked as retained production release evidence.
- Source-health domains: 8/8.
- Privacy denylist: all eight categories reported zero findings.
- Producer Project execution source was a valid empty `1.0.0` projection at release time.

### Production deployment and browser

- Corrected production deployment: `dpl_8c9i9QCg8SDRRQRcrRoAPPwUsqge`, state `READY`.
- Immutable deployment URL: `https://glaucon-politeia-f8ucp6gla-plato-8448s-projects.vercel.app`.
- Production alias: `https://402v.com`.
- Authenticated `/dashboard/projects` rendered the fresh v5 source, portfolio summary, all five filters, explicit unmatched catalog/runtime states, and the canonical Project Directory.
- Desktop viewport `1440×1000`: document width `1440`, no horizontal overflow.
- Mobile viewport `390×844`: document width `390`, one-column Project/filter grids, no horizontal overflow.
- Production options exposed both transfer-mode labels as text.
- Scoped axe-core audit at 1440×1000 and 390×844: 0 violations; the filters expose an accessible named `group`. Axe left two rules incomplete: gradient color contrast and the pre-existing `aria-label` on the Project directory count `div`.
- One-time browser credential profile was deleted and the verification session was closed.

## Known limitations

1. The producer projection contained zero execution records at release time. Production therefore proves v5 publication plus fresh/unmatched/empty-line behavior; live lane content for both transfer modes is proven by strict schema, collector, component, integration, and performance fixtures. Integration may add only synthetic/new Project data; the paused Asgard Project remains out of scope.
2. Axe marked two checks as `incomplete`: color contrast because the existing page uses layered gradient backgrounds whose effective color it could not calculate, and `aria-prohibited-attr` for the pre-existing Project directory count `div` carrying `aria-label` without an explicit role. It reported no accessibility violation.
3. Agent-browser records React production error `#418` on `/`, `/dashboard`, and `/dashboard/projects`. Route comparison proves this is a pre-existing shared-shell hydration mismatch, not specific to Project execution. The page remains functional, but the shared-shell hydration issue should be handled in a separate bounded fix.
4. `npm install` reports 9 existing dependency audit findings (1 low, 8 high) and three install scripts not yet covered by `allowScripts`; this feature adds no dependency.
5. The repository's default parallel Vitest mode can exceed the 5-second timeout of unrelated HTML Note Kit tests under constrained host load. The documented serialized release command is stable and passed the complete 751-test suite.

## Rollback

1. Promote the pre-feature Ready deployment `dpl_Ae6kyJqCQPQjJDvSo84NJtxNS5iS` (`https://glaucon-politeia-6u2at7v4n-plato-8448s-projects.vercel.app`) back to the production alias.
2. The pre-feature application does not understand an Observatory v5 latest row. From the pre-feature checkout, collect, validate, and publish a new v4 last-known-good row before or immediately after alias rollback. Do not delete the immutable v5 row.
3. No database migration was introduced. No Gateway, plugin runtime, Thin Work, scheduler, or Asgard state rollback is required for the Dashboard code itself.
4. For a privacy-correction-only rollback, revert `f31f98f`; this is not recommended because it reopens the reviewed public-text path leak.
5. For a full source rollback, revert `f31f98f`, `5204554`, `2f18fd3`, and `fe86f67` in that order, then run the full quality and production release gates again. `b80d30d` and the final acceptance update are documentation-only.
