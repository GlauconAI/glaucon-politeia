# Dependency Security Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all npm audit findings while preserving 402V production behavior.

**Architecture:** Use a clean worktree from the current production main. Pin the direct framework and matching lint configuration, then let a non-forced npm lockfile refresh update vulnerable transitive dependencies. Release only after code, build, publisher, browser, and deployment gates pass.

**Tech Stack:** Next.js 16, npm lockfile v3, Vitest, ESLint, TypeScript, Vercel, agent-browser.

---

### Task 1: Reproduce the vulnerable baseline

**Files:**
- Read: `package.json`
- Read: `package-lock.json`

- [ ] Run `npm audit --omit=dev --json` and confirm it exits non-zero with the known production dependency findings.
- [ ] Run `npm ls next sharp postcss nanoid undici --all` and record the resolved vulnerable versions.

### Task 2: Apply the minimal dependency update

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Run `npm install --package-lock-only --ignore-scripts --save-prod --save-exact next@16.3.4`.
- [ ] Run `npm install --package-lock-only --ignore-scripts --save-dev --save-exact eslint-config-next@16.3.4`.
- [ ] Run `npm audit fix --package-lock-only --ignore-scripts` without `--force`.
- [ ] Run `npm ci --ignore-scripts` to install exactly the repaired lockfile.

### Task 3: Verify dependency and application gates

**Files:**
- Verify: `package.json`
- Verify: `package-lock.json`

- [ ] Run `npm audit --omit=dev --json`; expect zero vulnerabilities.
- [ ] Run `npm audit --json`; expect zero vulnerabilities.
- [ ] Run `npm run lint`; expect exit 0.
- [ ] Run `npm run typecheck`; expect exit 0.
- [ ] Run `npm test -- --maxWorkers=1`; expect 125 test files and 839 tests passing or a larger passing count if task documentation tests are discovered.
- [ ] Run `npm run build`; expect a successful production build.
- [ ] Run focused Proxy, Server Action, image, HTML Kit, publisher, and Orchestrator tests; expect all to pass.

### Task 4: Commit and release

**Files:**
- Create: `docs/superpowers/evidence/2026-08-31-dependency-security-maintenance.md`

- [ ] Record exact versions, commands, counts, and build evidence in the acceptance file.
- [ ] Commit the dependency update and evidence on `security/dependency-audit-zero-20260831`.
- [ ] Fetch `origin/main`, require it to remain at the verified base, and fast-forward `main` to the security commit.
- [ ] Push `main` and wait for the GitHub/Vercel Production deployment to report success.

### Task 5: Production acceptance

**Files:**
- Modify: `docs/superpowers/evidence/2026-08-31-dependency-security-maintenance.md`

- [ ] Verify desktop and 390px mobile routes for horizontal overflow, console errors, and page errors.
- [ ] Verify authenticated post Proxy behavior, Server Actions surfaces, image routes, publisher readiness, and `/orchestrator` single-scroll behavior.
- [ ] Commit the final production evidence and push it to `main` only after all checks pass.
