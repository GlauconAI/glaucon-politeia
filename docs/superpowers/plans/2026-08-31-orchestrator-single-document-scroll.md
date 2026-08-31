# Orchestrator Single-Document Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/orchestrator` use the outer document as its only vertical scroll surface.

**Architecture:** A sandbox-compatible script inside the published Artifact reports live content height and internal anchor offsets through `postMessage`. A focused client component validates messages from its own iframe, applies the height, disables iframe scrolling only after synchronization, and translates internal anchors into outer-page scrolling.

**Tech Stack:** React, TypeScript, Vitest, standalone HTML/JavaScript, Supabase, Vercel

---

### Task 1: Lock the parent bridge contract

**Files:**
- Create: `tests/orchestrator-artifact-frame.test.tsx`
- Create: `components/orchestrator/OrchestratorArtifactFrame.tsx`
- Modify: `app/orchestrator/page.tsx`
- Modify: `app/globals.css`

- [x] Write tests for fallback scrolling, source/payload validation, valid height application, and outer anchor scrolling.
- [x] Run the tests and require RED because the client component does not exist.
- [x] Implement the minimal component and replace the raw iframe in the page.
- [x] Run focused tests and require GREEN.

### Task 2: Lock the child Artifact bridge contract

**Files:**
- Create: `/private/tmp/verify-orchestrator-document-scroll.mjs`
- Create: `/private/tmp/openclaw-orchestrator-document-scroll-candidate.html`

- [x] Require the bridge marker, exact message channel, root height observation, mutation/toggle handling, same-document anchor interception, and byte-identical registry JSON.
- [x] Run against the current production Artifact and require RED.
- [x] Add the smallest bridge script before `</body>` in the candidate.
- [x] Run the verifier and 402v HTML Kit verification and require GREEN.

### Task 3: Release gates

**Files:**
- Modify: only the Task 1 files and this release's spec/plan/evidence.

- [x] Run focused tests, full Vitest, ESLint, TypeScript, production build, readiness, production audit, and `git diff --check`.
- [x] Run publisher tests and an exact dry run for the candidate.
- [ ] Commit only scoped files and preserve all unrelated worktrees.

### Task 4: Publish and accept production

**Files:**
- Update: existing private Supabase post `openclaw-orchestrator` content only.
- Create: `docs/superpowers/evidence/2026-08-31-orchestrator-single-document-scroll.md`.

- [ ] Publish with optimistic concurrency and verify candidate/storage hash equality.
- [ ] Deploy and push the exact application commit; require successful Vercel Production status.
- [ ] Verify authenticated desktop and 390px mobile behavior: one vertical scrollbar, live disclosure resizing, working Runtime anchor, no horizontal overflow, and zero browser errors.
- [ ] Verify stored and served Artifact hashes and close the browser session.
