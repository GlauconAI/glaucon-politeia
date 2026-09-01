# 402V Dashboard Cron Jobs production evidence

- Acceptance date: 2026-08-31 America/Vancouver
- Production route: https://402v.com/dashboard/crons
- Feature commit: `e760184ceab26536b1db0a7f2987a103a76b3976`
- Mobile acceptance fix: `1854c6f4b42e3dd7b39e0c7b98cbec26efda4624`
- Vercel Preview deployment: `6195751373` — success
- Vercel Production deployment: `6195922414` — success
- Immutable production URL: https://glaucon-politeia-c8rfv5gk0-plato-8448s-projects.vercel.app
- Observatory Snapshot digest: `99330f53ad9ef48ff231a01de1f2751a98303bb2773cbdde0a7eee4c9c1f3306`

## Delivered scope

- Added an admin-only, read-only `/dashboard/crons` directory and Dashboard navigation/summary entries.
- Added URL-backed search, Owner, schedule-type, enabled-state, run-health filters, four sort modes, six statistic controls, source-health fallback, and responsive cards.
- Added safe projection fields for `cron`, `every`, and `at` schedules, normalized runtime targets, last/next run evidence, status, and consecutive errors.
- Excluded payload, message text, delivery/recipient data, trigger scripts, concrete session keys, failure alerts, and raw execution errors.
- Preserved missing or malformed enabled/run state as `unknown` instead of inferring operational truth.

## Machine verification

- Final focused regression: 7 files / 66 tests passed.
- Independent review regression before the mobile fix: 8 files / 77 tests passed; no blocking or Important issues remained.
- ESLint passed.
- TypeScript `tsc --noEmit` passed from a clean generated-type state.
- `git diff --check` passed; final worktree and `origin/main` matched.
- Production and complete dependency audits remained at 0 vulnerabilities; the feature changed no dependencies.
- Full suite exercised 126 files / 851 tests: 847 passed; four pre-existing HTML Kit subprocess tests exceeded their fixed local timeout under the sequential resource-constrained run. The affected HTML Kit files passed when isolated (70/70).
- Vercel Preview completed a real cloud build before the mainline fast-forward.

## Data verification

- Production acceptance observed 60 Cron assets: 38 calendar expressions, 5 fixed intervals, and 17 one-time tasks.
- Safe projection privacy scan: all eight categories reported zero findings.
- Snapshot validation passed schema, SHA-256 digest, relationship endpoint, 0600 file-mode, and privacy checks.
- One relationship to an Owner absent from the canonical Agent inventory was omitted; its Cron asset remains visible with the safe Owner label.
- No Cron job, payload, delivery rule, or Runtime state was mutated.

## Production acceptance

- Authenticated desktop 1280×900: 60 cards, five Dashboard route links, filtering/search/URL state, and no page-level horizontal overflow.
- Authenticated mobile 390×844: 60 cards, one-column controls/statistics, 390px document width, and no page-level horizontal overflow. The route navigation uses its own horizontal scroller.
- Anonymous access redirected to `/auth?redirectTo=/dashboard/crons`.
- Online filters verified: Needs attention 4, calendar expression 38, and exact-name search 1.
- No Cron mutation controls are present. The only `enabled` button is the read-only Enabled filter.

## Existing baseline note

Agent-browser records React minified error `#418` on both the new Cron directory and the unchanged Projects directory in fresh authenticated sessions. A server-HTML/client-DOM comparison for the Cron cards matched field-for-field. This is an existing Dashboard hydration baseline, not a Cron-specific regression, and remains outside this release diff.
