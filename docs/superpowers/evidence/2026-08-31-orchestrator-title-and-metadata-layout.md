# Orchestrator Title and Metadata Layout Acceptance Evidence

## Release

- Design commit: `98d460e`.
- Application commit: `4f4aad6f3078560bca1236042b3930017690fc38`.
- Canonical branch: `origin/main`.
- Production URL: `https://402v.com/orchestrator`.
- GitHub Production deployment: `6188888275`, status `success` (`Deployment has completed`).
- Production deployment URL: `https://glaucon-politeia-5z1khnajn-plato-8448s-projects.vercel.app`.
- `402v.com` alias acceptance rendered the application commit's full outer title.

## Content update

- Existing post ID: `aa6f7b92-376b-4957-a462-ab633d8c6468`.
- Slug: `openclaw-orchestrator`.
- Visibility/status remained `private` / `published`.
- Previous HTML SHA-256: `0f1702fbe0fee9de3a86771a0b12bc7e1061cb8f655410f21887b340dca5c3a7`.
- Candidate, stored, and served HTML SHA-256: `64c8ed5aa15dd85225ea353b6cc9d0f45dd7eeeff3b948f694b302e5fcba30fa`.
- Stored/served size: `260662` bytes.
- Optimistic concurrency matched the previous `updated_at` and HTML hash before writing.
- The update changed only `content_html`; author, slug, title, excerpt, Markdown, format, visibility, status, and published timestamp were byte/value preserved.
- The canonical `orchestration-registry` JSON block was byte-identical to the baseline.

## Local verification

- Targeted RED: the page and responsive tests both failed on the old `Orchestrator` heading and missing wrap guards.
- Targeted GREEN: 2 files, 4 tests passed.
- Constrained full Vitest: 123/124 files and 834/836 tests passed; the two failures were process-heavy `html-note-kit-update` timeouts under concurrent load.
- Isolated follow-up: `html-note-kit-update`, 1 file and 32/32 tests passed with one worker.
- Publisher CLI: 1 file and 3/3 tests passed; exact candidate dry-run exited 0.
- ESLint: exit 0.
- TypeScript `tsc --noEmit`: exit 0.
- Next.js production build: exit 0.
- Vercel production prebuild: exit 0.
- Supabase readiness: `Launch readiness: ready`.
- `git diff --check`: exit 0.
- 402v HTML Kit verification: `ok: true`, interactive contract v1, required block `orchestration-registry`, no issues.
- Static layout verifier confirmed six preserved nav targets, no inner product title, no sticky rail, default-closed metadata, all three metadata groups, one-column layout, and byte-identical registry JSON.

## Dependency audit exception

- `npm audit --omit=dev` reported five pre-existing high-severity production dependency findings in `next`, `nanoid`, `postcss`, `sharp`, and `undici`.
- `package.json` and `package-lock.json` were unchanged by this release, so the layout update introduced no dependency delta.
- Dependency remediation remains a separate site-wide release because it changes the runtime dependency graph and requires its own compatibility gate.

## Deployment path

- The local Vercel production prebuild passed.
- Direct `vercel deploy --prebuilt --prod` returned `Not authorized` because the local CLI deployment credential is no longer valid.
- The existing GitHub-to-Vercel Production integration deployed the exact pushed application commit; GitHub commit status and deployment status both reached `success`.

## Browser acceptance

### Desktop, 1280×900

- Outer heading: `Openclaw Orchestrator｜Multi-Agent 编排系统设计`.
- Outer document had no horizontal overflow; artifact frame width was 1198px.
- Inner navigation had zero product-title spans and retained all section links.
- Metadata was closed by default; opening it exposed `Contract`, `Control`, and `Artifact`, including the previously clipped Artifact group.
- Inner article and layout widths were both 1200px, confirming full-width reading space.
- Runtime navigation reached `#thin-runtime-flow`.

### Mobile, 390×844

- Outer document had no horizontal overflow; iframe bounds were 11–379px (368px wide).
- Inner document had no horizontal overflow; article and layout widths were both 370px.
- Metadata was closed by default and expanded to a one-column 348px grid containing all three groups.
- Fresh browser console and runtime error collections were empty.

## Raw response verification

- Authenticated outer-shell fetch of `/orchestrator/artifact` returned HTTP 200.
- `Content-Type`: `text/html; charset=utf-8`.
- `Cache-Control`: `private, no-store`.
- `X-Content-Type-Options`: `nosniff`.
- `Referrer-Policy`: `no-referrer`.
- CSP retained `sandbox` without `allow-same-origin`.
- Response began with the plain HTML doctype and its SHA-256 exactly matched stored and candidate bytes.

## Safety

- The dirty primary worktree and all unrelated user changes were preserved.
- Only the scoped Orchestrator shell files, tests, design/plan, and this evidence document were committed.
- The HTML post identity and all non-content metadata were preserved.
- All dedicated browser sessions were closed, releasing the persistent admin profile lock.
