# Dashboard React #418 production acceptance

Date: 2026-08-24  
Production: <https://402v.com>  
Fix commit: `4c7496e7916dd16ea2ac894066acd366c2293048`  
Deployment: `dpl_8jm5xN9rZV954SAeE5T3CfpcuMGB`

## Scope

- Reconcile the accepted Project Control P0-A release with canonical `main`.
- Eliminate the authenticated Dashboard React #418 hydration mismatch.
- Verify visible-button and keyboard Quick Capture submission in production.
- Preserve Project Control authority boundaries and keep Agent Claim disabled.

## Root cause and bounded fix

`SourceRepositoryInventory` and `ProjectDirectory` formatted timestamps without an explicit timezone during server rendering and browser hydration. Vercel rendered in UTC while the authenticated Vancouver browser rendered in `America/Vancouver`, producing different date text for the same timestamp.

The fix pins both formatters to UTC. The red-green regression reproducer is `ff233b2`; the bounded implementation is `4c7496e`.

## Release evidence

- Canonical P0-A commit `1a5b1439225ced34b062a393702d98655dc37a6d` is an ancestor of local and GitHub `main`.
- Local `HEAD` and GitHub `refs/heads/main` were both verified at `4c7496e7916dd16ea2ac894066acd366c2293048` before this acceptance record.
- Vercel deployment `dpl_8jm5xN9rZV954SAeE5T3CfpcuMGB` is Production / Ready and is aliased to `402v.com`.
- Pre-deployment gates passed: 116 test files / 798 tests, ESLint, TypeScript, `git diff --check`, and a 28/28-page Next.js production build.

## Authenticated production acceptance

### Desktop — 1440 × 1000

- `/dashboard` remained authenticated after a full reload.
- Browser errors and console were empty after reload.
- Web Vitals reported no hydration failure and CLS `0.0`.
- axe-core reported 0 violations; two incomplete manual-review groups remain for unsupported `aria-label` semantics and gradient-backed contrast.

### Mobile — 390 × 844

- `/dashboard` remained authenticated after a full reload.
- Browser errors and console were empty after reload; React #418 did not recur.
- axe-core reported one serious violation: `.roadmap-table-wrap` is scrollable but not keyboard focusable. The same two manual-review groups remained incomplete.

### Quick Capture

- A normal visible button click created exactly one Bug and issued one successful Dashboard Server Action (`POST /dashboard` → 200).
- Focusing the native Title input and pressing Enter created exactly one separate Bug and issued one successful Dashboard Server Action (`POST /dashboard` → 200).
- Neither path produced a hydration or runtime error.

## Work Tracker dogfood outcome

Completed with HTTP evidence and Agent Claim disabled:

- `72d2e7e4-788c-475d-8754-a02924e1a1be` — Project Control P0-A canonical-main reconciliation — Done.
- `3e6ae97b-c6ec-404e-b6ba-060791c017b2` — React #418 hydration mismatch — Done.

New production findings retained as real follow-up work:

- `e0683cdb-ee4c-4265-8f73-258496dedf96` — page-level horizontal overflow containment — High / Triage.
- `bc3c6037-a8d8-462b-913b-1bf7ea94ea5b` — mobile scrolling and ARIA semantics — Medium / Triage.

## Accepted boundary

React #418 and canonical-main reconciliation are accepted. The independent responsive containment and accessibility findings remain explicit follow-up Bugs; they do not change Orchestrator authority, Project Control state, or the dormant Agent Claim Engine.
