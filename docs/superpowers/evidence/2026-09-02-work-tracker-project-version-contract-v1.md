# Work Tracker Project Version Contract v1 — Implementation Evidence

## Scope and approved inputs

- Canonical Project Flow contract: `project-flow-version-control-v1.md`
  - SHA-256: `8e4394f7526a75a32ccecc0750c7b2eefe063a200a800a9867da6f012566814a`
- Executor handoff: `work-tracker-project-version-control-handoff.md`
  - SHA-256: `2b090e651c5b168a447bd34de1ec832f1fae929012a676dcec074474093fa6b1`
- Transfer mode: `project_executor`
- Implementation branch: `feat/work-tracker-version-contract-v1`
- Rebased implementation base: `58cf05961785d2ef2e3e307a9b128852e0bc8ad7`
- Diff against `origin/main` before final evidence commit: 29 files, 3,810 insertions, 112 deletions.

The implementation changes Work Tracker only. It does not change the Orchestrator canonical contract, any existing Project version scope, execution admission, approved Plan authority, Gateway lifecycle, or external delivery state.

## Delivered contract

- Strict formal `MAJOR.MINOR.PATCH` and six lifecycle states.
- One `active | gate_ready` execution version per Project.
- Project-scoped Product Version roadmap with release target, Milestone, predecessor, target/actual dates, acceptance and Gate evidence, roadmap ref, and approved Plan ref.
- Exactly one normalized Product Version binding per Work Item, classified `required | optional`.
- Released/archived scope immutability and closed terminal bindings, while preserving unchanged historical bindings.
- Server-side release Gate, optimistic concurrency, audit events, admin-only RPCs, exact RLS/ACL and RPC-inventory verification.
- Compatibility overloads that preserve bounded prior RPC input shapes through the v1 safety boundary; prior lifecycle semantics are intentionally not restored.
- Stable sanitized repository/action errors for SemVer, duplicate version, execution/release-target conflicts, predecessor errors, immutable history, closed bindings, and incomplete release Gate.
- Transaction-wrapped additive migration plus source, read-only preflight, status, local-only apply, and local-only concurrency verifier modes.

## Verification evidence

### Complete local quality gate

Command: `npm run release:verify`

- Test files: 137 passed.
- Tests: 1,014 passed.
- ESLint: passed.
- TypeScript (`tsc --noEmit`): passed.
- Diff check: passed.
- Result: `RELEASE_VERIFY_RESULT.ok=true`.

The final gate ran after all implementation and review fixes; no file changed while it was running.

### Migration/source verifier

Command: `npm run observatory:project-version-contract-v1 -- --mode source`

Result: passed all source checks: transaction boundary, schema contract, preflight guards, deterministic legacy timestamp backfill, portfolio indexes, canonical constraints, predecessor integrity, lifecycle/release Gates, rolling release-target retirement, terminal Work Item scope, serialized mutation validation, security/audit, and forward-only recovery guidance.

### Production read-only preflight and rollback migration rehearsal

Command: `npm run observatory:project-version-contract-v1:deploy -- check`

- Production identity was pinned to Supabase project ref `fiicazfhjkviqaaaiksp` before any connection.
- Preflight: `blockingIssueCount=0`.
- Warnings: two legacy released/archived rows lack `released_at`; the migration deterministically backfills from the row's existing `updated_at`/`created_at` history.
- The complete migration, migration-history record, and all 33 database status checks executed inside a transaction and then rolled back.
- Work Item `updated_at` values were identical before and after the rehearsal.
- No production schema or data change remained after the check.

### Production build

The final local gate covers tests, ESLint, TypeScript, and diff checks. The repository's protected GitHub `verify` job remains the release authority for the default Turbopack production build and production dependency audit before merge.

## Independent review

The complete diff received iterative independent read-only review. Initial Important findings covered prior-app rollback compatibility, stable duplicate errors, invalid terminal picker options, unchanged historical terminal bindings, and exact overload inventory. They were fixed in `03a89e7` and `a05b8c0` with RED/GREEN regression tests.

The final independent review found no Critical issues and initially found five Important production-readiness gaps: apply-time verification after commit, insufficient production target pinning, inaccurate prior-app rollback claims plus legacy SemVer drift, cancelled-target retirement, and an overly textual trigger status check. All were corrected and re-reviewed. Final verdict: `Ready to merge`. Focused verification passed 45 tests; the final owner gate passed 1,014 tests.

## Compatibility and data decisions

- Existing labels and scope text are preserved. Parseable legacy labels are normalized only into the additive `semver` field.
- Existing Work Items receive conservative `optional` binding classification; their Product Version binding and Project scope are not rewritten.
- New TypeScript row fields remain optional for migration-before-application compatibility and legacy fixtures; repository selects request the complete v1 field set.
- Backlog remains a compatibility Product Version, cannot be a formal release target, and cannot be released.
- Release-target uniqueness is enforced across the Project. Releasing the current target atomically retires its marker, allowing the next Project version to become the release target while the transition audit snapshot preserves the prior target state.

## Production status and stop condition

- Migration persisted in source: yes.
- Production read-only preflight and rollback rehearsal: passed, with 0 blocking issues and 2 deterministic legacy timestamp warnings.
- Production migration applied: no.
- Database status verification in rollback transaction: passed all 33 checks.
- Branch pushed / PR created: no.
- Merge: no.
- Deploy: no.
- Gateway restart or external business send: no.

Production remains `persisted-but-not-applied`. User authorization and the real preflight/rehearsal Gate are now complete; the remaining release sequence is PR/CI, production migration, merge/deploy, and exact-SHA production smoke.

## Forward-only rollback

If the migration is later authorized and applied:

1. Keep the additive schema, historical Product Version rows, Work Item bindings, and audit events.
2. Keep the v1 application contract active; do not roll back to a pre-v1 lifecycle UI after the migration.
3. Correct v1 mutation entry points with a reviewed forward application or migration if a defect is found.
4. Never drop the version tables, delete audit history, rewrite released scope, or rewrite migration history.
