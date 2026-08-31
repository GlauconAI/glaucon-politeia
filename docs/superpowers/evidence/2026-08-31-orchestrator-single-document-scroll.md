# Orchestrator Single-Document Scroll Evidence

## Local implementation

- Added a client-side iframe wrapper that accepts bounded height and anchor messages only from its own iframe window.
- Added a sandbox-compatible bridge to the Artifact's declared client script. It reports live root height, responds to resize/mutation/toggle changes, and transfers same-document anchor navigation to the outer page.
- Kept fallback iframe scrolling until the first valid height message.
- Kept CSP isolation without `allow-same-origin`; no third-party dependency was added.

## Verification completed

- TDD RED: focused test failed because the frame component did not exist.
- Focused GREEN: 4 files, 10 tests passed.
- Full Vitest: 122/125 files and 831/839 tests passed; all eight failures were confined to the three process-heavy HTML Kit files and were timeout/resource-contention symptoms.
- Constrained retry: all three affected files passed with one worker, 70/70 tests.
- ESLint: exit 0.
- TypeScript: exit 0 after removing stale `.next` generated types left by a previous unrelated Work Tracker build.
- Next.js production build: exit 0 outside the port-restricted sandbox.
- Vercel production prebuild: exit 0, target `production`.
- Supabase readiness: `Launch readiness: ready`.
- Publisher CLI: 3/3 tests passed; exact candidate dry-run exited 0.
- Static document-scroll verifier: passed.
- 402v HTML Kit: `ok: true`, contract v1, required registry block present, no issues.
- Registry JSON remains byte-identical to the production baseline.
- Candidate SHA-256: `4712ae0a3bc36486639ca0ac47d210fb107e0505150f24b3816dea589f2b0e97`.
- Candidate bytes: `262605`.
- `git diff --check`: exit 0.

## Environment findings

- Sandboxed Turbopack still fails when it tries to bind a local helper port; the same exact build succeeds with bounded execution permission.
- Sandboxed Supabase and npm checks fail at DNS resolution; bounded execution permission restores both connections.
- The five production dependency audit findings remain the same pre-existing `nanoid`, `next`, `postcss`, `sharp`, and `undici` findings. This release does not change dependency files.
- Git commit/push, Supabase write, Vercel deployment, and production browser acceptance remain pending at this checkpoint.

## Pending production gate

Once a runtime with Git/network/browser write access is available:

1. Commit the scoped worktree changes on top of `b55a98e` and push `main`.
2. Run `/private/tmp/update-orchestrator-document-scroll.mjs` from the site worktree; it requires current production hash `64c8ed5a...` and preserves all non-content metadata.
3. Require Vercel Production success for the pushed commit.
4. Run authenticated desktop and 390px acceptance with the dedicated `402v-admin` profile.
5. Verify one outer vertical scrollbar, synchronized disclosure height, working Runtime anchor, no horizontal overflow/errors, and exact candidate/storage/served hash equality.
