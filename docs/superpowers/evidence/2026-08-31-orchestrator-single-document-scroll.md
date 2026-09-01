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

## Release

- Application commit: `7b604adc017b49890cd1ad6eae5946aabbf4ca79`.
- Canonical branch: `origin/main` advanced by fast-forward from `b55a98e`.
- GitHub Production deployment: `6191753320`, status `success` (`Deployment has completed`).
- Immutable deployment URL: `https://glaucon-politeia-58vlycvhq-plato-8448s-projects.vercel.app`.
- Production alias accepted at `https://402v.com/orchestrator`.

## Content update

- Existing post ID: `aa6f7b92-376b-4957-a462-ab633d8c6468`.
- Slug: `openclaw-orchestrator`.
- Visibility/status remained `private` / `published`.
- Previous HTML SHA-256: `64c8ed5aa15dd85225ea353b6cc9d0f45dd7eeeff3b948f694b302e5fcba30fa`.
- Candidate, stored, and authenticated served HTML SHA-256: `4712ae0a3bc36486639ca0ac47d210fb107e0505150f24b3816dea589f2b0e97`.
- Stored/served size: `262605` bytes.
- Optimistic concurrency matched the previous `updated_at` and HTML hash before writing.
- Only `content_html` changed; author, slug, title, excerpt, Markdown, format, visibility, status, and published timestamp were preserved.

## Browser acceptance

### Desktop, 1280×900

- Outer heading: `Openclaw Orchestrator｜Multi-Agent 编排系统设计`.
- Outer document had no horizontal overflow; iframe width was 1198px.
- Initial synchronized iframe height was 11378px with `data-height-synchronized=true` and `scrolling=no`.
- Opening `System metadata` changed the iframe height to 11660px and the outer document height from 11814px to 12096px.
- Clicking `Runtime` moved the outer document from `scrollY=0` to `scrollY=1791`.
- Browser console and page-error collections were empty.

### Mobile, 390×844

- Outer document had no horizontal overflow; iframe bounds were 11–379px (368px wide).
- Initial synchronized iframe height was 16269px with `scrolling=no`.
- Opening `System metadata` changed the iframe height to 16983px and the outer document height from 16877px to 17591px.
- Browser console and page-error collections were empty.

## Raw response verification

- Authenticated `/orchestrator/artifact` returned HTTP 200 and began with the plain HTML doctype.
- `Content-Type`: `text/html; charset=utf-8`.
- `Cache-Control`: `private, no-store`.
- `X-Content-Type-Options`: `nosniff`.
- `Referrer-Policy`: `no-referrer`.
- CSP retained `sandbox` without `allow-same-origin`.
- Response bytes and SHA-256 exactly matched the stored candidate.
- Anonymous access remained protected and redirected to `/auth?redirectTo=/orchestrator`.

## Environment findings

- Sandboxed Turbopack still fails when it tries to bind a local helper port; the same exact build succeeds with bounded execution permission.
- Sandboxed Supabase and npm checks fail at DNS resolution; bounded execution permission restores both connections.
- The five production dependency audit findings remain the same pre-existing `nanoid`, `next`, `postcss`, `sharp`, and `undici` findings. This release does not change dependency files.
- With bounded execution permission, Git over SSH, Supabase, GitHub status queries, and the authenticated browser all succeeded.

## Why the previous turn was blocked

- The earlier turn ran under a sandbox policy that rejected Git metadata writes, DNS/network access, browser sockets, and the requested escalation. The read-only GitHub connector also returned HTTP 403 for branch/blob writes.
- The earlier successful compact-layout release did not depend on direct Vercel CLI deployment. Its local `vercel deploy --prebuilt --prod` attempt also returned `Not authorized`; production succeeded because an authorized Git push triggered the existing GitHub→Vercel integration.
- This turn reused that successful path. The material difference was that bounded execution permissions were accepted: Git fetch/commit/push worked, Supabase DNS and write access worked, and agent-browser could open the dedicated authenticated profile.
- The canonical deployment chain was therefore `fast-forward push to origin/main → GitHub Production deployment → Vercel success → 402v.com alias acceptance`. No GitHub connector write or direct Vercel CLI deployment was required.

## Safety

- The dirty primary worktree and all unrelated worktrees were preserved.
- The application commit contains only the scoped Orchestrator shell, frame component, tests, and release documentation.
- The HTML post identity and all non-content metadata were preserved.
- The dedicated browser session was closed, releasing the persistent admin profile lock.
