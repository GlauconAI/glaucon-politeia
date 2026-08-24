# Project Control P0-A Acceptance

- Date: 2026-08-23
- Owner: Plato
- Result: accepted for P0-A production use
- P0-B status: waiting for the Orchestrator-owned public producer; no synthetic Project Control facts were published

## Delivered boundary

- Observatory collection envelope: `6.0.0` with v1-v5 read compatibility.
- Project Control public projection: `1.0.0`.
- Authority: OpenClaw Orchestrator remains the only Project authority. 402V is a read-only control tower for Project, Plan Revision, Stage, execution line, Work Package, Artifact, Verification, Gate, User Decision, and Outcome Review facts.
- Source boundary: one explicit absolute `project-control-snapshot.json` path, exact basename, realpath containment, bounded size, strict Zod allowlist, canonical SHA-256 digest, aggregate privacy scan, and last-known-good retention. The consumer never scans Vault content, Thin Work, sessions, messages, or private Agent state for Project Control facts.
- Fail-closed rules: authority invariants, Stage eligibility, terminal-state consistency, controller/transfer-mode consistency, Decision audit completeness, cross-record references, imported baselines, plan-revision drift, and Artifact history must reconcile before the projection is accepted.
- Work Tracker binding: additive nullable `project_key`, `plan_revision`, `stage_id`, and `work_package_id` fields plus compatible 10- and 14-argument update RPCs. Work Item state changes cannot mutate a parent Stage, Gate, or Decision.
- UI:
  - `/dashboard/projects`: Project Control portfolio, Project Directory, freshness and safe unavailable states.
  - `/dashboard/projects/[project-key]`: Project summary, Plan Revision, Stage DAG, execution lines, next-admissible Stages, Artifact/Verification/Gate/Outcome ledgers, and bound Work Packages.
  - `/dashboard/decisions`: pending and recorded Decisions, evidence/options/impact/downstream details, and filters.
  - `/dashboard/work-items/[id]`: stable Project Control binding with explicit unbound and unavailable states.
- Deferred by design: revision diff/impact analysis/minimal rework packages (P1) and Agent Claim activation (P2).

## Approved artifacts

| Artifact | SHA-256 |
| --- | --- |
| `docs/superpowers/specs/2026-08-23-dashboard-project-control-p0-design.md` | `e5df95e8ce63212ccc136f4075e6530cc966e78591f03d79539471bc0553565a` |
| `docs/superpowers/specs/2026-08-23-project-control-projection-contract-v1.md` | `0ae6b6387ada5a8329648f98194af5abac2b3ca5548a34b3330b1e49356beb89` |
| `docs/superpowers/plans/2026-08-23-dashboard-project-control-p0-a.md` | `bff5a72f9f59c0e5a99ace4a69506f79a5146af86d87f43a9987c1502dcb7ffc` |
| Socrates producer handoff `2026-08-23-402v-project-control-producer-contract.md` | `9a27b7639b1119f28dfadfb211890878b02efd0e765098fb784c62a2027b6dbc` |

## Exact implementation commits

1. `bb3756c` — `docs: design project control p0`
2. `be110cf` — `docs: plan project control p0-a`
3. `0d0861b` — `feat: define project control projection`
4. `ad45a4a` — `feat: collect project control snapshots`
5. `21583f5` — `feat: derive project control views`
6. `6f5e502` — `feat: add project control views`
7. `31e3a0e` — `feat: bind work items to project control`
8. `b03bcae` — `fix: preserve legacy work item update rpc`
9. `e7bc053` — `fix: harden project control release boundary`
10. `166a20c` — `fix: close project control trust gaps`
11. `fb7fa25` — `fix: enforce project control contract invariants`
12. `6f005ef` — `fix: fail closed on control readiness`
13. `0e4fd62` — `fix: validate execution line authority`
14. `eca6a3a` — `fix(observatory): close project control authority gaps`
15. `7ebca54` — `fix(observatory): synchronize execution roles`
16. `f6d1bcd` — `fix(observatory): publish v6 through refresh`
17. `05c1e0c` — `fix(observatory): require v6 control input`

Relative to base `9527b4fd8c3ff3c49180516440f715a6d1798c8f`, P0-A changes 47 files with 5,179 insertions and 27 deletions before this acceptance record.

## Verification evidence

### Contract, tests, static analysis, and build

- Independent code review: clear after the authority-contract fixes at `7ebca54`; clear again after the final v6 release-path fix at `05c1e0c`.
- Focused Project Control suite: 24 files, 72 tests passed.
- Strict schema suite: 25/25 passed.
- Final v6 refresh-path suite: 6/6 passed.
- Full serialized Vitest at final code HEAD: 252 files, 795 tests passed.
- Default parallel full suite passed 252 files / 794 tests before the release-path-only commits. At final HEAD, constrained host load caused unrelated HTML Note Kit timeouts; isolated reruns passed and the final serialized full suite passed 795/795.
- ESLint: passed.
- TypeScript `tsc --noEmit`: passed.
- `git diff --check`: passed.
- Next.js 16.2.6 production build: passed; 28/28 static pages generated.

### Database migration

- Migration order: the additive Work Tracker binding migration was applied and verified before deploying the consumer.
- Binding columns: all four nullable columns exist.
- Existing rows: 2 total Work Items, 0 bound, 0 partially bound; legacy behavior is preserved.
- Update RPCs: both 10-argument legacy and 14-argument binding-aware overloads exist.
- RPC security: `SECURITY DEFINER`, `search_path=pg_catalog`, authenticated execute allowed, anonymous execute denied.
- The migration does not grant Dashboard authority over Project Stage, Gate, or Decision state.

### Production Observatory v6

- Refresh: `OBSERVATORY_REFRESH_OK`.
- Verification: `OBSERVATORY_SNAPSHOT_OK`.
- Retention: `OBSERVATORY_RETENTION_OK deleted=0`.
- Release evidence: marked and retained.
- Published schema / collector: `6.0.0` / `6.0.0`.
- Source digest: `d54f9f04498ef01ce87b9eaaf85e71db78f9cfd4ea14c706bfe6a2af65a77397`.
- Snapshot inventory: 1,665 assets, 1,503 relationships, 9 source-health domains, 7 repositories.
- Privacy scan: all eight denylist categories reported zero findings.
- Source file mode: `0600`; embedded digest and persisted digest matched.
- Project execution and Project Control sources were absent at refresh time, so v6 safely published `null` projections with explicit unknown/degraded states. No private state was scanned and no production Project fact was inferred.

### Production deployment and authenticated browser

- Deployment: `dpl_CqarYridKaGVXGLcn4HMCE9Fego3`, state `READY`.
- Immutable URL: `https://glaucon-politeia-mzunxu4sz-plato-8448s-projects.vercel.app`.
- Production alias: `https://402v.com`.
- Authenticated `/dashboard/projects`:
  - renders Project Control and Project execution safe unavailable states plus the canonical Project Directory;
  - search reduced 64 Projects to the single Asgard Project result;
  - owner filter executed and restored without error;
  - `1440×1000` and `390×844` both had document width equal to viewport width and no horizontal overflow.
- Authenticated `/dashboard/decisions`:
  - renders the explicit fail-closed state: no Decision is inferred from chat, Vault files, or private runtime state;
  - both tested viewports had no horizontal overflow.
- Existing Work Tracker compatibility:
  - `/dashboard/work-items/6b59ca0f-7480-4a21-8eb0-15d03ac8db4d` rendered successfully;
  - the legacy item remained `Not bound`, preserved its history, and displayed the Project Control unavailable state;
  - `1440×1000` and `390×844` had no horizontal overflow.
- Scoped axe-core audits on Projects, Decisions, and the legacy Work Item at desktop/mobile sizes reported 0 violations. Gradient color contrast remained indeterminate because of layered backgrounds; the existing Project Directory count `div` also remained an incomplete ARIA heuristic.
- Browser console messages: none.
- Browser page errors: the known shared-shell React production error `#418` was observed; routes remained functional and this is tracked below as independent technical debt.
- The one-time verification session was closed and the temporary authentication helper was moved to Trash. No password was created or changed.

## Known limitations

1. P0-B is intentionally not complete: the Orchestrator producer has not yet published a real `project-control-snapshot.json`. Production therefore shows the explicit Project Control unavailable state instead of Asgard Plan v3 facts. The strict consumer, selectors, UI states, privacy rules, and fixtures are complete and ready for the producer contract.
2. The Project execution producer export was also absent during the final refresh; the existing v5-compatible consumer remains available and shows the explicit unknown state.
3. Agent-browser records the pre-existing shared-shell React hydration error `#418` on Dashboard routes. It is independent of Project Control and should be fixed as a separate bounded change.
4. Axe reported no violation, but could not conclusively calculate gradient color contrast and flagged the pre-existing Project Directory count `div` as an incomplete ARIA heuristic.
5. `npm install` reports 9 existing dependency audit findings (1 low, 8 high) plus install-script allowlist warnings. P0-A adds no dependency.
6. Default parallel Vitest can exceed unrelated HTML Note Kit test timeouts under constrained host load. The complete serialized release suite is stable and passed 795/795.
7. The production scheduler must receive the exact Project Control producer path when P0-B is activated. The final refresh command now fails closed if that sixth source argument is omitted, preventing a silent v5 downgrade.

## Rollback

1. Promote pre-P0-A deployment `dpl_8c9i9QCg8SDRRQRcrRoAPPwUsqge` back to `https://402v.com`.
2. From the pre-P0-A checkout, publish a new v5 last-known-good Observatory row; do not delete immutable v6 rows.
3. Keep the additive nullable binding columns and both RPC overloads. Existing Work Items are unbound and backward-compatible; dropping columns is unnecessary and riskier than leaving them dormant.
4. Revert P0-A commits in reverse order only if a source rollback is required, then rerun schema, privacy, full test, build, refresh, retention, and authenticated browser gates.
5. Do not alter Orchestrator Project facts, paused Asgard Work, Agent Claim state, or private Agent/session data during rollback.

## Release conclusion

P0-A is production accepted. 402V can safely consume and present the public Project Control contract, bind Work Items without authority escalation, and fail closed when the producer is absent. P0-B begins only after the Orchestrator-owned producer emits a contract-valid public snapshot; until then, the production unavailable state is the correct result.
