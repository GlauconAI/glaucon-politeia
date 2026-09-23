# Maestro Online Brand Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the already-approved Maestro brand across the existing authenticated 402v Orchestrator shell while preserving every technical route and runtime contract.

**Architecture:** Keep `/orchestrator` and the existing Supabase artifact slug as stable technical identifiers. Update only current user-visible labels, page metadata, accessibility text, and current control-plane authority copy; then deploy the site and replace the existing private HTML artifact with the verified canonical Maestro / Contrappunto bytes.

**Tech Stack:** Next.js, React, TypeScript, Vitest, 402v HTML artifact storage, Vercel.

---

### Task 1: Lock the online Maestro brand contract

**Files:**
- Modify: `tests/app-shell.test.tsx`
- Modify: `tests/orchestrator-page.test.tsx`
- Modify: `tests/orchestrator-artifact-frame.test.tsx`
- Modify: `tests/orchestrator-route.test.ts`
- Modify: `tests/observatory-project-control-view.test.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`

- [ ] Replace expectations for the old user-visible `Orchestrator` product label with `Maestro`, while retaining expectations for `/orchestrator` and `/orchestrator/artifact`.
- [ ] Add assertions for `Maestro — Multi-Agent Orchestrator`, `Maestro control surface`, and the stable technical eyebrow `402v /orchestrator`.
- [ ] Run the focused tests and confirm they fail only on the old user-visible labels.

### Task 2: Update the 402v application shell

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `app/orchestrator/page.tsx`
- Modify: `components/orchestrator/OrchestratorArtifactFrame.tsx`
- Modify: `lib/orchestrator/route.ts`
- Modify: `components/observatory/ProjectControlView.tsx`
- Modify: `components/observatory/ProjectControlPortfolio.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `components/observatory/DecisionCenter.tsx`

- [ ] Change only current user-visible brand copy to Maestro and preserve route, component, function, type, slug, and database identifiers.
- [ ] Export route metadata with title `Maestro — Multi-Agent Orchestrator`.
- [ ] Run the focused tests and confirm all brand contracts pass.

### Task 3: Verify and release

**Files:**
- Publish source: `/Users/glaucon/.openclaw/workspace/socrates/projects/openclaw-orchestrator/orchestration-system-design.html`

- [ ] Run `npm run release:verify` and require tests, ESLint, TypeScript, build-path checks, and diff-check to pass.
- [ ] Use the repository release-prepare entry to create the PR, wait for GitHub Quality and Vercel Preview, then perform the single authorized squash merge.
- [ ] Wait for exact-SHA Vercel Production and production smoke.
- [ ] Update the existing private `openclaw-orchestrator` artifact in place; do not create a duplicate post or change its slug or visibility.
- [ ] Verify the stored and served artifact hashes match the canonical source, the page displays Maestro / Contrappunto / Notturno, and the runtime Plugin remains loaded as `Maestro — Multi-Agent Orchestrator` without a Gateway restart.
