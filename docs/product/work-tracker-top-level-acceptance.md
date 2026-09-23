# Work Tracker Top-Level Surface Acceptance

Date: 2026-08-24
Status: Local implementation accepted; production release pending explicit authorization

## Approved scope

- Work Tracker is an admin-only top-level product surface at `/work-tracker`, peer to Dashboard and Orchestrator.
- Canonical Work Item details are served from `/work-tracker/items/[id]`.
- Dashboard no longer reads or renders Quick Capture, the Work Tracker board, or Work Tracker section navigation.
- Existing `/dashboard/work-items/[id]` links permanently redirect to the canonical detail route.
- Existing workflow, Ready Gate, evidence ledger, audit history, optimistic concurrency, Project Control bindings, and bounded Agent Claim rules are reused without database or authority changes.

## Authoring language

Work Tracker titles, descriptions, and acceptance criteria default to Chinese. Common English product names, technical terms, code identifiers, paths, APIs, and commit hashes remain valid. This is guidance, not a language validation gate, so existing English and reasonable mixed-language Items remain editable.

The same rule is stored in Plato's workspace `AGENTS.md` and shown in Quick Capture and Work Item editing.

## Route and cache behavior

| Purpose | Canonical route | Compatibility behavior |
| --- | --- | --- |
| Work Tracker board and capture | `/work-tracker` | Dashboard contains no embedded tracker |
| Work Item detail | `/work-tracker/items/[id]` | `/dashboard/work-items/[id]` permanently redirects |
| Capture and mutation refresh | `/work-tracker` and canonical detail | Dashboard cache is not refreshed by Work Tracker writes |

## Security and authority boundaries

- The top-level page and canonical detail keep request-time administrator authorization.
- Anonymous visitors are redirected before repository reads.
- Dependency failures expose bounded generic messages, not internal error details.
- Work Item mutations still cannot change Orchestrator-owned parent Stage, Gate, or Decision state.
- Agent Claim remains disabled by default and preserves its existing bounded authorization contract.

## Verification evidence

- TDD route-separation tests witnessed expected failures before implementation and passed after the new page was added.
- TDD canonical-route tests witnessed missing routes, old links, and absent permanent redirect before implementation, then passed.
- TDD navigation, Chinese guidance, and cache-revalidation tests witnessed expected failures before implementation, then passed.
- Final route and mutation regression suite: 10 files / 58 tests passed.
- Final complete serial suite: 258 files / 801 tests passed, 0 failed. The default parallel suite exposed six existing HTML Note Kit child-process timeout failures; both affected files passed 38/38 in isolation, and the full single-worker run passed 801/801.
- ESLint and TypeScript completed with exit code 0.
- `git diff --check` completed with no output.
- Next.js 16.2.6 production build completed with exit code 0, compiled 28/28 static pages, and emitted `/work-tracker`, `/work-tracker/items/[id]`, and the legacy `/dashboard/work-items/[id]` route.

## Release boundary

No canonical `main` push or 402v production deployment is authorized by the implementation request alone. Release remains blocked until User explicitly authorizes both the exact branch head push and production deployment.

## Project organization release candidate

Date: 2026-08-25
Status: Local implementation accepted; production release pending explicit authorization

The approved Project organization follow-up keeps the default all-Project board and adds a searchable canonical Project filter, prominent Project badges, and required canonical Project selection in Quick Capture and Item detail. Project values are validated against the existing 64-Project Observatory registry in both the client and server path; the create RPC also enforces Project presence at the database boundary.

Full evidence, migration order, browser results, the known pre-existing horizontal-overflow limitation, and rollback coordination are recorded in `docs/product/work-tracker-project-filter-acceptance.md`. The canonical Agent handbook remains aligned to the current production version until this release is explicitly authorized and successfully deployed.
