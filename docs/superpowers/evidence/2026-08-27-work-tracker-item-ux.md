# Work Tracker Item UX Production Evidence

Date: 2026-08-27

## Release

- Application commits: `1d571c046e5338ae30f5cfaeb14a94488bd547d4`, `b99e533024ab89726070964a3129b81025a4ca43`, and `1a67f0d9075718b3fb17a644f418b6eea4761bc2`.
- Accepted application release head: `1a67f0d9075718b3fb17a644f418b6eea4761bc2`; the evidence is recorded in a later docs-only commit.
- Supabase migration: `20260827000100_work_tracker_assigned_agent.sql`; dry-run listed only this migration and remote history records it.
- Vercel deployment: `dpl_8QkKYqVX82pR2Xz76PKyvNDQcPc9`, `READY`, production alias `https://402v.com`.

## Verification gates

- Full Vitest suite: 124/124 files and 836/836 tests passed with one worker.
- ESLint: passed.
- TypeScript: passed.
- Next.js 16.2.6 production build: passed; 28/28 static pages generated and the dynamic Work Tracker routes compiled.
- `git diff --check`: passed for every release commit.

## Production acceptance

- Desktop viewport: 1280×900. Board and detail document widths were 1280/1280 with no page-level horizontal overflow.
- All 24 active cards rendered one Assigned Agent badge; the retained assignments were 12 `plato` and 12 `shared`.
- Card action menu opened with one disclosure, clicking Search Project closed it, opening a second menu left only one open, and Escape closed it while restoring trigger focus.
- Detail layout rendered an 826px content column and a 360px sticky Properties column with Content, Properties, Move state, Agent Claim, Evidence, and Activity sections.
- Assigned Agent options were sourced from the Agent snapshot, contained 14 normalized IDs, and excluded Project owner display labels.
- Server and browser rendered the same Vancouver-time Created/Updated text; a fresh browser session reported zero hydration/runtime errors and zero console messages.
- Mobile viewport: 390×844. Detail panels were 370px wide, Properties became static, and the page stayed 390/390 with no horizontal overflow.
- Mobile board stayed 390/390 at page level; the four-column board contained its own 340px/1070px horizontal scroll surface with `overflow-x: auto`.

## Safety

- Production acceptance was read-only: no Item field, assignment, state, Claim policy, Evidence record, Project, or account was mutated.
- The dedicated `402v-admin` browser session was closed after acceptance, releasing the persistent profile lock.
