# Dashboard Hydration #418 Fix Design

## Goal

Eliminate the authenticated Dashboard React #418 hydration mismatch and prove
that Quick Capture submits through its normal button and keyboard paths.

## Root cause

`SourceRepositoryInventory` and `ProjectDirectory` are client components that
also render on the server. Their date formatters use the host's implicit time
zone. Production SSR runs in UTC while the user's browser runs in
America/Vancouver. An instant near midnight UTC therefore produces different
date text on the server and client, such as July 23 versus July 22. React sees
different initial markup, emits hydration error #418, and rebuilds the client
tree.

The Quick Capture form has a separate coverage gap: its component tests submit
the form programmatically and do not exercise the visible submit button. Real
dogfood showed that this path must be part of release acceptance whenever a
hydration failure can replace the surrounding tree.

## Options considered

1. **Pin operational timestamps to UTC — selected.** Add `timeZone: "UTC"` to
   the two implicit `Intl.DateTimeFormat` calls. This matches existing
   Dashboard provenance and Project Control formatters, retains SSR content,
   and removes environment-dependent markup.
2. **Format after mount.** This avoids hydration comparison but introduces a
   blank or placeholder first render and layout shift.
3. **Suppress hydration warnings.** This hides the signal while leaving the
   server and client DOM inconsistent, so it is rejected.

## Design

- Keep the current component boundaries and data contracts.
- Render repository last-commit timestamps and Project recent-activity dates
  in UTC with the existing locale and styles.
- Add a real SSR-to-hydrate regression test that renders the same instant once
  with a UTC server time zone and once with an America/Vancouver client time
  zone. The test must fail before the fix and pass without hydration warnings
  after the fix.
- Extend Quick Capture tests to click the visible submit button and press Enter
  from the title field, verifying one action call per submission.
- Run focused tests, the complete suite, lint, typecheck, production build, and
  browser console checks on desktop and mobile.

## Release

The fix branch starts from the accepted P0-A commit, which is now canonical
`main`. After verification, fast-forward `main`, deploy the exact commit, and
verify the production routes. No database migration, Project Control authority
change, or Agent Claim activation is involved.

## Rollback

Revert the hydration-fix commit and redeploy the prior accepted P0-A commit.
No data rollback is required.
