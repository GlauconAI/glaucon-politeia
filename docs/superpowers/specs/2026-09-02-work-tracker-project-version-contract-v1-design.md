# Work Tracker Project Version Contract v1 Design

## Goal

Bring the existing Work Tracker Project Version feature into conformance with the approved `project-flow-version-control-v1` contract without changing any existing Project's version scope or Orchestrator authority.

## Approved inputs

- Canonical contract SHA-256: `8e4394f7526a75a32ccecc0750c7b2eefe063a200a800a9867da6f012566814a`
- Executor handoff SHA-256: `2b090e651c5b168a447bd34de1ec832f1fae929012a676dcec074474093fa6b1`
- Transfer mode: `project_executor`

These inputs are the approved product design. This document records the Work Tracker implementation delta; it does not revise the canonical contract.

## Reuse decision

Use `adapt`. Keep the existing normalized `observatory_project_versions` entity, audit table, Work Item foreign key, admin-only RPC boundary, optimistic concurrency, project-scoped picker, manager, and repository. Add a second additive migration and extend the current UI. Do not rebuild the feature or encode versions in `milestone_ref`.

## Data model delta

Extend `observatory_project_versions` with:

- canonical SemVer in `semver` for formal versions;
- `gate_ready` and `cancelled` lifecycle states;
- `is_release_target` with one release target per Project;
- `milestone_ref`, `predecessor_version_id`, `roadmap_ref`, and `approved_plan_ref`;
- `acceptance_summary`, `actual_date`, and Gate evidence fields;
- `dependencies_summary` plus explicit dependency, Artifact, Verification, roadmap-reconciliation, and User Gate checks.

Extend `observatory_work_items` with `version_binding_kind = required | optional`. The existing `project_version_id` remains the single normalized Product Version binding. Released and archived versions reject new or changed Work Item bindings. Existing rows receive the conservative `optional` classification; no Project scope text, lifecycle, or binding is rewritten.

## Compatibility and migration

The migration is additive and transaction-wrapped. It normalizes only parseable legacy labels into a separate SemVer field (`v0.2` becomes `0.2.0`) and leaves non-parseable or Backlog labels without a formal SemVer. It preserves free-text `milestone_ref` on Work Items and exposes an explicit version-level milestone reference rather than inferring scope from legacy text.

Before enforcing the one-execution-version invariant, the migration checks for Projects with more than one `active` or `gate_ready` version. It fails closed instead of selecting a winner. It also refuses to make the Work Item binding mandatory while unresolved legacy rows remain. Production application therefore stops at the persisted-but-not-applied Gate until an authorized operator reviews the preflight output.

Rollback is forward-only: keep historical rows and audit events, deploy the prior application revision, and disable new v1 mutation entry points. Do not drop the version tables or rewrite released history.

## Lifecycle and release Gate

The status graph is:

`planned -> active -> gate_ready -> released -> archived`

`planned` and `active` may transition to `cancelled`. `gate_ready` may return to `active`. `archived` and `cancelled` are terminal.

The transition RPC serializes the row and enforces:

- at most one `active` or `gate_ready` version per Project;
- all required Work Items are in `done` before release;
- acceptance summary, accepted Artifacts, completed Verification, satisfied dependencies, reconciled roadmap, and an explicit User Gate reference before release;
- release does not happen as a side effect of Work Item completion.

Version binding remains operational metadata only. No UI action admits a Stage, changes an approved Plan, or authorizes Project execution.

## UI

The existing manager becomes a compact project roadmap. Each formal version shows SemVer, lifecycle, release-target marker, milestone, predecessor, target/actual date, acceptance summary, Gate readiness, roadmap reference, and approved Plan reference. Create/edit forms expose the same operational fields. Work Item capture/detail exposes whether its sole version binding is required or optional.

Backlog stays available for compatibility but is never a formal release target and cannot be released.

## Error handling

- Invalid SemVer, illegal transitions, second execution version, released/archived scope mutation, incomplete release Gate, and mismatched Project/version bindings fail with stable repository errors.
- Read failure continues to fail closed at the existing Work Tracker unavailable boundary.
- Migration preflight reports unresolved legacy bindings, duplicate execution versions, invalid formal labels, and predecessor inconsistencies without changing production data.

## Verification

- Domain tests cover SemVer and the exact lifecycle graph.
- SQL contract tests cover columns, constraints, audit, immutable released scope, one-execution-version enforcement, required Work Item Gate checks, and grants/RLS.
- Repository/action/component tests cover the expanded RPC payloads, error mapping, roadmap presentation, and binding kind.
- Full local gate is `npm run release:verify`, followed by a production build and `git diff --check`.
- Production migration is not applied without new explicit authorization.

## Self-review

No placeholders remain. The design preserves Orchestrator authority, existing scope, current Work Tracker behavior, and the stated stop conditions. The only compatibility inference is SemVer normalization into a new field; original labels remain unchanged.
