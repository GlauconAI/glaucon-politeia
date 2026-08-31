# Orchestrator Title and Metadata Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the full Orchestrator title to the 402v shell and convert the artifact's fixed metadata rail into an optional full-width disclosure.

**Architecture:** Change the authenticated Next.js shell title through its existing page component and tests. Patch only the published standalone HTML shell around the unchanged registry block, publish the content update in place, then deploy the scoped website commit from an isolated worktree.

**Tech Stack:** Next.js, React, TypeScript, Vitest, standalone HTML/CSS, 402v HTML Kit, Supabase, Vercel, agent-browser

---

### Task 1: Shell title

**Files:**
- Modify: `tests/orchestrator-page.test.tsx`
- Modify: `app/orchestrator/page.tsx`
- Modify: `app/globals.css`

- [ ] Change the page test to require the level-one heading `Openclaw Orchestrator｜Multi-Agent 编排系统设计` and require that the old exact heading is absent.
- [ ] Run `npm test -- --run tests/orchestrator-page.test.tsx` and require failure because the page still renders `Orchestrator`.
- [ ] Replace the heading text in `app/orchestrator/page.tsx` and add a title width rule that permits wrapping without overflow.
- [ ] Run the focused page and responsive tests and require both files to pass.

### Task 2: Standalone metadata layout

**Files:**
- Create: `/tmp/openclaw-orchestrator-layout-baseline.html`
- Create: `/tmp/openclaw-orchestrator-layout-candidate.html`
- Create: `/tmp/verify-orchestrator-layout.mjs`

- [ ] Read the current production HTML and metadata into the baseline file without changing production.
- [ ] Write a static regression verifier that requires no nav title span, a closed `System metadata` disclosure with `Contract`, `Control`, and `Artifact`, one-column artifact layout, no sticky rail, all six nav links, and byte-identical registry JSON.
- [ ] Run the verifier against the baseline and require the expected failure.
- [ ] Produce the candidate by removing the inner product label and replacing the right rail with the metadata disclosure before the full-width article.
- [ ] Run the regression verifier and `402v-html-kit verify`; require both to pass.
- [ ] Open the candidate in a real browser at 1280px and 390px; exercise disclosure and Runtime navigation; require no page overflow or browser error.

### Task 3: Site release gate

**Files:**
- Modify: only Task 1 files plus this task's spec/plan/evidence

- [ ] Run focused tests, full tests with constrained HTML Kit follow-up where necessary, lint, typecheck, production build, readiness, production audit, and `git diff --check`.
- [ ] Commit only scoped site, test, and documentation files.
- [ ] Confirm the branch contains no unrelated changes.

### Task 4: Publish and deploy

**Files:**
- Update: Supabase post slug `openclaw-orchestrator`
- Create: `docs/superpowers/evidence/2026-08-31-orchestrator-title-and-metadata-layout.md`

- [ ] Run the publisher test and exact dry-run for the candidate.
- [ ] Update only the existing row's `content_html` with optimistic concurrency; preserve post metadata and verify stored SHA-256.
- [ ] Deploy the verified site commit to Vercel production; require `READY` and the `402v.com` alias.
- [ ] Push the scoped commit to `origin/main` only after production readiness is confirmed.
- [ ] Run authenticated 1280px and 390px acceptance on `/orchestrator`; require the full outer title, no inner duplicate, full-width article, working disclosure, reachable Artifact metadata, working Runtime navigation, no overflow, and no browser errors.
- [ ] Close the browser session and record commit, deployment, hashes, and preserved unrelated work.

