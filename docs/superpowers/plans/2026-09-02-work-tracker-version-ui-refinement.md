# Work Tracker Version UI Refinement Implementation Plan

> Execute with TDD in the isolated `fix/work-tracker-version-ui-refinement` worktree.

## Task 1: Lock behavior with failing tests

- Extend `tests/observatory-work-tracker-board.test.tsx` to assert compact card labels, toolbar ordering, and Project-scoped option replacement after Project changes.
- Extend `tests/work-tracker-page.test.tsx` to assert the version manager is absent on the successful page.
- Run the focused tests and confirm the new assertions fail for the expected current behavior.

## Task 2: Implement the minimal UI changes

- Add a compact version-label formatter near the Project Version domain helpers.
- Use it for Work Item cards while leaving full version/status text in filter options.
- Group the Project picker and Project Version picker in one left-side toolbar cluster and adjust responsive CSS.
- Remove the header import/render of `ProjectVersionManager`; retain the component and backend APIs.
- Run focused tests until green.

## Task 3: Verify and release

- Run `npm run release:verify` and the production build/checks required by CI.
- Review the exact diff for scope, responsive layout, and preserved owner functionality.
- Commit, push, create a PR, wait for required checks, and merge.
- Wait for Vercel production deployment, then use agent-browser to verify desktop and mobile layout, Project-scoped version options, compact card labels, and absence of the admin management entry.
