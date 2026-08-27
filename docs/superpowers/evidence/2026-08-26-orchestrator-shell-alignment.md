# Orchestrator Shell Alignment Acceptance Evidence

## Release

- Application commit: `03aed352e131a5103eaaaf8cc22cb782b8ab2a34`
- Canonical branch: `origin/main`
- Production URL: `https://402v.com/orchestrator`
- Vercel Git status for the application commit: `success` (`Deployment has completed`)

## Local verification

- Targeted RED: `tests/orchestrator-page.test.tsx` failed because the React page did not exist.
- Targeted RED: the authorization and shared-shell assertions failed against the initial empty page.
- Targeted RED: `tests/orchestrator-responsive.test.ts` failed because the Orchestrator containment selectors did not exist.
- Targeted GREEN: 3 test files, 7 tests passed.
- Full Vitest: 124 test files, 829 tests passed.
- ESLint: exit 0.
- TypeScript `tsc --noEmit`: exit 0.
- Next.js production build: exit 0; `/orchestrator` and `/orchestrator/artifact` were both emitted as dynamic routes.
- `git diff --check`: exit 0.

The first sandboxed production-build attempt was blocked when Turbopack tried to bind a local worker port. The exact command was rerun with controlled build escalation and passed; this was an execution-environment restriction, not an application failure.

## Production desktop acceptance

- Viewport: 1280×900.
- URL remained `https://402v.com/orchestrator`.
- Shared `.site-header` was visible.
- Global operator navigation exposed Dashboard, Orchestrator, and Work Tracker.
- Shared level-one hero rendered `Orchestrator`.
- Artifact iframe used `src=/orchestrator/artifact` and title `Orchestrator control surface`.
- Accessibility snapshot traversed the iframe and found the published Orchestrator headings, navigation, searches, filters, and project content.
- Document width was 1280/1280 with no page-level horizontal overflow.
- Fresh console output: empty.
- Fresh runtime errors: empty.

## Production mobile acceptance

- Viewport: 390×844.
- Document and body widths were 390/390 with no page-level horizontal overflow.
- Header, Dashboard/Orchestrator/Work Tracker links, shared hero, direct artifact link, and iframe were visible.
- Iframe bounds were left 11px, right 379px, width 368px, height 624px; it remained contained inside the viewport.
- Fresh console output: empty.
- Fresh runtime errors: empty.
- Clicking Dashboard navigated to `https://402v.com/dashboard`; browser Back returned to `https://402v.com/orchestrator`.

## Safety

- Acceptance was read-only.
- No Work Item, Project, account, artifact, or database record was created, edited, moved, or deleted.
- The dedicated `402v-admin` browser session was closed after verification, releasing the persistent profile lock.
