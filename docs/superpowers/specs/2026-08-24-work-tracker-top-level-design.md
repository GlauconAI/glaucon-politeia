# Work Tracker Top-Level Surface Design

**Date:** 2026-08-24
**Status:** Approved
**Owner:** Plato

## Problem

Work Tracker is currently rendered inside `/dashboard` beside the read-only observability and delivery-governance surfaces. That placement weakens the product boundary: Dashboard is primarily an inspection surface, while Work Tracker is the audited write surface for daily work. Work item details also live under `/dashboard/work-items/[id]`, reinforcing the same coupling.

Work item authoring also lacks an explicit language convention. The user reads Chinese more efficiently and wants titles, descriptions, and acceptance criteria to default to Chinese while allowing established English product names, technical terms, identifiers, and code symbols.

## Decision

Create a complete top-level Work Tracker surface:

- Board and Quick Capture: `/work-tracker`
- Canonical item detail: `/work-tracker/items/[id]`
- Global admin navigation: `Dashboard`, `Orchestrator`, `Work Tracker`, `Publish`
- Legacy item detail: `/dashboard/work-items/[id]` permanently redirects to the canonical detail route
- Dashboard no longer loads or renders Quick Capture or Work Tracker and no longer lists `Capture` or `Work` in its section navigation

This reuses the existing repository, Server Actions, audited RPCs, state machine, Ready Gate, optimistic concurrency, evidence ledger, claim policy, board, and detail components. No second status model or database migration is introduced.

## Alternatives Considered

### 1. Complete top-level separation — selected

Move the board and canonical detail URLs to the top-level Work Tracker namespace. Preserve old detail URLs through permanent redirects.

**Why selected:** the information architecture and URLs both express the intended product boundary, while compatibility is retained.

### 2. Move only the board

Add `/work-tracker` but keep canonical details under `/dashboard/work-items/[id]`.

**Rejected:** smaller change, but the main workflow still appears owned by Dashboard and produces inconsistent breadcrumbs and URLs.

### 3. Keep Dashboard embedding and add an alias

Render the same board in both `/dashboard` and `/work-tracker`.

**Rejected:** duplicates the write surface, doubles page data loading, and makes future behavior and acceptance ambiguous.

## Architecture

### Work Tracker page

`app/work-tracker/page.tsx` performs the existing admin check before database access, redirects anonymous users to `/auth?redirectTo=/work-tracker`, generates a request-unique idempotency key, and loads work items plus active claims. Database failures render a bounded Work Tracker error state without exposing private details.

The page renders:

1. A Work Tracker hero identifying it as an audited admin write surface.
2. A Chinese authoring guidance notice.
3. Existing `QuickCapture`.
4. Existing `WorkTrackerBoard`.

### Canonical detail page

`app/work-tracker/items/[id]/page.tsx` owns the existing detail loader and admin gate. Anonymous redirects point back to the canonical URL. UUID validation, unavailable states, item/evidence/event/claim reads, Project Control binding options, and authority boundaries remain unchanged.

`app/dashboard/work-items/[id]/page.tsx` becomes a permanent redirect only. It does not authenticate or read the database because the canonical route owns those responsibilities.

### Shared components

`WorkTrackerBoard` card links point to `/work-tracker/items/[id]`. `WorkItemDetail` breadcrumbs point to `/work-tracker`. No mutation action, repository contract, schema, or workflow transition changes.

### Dashboard

`app/dashboard/page.tsx` returns to a read-only observability page. It loads only the observatory snapshot state. The Quick Capture and Work Tracker imports, repository reads, random idempotency key, and Dashboard `Capture` / `Work` anchors are removed.

## Chinese Authoring Rule

The rule is guidance, not a destructive language validator:

> Work Tracker Item 的标题、描述和验收标准默认使用中文；常用英文专有名词、产品名、代码标识、路径、API 与提交哈希可以保留。

It appears in both Quick Capture and the detail editing form. Placeholder text is Chinese. Existing English items remain valid and editable; submissions are never rejected merely for containing English.

The same rule is added to Plato's durable workspace instructions so future agent-authored production items follow it consistently.

## Authorization and Safety

- All Work Tracker routes remain admin-only.
- Dashboard becomes less privileged in behavior because it no longer exposes audited writes.
- Agent Claim remains disabled unless separately and explicitly configured per existing policy.
- Project Control bindings remain projections of Orchestrator authority and cannot mutate Stage, Gate, or Decision state.
- Legacy URLs preserve bookmarks without duplicating mutations or reads.

## Error Handling

- Anonymous Work Tracker page requests redirect to login with the canonical return path.
- Invalid UUID detail routes return not found.
- Repository initialization or read failures render the existing generic unavailable state.
- Dashboard snapshot failures remain isolated from Work Tracker availability, and Work Tracker failures no longer affect Dashboard rendering.
- Old detail links use a permanent redirect and never produce a second detail implementation.

## Testing

TDD coverage must prove:

1. Admin header shows a top-level Work Tracker link; non-admin header does not.
2. `/work-tracker` enforces the admin gate before repository reads, renders Quick Capture and the board, generates distinct idempotency keys, and shows Chinese authoring guidance.
3. `/dashboard` does not render Quick Capture or Work Tracker and does not load Work Tracker repository data.
4. Board cards use canonical Work Tracker detail links.
5. Canonical detail redirects anonymous users correctly and renders the existing audited detail surface.
6. Legacy detail routes permanently redirect to the canonical route.
7. Detail authoring displays the Chinese rule without rejecting technical English.
8. Existing workflow, evidence, concurrency, Project Control binding, and Agent Claim tests remain green.

Full release gates are focused tests, full Vitest, ESLint, TypeScript, `git diff --check`, Next.js production build, and desktop/mobile browser acceptance after explicit production release authorization.

## Out of Scope

- Translating every Work Tracker control or state label into Chinese
- Automatic translation of existing items
- Language detection or rejection
- Database schema changes
- Agent Claim activation
- Work Tracker filtering, search, or per-project boards
- Fixing the separately tracked horizontal overflow and accessibility Bugs in this change
