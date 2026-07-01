# 402v Calm Personal OS Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public 402v.com UI into a calm personal publishing system with spaces for learning notes, essays, HTML sites, family pages, and products.

**Architecture:** Keep the current Next.js App Router and Supabase data model. Update the app shell, homepage, post cards, and CSS only; use existing tags/search routes as first-version destinations for new spaces.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Tailwind CSS entrypoint with global CSS, Vitest, Testing Library.

---

### Task 1: Lock The New Shell Contract With Tests

**Files:**
- Modify: `tests/app-shell.test.tsx`
- Modify: `tests/smoke.test.tsx`

- [ ] **Step 1: Add shell expectations**

Add assertions that the shell renders the `402v` brand and the core spaces: `Learn`, `Sites`, `Family`, and `Products`.

- [ ] **Step 2: Add homepage expectations**

Update the smoke test so the homepage expects `402v`, `Spaces`, and `Latest publishing` instead of the old `Glaucon Politeia` starter heading.

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
npm test -- tests/app-shell.test.tsx tests/smoke.test.tsx
```

Expected: failures mentioning missing `402v`, `Spaces`, or `Latest publishing`.

### Task 2: Redesign The App Shell

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/RightRail.tsx`
- Modify: `components/layout/AppShell.tsx`

- [ ] **Step 1: Replace shell brand**

Use `402v` as the primary brand and `Personal publishing system` as the subtitle.

- [ ] **Step 2: Replace primary navigation**

Use spaces as the public navigation: `Home`, `Learn`, `Notes`, `Sites`, `Family`, `Products`, `Archive`.

- [ ] **Step 3: Keep operator routes reachable**

Keep `Editor`, `Profile`, `Lab`, `TODO`, and `Prompt Admin` reachable through secondary navigation or the right rail.

### Task 3: Redesign Homepage Content

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/posts/PostCard.tsx`

- [ ] **Step 1: Add a calm OS intro**

Introduce the site as `402v`, a personal publishing system for notes, HTML sites, essays, family pages, and products.

- [ ] **Step 2: Add a spaces overview**

Render a stable grid for `Learn`, `Notes`, `Sites`, `Family`, `Products`, and `Archive`.

- [ ] **Step 3: Keep latest posts**

Continue querying published posts and rendering them with improved card metadata.

### Task 4: Update Visual System

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Update tokens**

Use neutral backgrounds, thin borders, restrained accent colors, and dark mode parity.

- [ ] **Step 2: Update responsive layout**

Keep the three-column shell on wide screens and collapse cleanly on tablet/mobile.

- [ ] **Step 3: Update cards and controls**

Make cards compact, readable, and stable without decorative gradients or oversized marketing sections.

### Task 5: Verify, Commit, Deploy

**Files:**
- All modified files

- [ ] **Step 1: Run focused tests**

```bash
npm test -- tests/app-shell.test.tsx tests/smoke.test.tsx
```

- [ ] **Step 2: Run full quality gate**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

- [ ] **Step 3: Commit and push**

```bash
git add .
git commit -m "feat: redesign 402v public shell"
git push origin main
```

- [ ] **Step 4: Deploy and smoke test**

Deploy to Vercel production and verify `https://402v.com` returns 200 with the new `402v` shell.

