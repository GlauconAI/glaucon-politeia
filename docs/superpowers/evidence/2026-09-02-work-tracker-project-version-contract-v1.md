# Work Tracker Project Version Contract v1 — Implementation Evidence

## Scope and approved inputs

- Canonical Project Flow contract: `project-flow-version-control-v1.md`
  - SHA-256: `8e4394f7526a75a32ccecc0750c7b2eefe063a200a800a9867da6f012566814a`
- Executor handoff: `work-tracker-project-version-control-handoff.md`
  - SHA-256: `2b090e651c5b168a447bd34de1ec832f1fae929012a676dcec074474093fa6b1`
- Transfer mode: `project_executor`
- Implementation branch: `feat/work-tracker-version-contract-v1`
- Implementation head before this evidence file: `a05b8c0246de08c27a8cc862082bb78a670d1d67`
- Diff against `origin/main`: 27 files, 3,624 insertions, 112 deletions.

The implementation changes Work Tracker only. It does not change the Orchestrator canonical contract, any existing Project version scope, execution admission, approved Plan authority, Gateway lifecycle, or external delivery state.

## Delivered contract

- Strict formal `MAJOR.MINOR.PATCH` and six lifecycle states.
- One `active | gate_ready` execution version per Project.
- Project-scoped Product Version roadmap with release target, Milestone, predecessor, target/actual dates, acceptance and Gate evidence, roadmap ref, and approved Plan ref.
- Exactly one normalized Product Version binding per Work Item, classified `required | optional`.
- Released/archived scope immutability and closed terminal bindings, while preserving unchanged historical bindings.
- Server-side release Gate, optimistic concurrency, audit events, admin-only RPCs, exact RLS/ACL and RPC-inventory verification.
- Compatibility overloads that delegate prior application RPC signatures through the v1 safety boundary.
- Stable sanitized repository/action errors for SemVer, duplicate version, execution/release-target conflicts, predecessor errors, immutable history, closed bindings, and incomplete release Gate.
- Transaction-wrapped additive migration plus source, read-only preflight, status, local-only apply, and local-only concurrency verifier modes.

## Verification evidence

### Complete local quality gate

Command: `npm run release:verify`

- Test files: 134 passed.
- Tests: 983 passed.
- ESLint: passed.
- TypeScript (`tsc --noEmit`): passed.
- Diff check: passed.
- Result: `RELEASE_VERIFY_RESULT.ok=true`.

After isolating generated `.next` output from the build probes, `npm run typecheck` passed again and the worktree contained no uncommitted application changes.

### Migration/source verifier

Command: `npm run observatory:project-version-contract-v1 -- --mode source`

Result: passed all source checks: transaction boundary, schema contract, preflight guards, portfolio indexes, canonical constraints, predecessor integrity, lifecycle/release Gates, terminal Work Item scope, serialized mutation validation, security/audit, and rollback guidance.

### Read-only database preflight Gate

Command was deliberately executed with both database URL variables unset:

`env -u OBSERVATORY_DATABASE_URL -u OBSERVATORY_LOCAL_DB_URL npm run observatory:project-version-contract-v1 -- --mode preflight`

Result: failed closed with `Database preflight mode requires OBSERVATORY_DATABASE_URL or OBSERVATORY_LOCAL_DB_URL.` No connection or write was attempted. Production preflight, migration apply, post-apply status, and concurrency exercise were not run because no production/database authorization was granted. The implementation therefore remains at the persisted-but-not-applied Gate.

### Production build probes

- `npm run build` reached the Next.js 16 Turbopack production builder but the execution environment denied Turbopack's temporary local port binding with `EPERM`. Repeating outside the normal sandbox returned the same host restriction.
- `next build --webpack` compiled the application successfully, then Next-generated type validation reported two pre-existing errors in unchanged files:
  - `app/api/dashboard/work-items/claims/[id]/route.ts`
  - `app/work-tracker/page.ts`
- Neither file appears in `origin/main..a05b8c0`. The repository's canonical `release:verify` typecheck passed before and after isolating `.next`, so these build findings are recorded as existing release-environment/baseline blockers rather than regressions in this implementation.

## Independent review

The complete diff received iterative independent read-only review. Initial Important findings covered prior-app rollback compatibility, stable duplicate errors, invalid terminal picker options, unchanged historical terminal bindings, and exact overload inventory. They were fixed in `03a89e7` and `a05b8c0` with RED/GREEN regression tests.

Final independent review of `origin/main..a05b8c0` found no Critical or Important issues. Its focused verification passed 122 tests; the final owner quality gate subsequently passed 983 tests.

## Compatibility and data decisions

- Existing labels and scope text are preserved. Parseable legacy labels are normalized only into the additive `semver` field.
- Existing Work Items receive conservative `optional` binding classification; their Product Version binding and Project scope are not rewritten.
- New TypeScript row fields remain optional for migration-before-application compatibility and legacy fixtures; repository selects request the complete v1 field set.
- Backlog remains a compatibility Product Version, cannot be a formal release target, and cannot be released.
- Release-target uniqueness is enforced across the Project as approved. Because released/archived records are immutable, moving the marker after a release is an unresolved product-semantics question; it must be reconciled before production application if Projects need a rolling future release target.

## Production status and stop condition

- Migration persisted in source: yes.
- Production read-only preflight: not run.
- Production migration applied: no.
- Database status/concurrency verification: not run.
- Branch pushed / PR created: no.
- Merge: no.
- Deploy: no.
- Gateway restart or external business send: no.

The required stop condition is active: production remains `persisted-but-not-applied` pending explicit authorization and review of real preflight output plus the release-target lifecycle semantic noted above.

## Forward-only rollback

If the migration is later authorized and applied:

1. Keep the additive schema, historical Product Version rows, Work Item bindings, and audit events.
2. Roll back application code to the prior revision if needed; compatibility overloads preserve its RPC signatures while routing mutations through v1 safety checks/defaults.
3. Disable or correct new v1 mutation entry points with a reviewed forward migration if a database defect is found.
4. Never drop the version tables, delete audit history, rewrite released scope, or rewrite migration history.
