# Dependency Security Maintenance Design

## Goal

Remove every vulnerability reported by both the production-only and complete npm audits without changing application behavior, database state, page content, or the protected dirty primary checkout.

## Scope

- Pin `next` and `eslint-config-next` together at `16.3.4`.
- Refresh the lockfile with npm's non-forced security fix so vulnerable transitive packages resolve to patched releases.
- Keep `jsdom` on major version 29 because the lockfile can safely update `undici` without a breaking `jsdom` upgrade.
- Modify only dependency manifests plus this task's design, plan, and acceptance evidence.

## Isolation and release

All work runs in `.worktrees/dependency-security-20260831`, created from `origin/main` at `575b197`. The dirty primary checkout is read-only for this task. The verified security branch will be fast-forwarded to `main`, pushed to GitHub, and deployed by the existing GitHub-to-Vercel Production integration.

## Verification gates

1. Before the upgrade, `npm audit --omit=dev` must reproduce the known vulnerable state.
2. After the upgrade, both `npm audit --omit=dev` and complete `npm audit` must report zero vulnerabilities.
3. ESLint, TypeScript, all Vitest tests, and the production build must pass.
4. Publisher dry-run and focused Proxy, Server Action, image, HTML Kit, and Orchestrator tests must pass.
5. Production deployment must report success; desktop and 390px mobile acceptance must show no console/page errors or horizontal overflow, and Orchestrator single-scroll behavior must remain intact.

## Rollback

The pre-release production baseline is `575b197`. No database migration or content mutation is part of this release, so rollback is a Git/Vercel deployment rollback to that commit.
