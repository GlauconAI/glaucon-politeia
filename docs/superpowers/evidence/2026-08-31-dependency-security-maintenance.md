# Dependency Security Maintenance Acceptance

## Scope and base

- Branch: `security/dependency-audit-zero-20260831`
- Production base: `575b1977f2b1e3f2432cbabbf3b9efd78af90a26`
- Dirty primary checkout: preserved and not used for implementation
- Direct manifest changes: `next 16.2.6 → 16.3.4`, `eslint-config-next 16.2.6 → 16.3.4`
- No database, content, route, component, or environment-setting changes

## Dependency evidence

The pre-change production audit reproduced `5 high / 0 critical` findings for `next`, `sharp`, `postcss`, `nanoid`, and `undici`.

The non-forced lockfile refresh resolved the relevant packages to:

- `next 16.3.4`
- `sharp 0.35.4`
- `postcss 8.5.26`
- `nanoid 3.3.18`
- `undici 7.29.0`
- `vite 8.2.2`
- `js-yaml 4.3.2`
- `brace-expansion 1.1.18` and `5.0.9`
- `@babel/core 7.29.7`

Fresh results after `npm ci --ignore-scripts`:

- `npm audit --omit=dev --json`: 0 vulnerabilities, exit 0
- `npm audit --json`: 0 vulnerabilities, exit 0
- `package.json` SHA-256: `3f52af8e088b2c0ace863af12a0449d22c24dafaa85f9c9dfcd1b67840f7ad93`
- `package-lock.json` SHA-256: `c61d070312ef74b2877ff2020ad6b5ac2ec2cca7aeedecf3e59cca841392ba81`

## Local application verification

- Clean pre-change baseline: 125 files / 839 tests passed
- Focused auth, Proxy, posts, Orchestrator, HTML Kit, and publisher suite: 22 files / 225 tests passed
- Full post-change suite: 125 files / 839 tests passed
- ESLint: exit 0
- TypeScript: exit 0
- Publisher dry-run: exit 0; private draft payload, HTML format, 259,682 content bytes
- `git diff --check`: exit 0

Vite 8.2.2 emits a forward-looking warning that the existing CommonJS-loaded `vitest.config.ts` uses ESM syntax; it does not alter the current `bundle` loader or test results. Existing Node 26 localStorage and module-loader warnings also remain non-failing.

## Production build gate

The canonical local Turbopack build cannot bind its internal PostCSS worker port in the managed sandbox (`Operation not permitted`). The exact rerun with controlled escalation produced the same environment-level denial. No code or dependency error was emitted before the port-bind failure. The required canonical build gate is therefore the isolated branch's GitHub/Vercel build; `main` must not advance until that deployment reports success.

The branch Preview provided the canonical build before main advanced:

- Preview deployment: `6192964660`
- Preview state: `success`
- Preview immutable URL: `https://glaucon-politeia-pullhat7t-plato-8448s-projects.vercel.app`

The verified branch was then fast-forwarded from `575b197` to application commit `5abb4cc50ce5b284419d182bfdcd9cc77dd69135` on `origin/main`.

- Production deployment: `6192984834`
- Production state: `success`
- Production immutable URL: `https://glaucon-politeia-4pfeev46s-plato-8448s-projects.vercel.app`

## Production acceptance

Authenticated acceptance at `https://402v.com` passed without mutating content or database rows.

Desktop, 1280 × 900:

- Page width: 1280 client / 1280 scroll; no horizontal overflow
- Collapsed iframe: 1,198 × 11,378; `scrolling="no"`
- Expanded System metadata iframe height: 11,660
- Runtime navigation moved the outer document to `scrollY=1,386`

Mobile, 390 × 844:

- Page width: 390 client / 390 scroll; no horizontal overflow
- Collapsed iframe: 368 × 16,269; `scrolling="no"`
- Expanded System metadata iframe height: 16,983
- Runtime navigation moved the outer document to `scrollY=2,220`

Runtime surfaces:

- Authenticated Artifact: HTTP 200, HTML, 262,605 bytes
- Next image optimization endpoint: HTTP 200, PNG, 29,904 bytes
- `/posts/orchestration-system-design`: standalone HTML Proxy response, correct title and doctype, no application shell
- Authenticated `/editor`: rendered two forms and four buttons; no form was submitted
- Publisher dry-run remained a private draft and performed no database write
- Desktop and mobile browser console and page-error logs were empty
