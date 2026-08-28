# Work Tracker Item UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship dismissible card menus, durable assigned Agents, and a readable responsive Work Tracker Item detail page.

**Architecture:** Extend the existing audited Work Item contract with one non-null `assigned_agent_id`, keep human Owner and Agent Claim semantics unchanged, and restructure the existing React detail component into main-content and property-sidebar regions. Preserve native controls, repository boundaries, optimistic versions, and 402v tokens.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Supabase/PostgreSQL RPCs, Vitest, Testing Library, CSS.

---

### Task 1: Specify assigned Agent and menu behavior

**Files:**
- Modify: `tests/observatory-work-items.test.ts`
- Modify: `tests/observatory-work-tracker-board.test.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`
- Modify: `tests/observatory-actions.test.ts`
- Modify: `tests/observatory-repository.test.ts`
- Modify: `tests/observatory-migration.test.ts`

- [ ] Add failing tests that require normalized non-empty assigned Agent IDs, card display, outside-click/second-menu/Escape dismissal, detail editing, action parsing, repository select/RPC propagation, and migration backfill/audit/grants.
- [ ] Run the six targeted files and confirm failures are caused by the missing behavior.

### Task 2: Add the audited assigned Agent contract

**Files:**
- Create: `supabase/migrations/20260827000100_work_tracker_assigned_agent.sql`
- Modify: `lib/observatory/work-items.ts`
- Modify: `lib/observatory/repository.ts`
- Modify: `app/observatory/actions.ts`

- [ ] Add `assignedAgentId` validation to the strict update schema.
- [ ] Add `assigned_agent_id` to row reads and `p_assigned_agent_id` to the update RPC call.
- [ ] Parse and forward `assignedAgentId` in the server action.
- [ ] Add the transactional migration with canonical-Project backfill, normalized constraint, create-time defaulting, versioned update, before/after audit data, revoke/grant statements, and function replacement.
- [ ] Run contract tests until green.

### Task 3: Implement coordinated card action menus

**Files:**
- Modify: `components/observatory/WorkTrackerBoard.tsx`

- [ ] Track the open Item ID at board scope.
- [ ] Close on outside pointer interaction, focus leaving the menu, Escape, another trigger opening, and transition submission.
- [ ] Preserve native details semantics and accessible trigger state.
- [ ] Run board tests until green.

### Task 4: Display assignment and redesign the detail workspace

**Files:**
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `app/globals.css`

- [ ] Add a dedicated Assigned Agent badge to every card while leaving Claim eligibility/lease status separate.
- [ ] Build the detail header, wide narrative column, sticky property sidebar, Evidence section, and chronological Activity section.
- [ ] Derive Agent suggestions from canonical Project owner keys and preserve the current assignment option.
- [ ] Add responsive single-column behavior and focus/overflow styles.
- [ ] Run board/detail/responsive tests until green.

### Task 5: Verify and release

**Files:**
- Create: `docs/superpowers/evidence/2026-08-27-work-tracker-item-ux.md`

- [ ] Run all Work Tracker, action, repository, and migration tests.
- [ ] Run the full Vitest suite with one worker, ESLint, TypeScript, and Next.js production build.
- [ ] Review the complete diff for unrelated changes and security/authority regressions.
- [ ] Apply the Supabase migration with the repository's verified operations command and confirm the schema/readiness state.
- [ ] Commit the isolated changes, fast-forward/push the exact result to canonical `main`, and verify GitHub.
- [ ] Wait for Vercel production deployment and confirm `402v.com` serves the exact release.
- [ ] Run authenticated desktop and 390×844 acceptance without mutating production Items; record menu, assignment, detail-layout, overflow, console, and runtime evidence.
