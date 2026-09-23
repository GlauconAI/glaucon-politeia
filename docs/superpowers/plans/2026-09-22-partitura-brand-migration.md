# Partitura Brand Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every user-facing reference to the Dashboard product as `Partitura — System Dashboard` while preserving `/dashboard` and all internal Dashboard identifiers.

**Architecture:** Apply a narrow presentation-layer migration across the root hero, shared Dashboard shell, authenticated global header, and subpage return links. Lock the boundary with component tests that require Partitura in product-facing copy and retain Dashboard in routes, source identifiers, project data, and technical artifacts.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS, Vitest, Testing Library, existing Work Tracker release pipeline.

---

## File map

- `app/dashboard/page.tsx` — canonical Partitura product hero and access label.
- `app/dashboard/layout.tsx` — route-family browser metadata and shared route navigation shell.
- `app/dashboard/loading.tsx` — accessible Partitura loading state.
- `components/observatory/DashboardRouteNav.tsx` — Partitura product-root label and navigation landmark.
- `components/observatory/DashboardSectionNav.tsx` — Partitura section-navigation landmark.
- `components/layout/Header.tsx` — authenticated global Partitura entry.
- `app/dashboard/projects/page.tsx` — Partitura root return link.
- `app/dashboard/skills/page.tsx` — Partitura root return link.
- `app/dashboard/automations/page.tsx` — Partitura root return link.
- `app/globals.css` — minimal product-lockup hierarchy using the existing Observatory visual system.
- `tests/observatory-page.test.tsx` — root hero and product-boundary contract.
- `tests/observatory-dashboard-layout.test.tsx` — shared navigation, metadata, and loading contract.
- `tests/observatory-dashboard-section-nav.test.tsx` — section-navigation landmark contract.
- `tests/app-shell.test.tsx` — authenticated global header contract.
- `tests/observatory-directory-pages.test.tsx` — subpage return-link contract.
- `docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md` — release evidence, remaining Dashboard-name classification, and production acceptance.

### Task 1: Establish failing Partitura contracts

**Files:**
- Modify: `tests/observatory-page.test.tsx`
- Modify: `tests/observatory-dashboard-layout.test.tsx`
- Modify: `tests/observatory-dashboard-section-nav.test.tsx`
- Modify: `tests/app-shell.test.tsx`
- Modify: `tests/observatory-directory-pages.test.tsx`

- [ ] **Step 1: Replace the root product-heading expectation**

Update the ready-state test in `tests/observatory-page.test.tsx` to require:

```tsx
expect(screen.getByRole("heading", { name: /^partitura$/i })).toBeInTheDocument();
expect(screen.getByText(/^system dashboard$/i)).toBeInTheDocument();
expect(screen.getByText("The score for a society of minds.")).toBeInTheDocument();
expect(screen.getByLabelText(/partitura access/i)).toBeInTheDocument();
expect(screen.queryByRole("heading", { name: /^dashboard$/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Replace shared-shell product expectations**

Import `metadata` from `app/dashboard/layout.tsx`, then update `tests/observatory-dashboard-layout.test.tsx` to require:

```tsx
expect(metadata.title).toBe("Partitura — System Dashboard");
expect(metadata.description).toBe("The score for a society of minds.");

const navigation = screen.getByRole("navigation", { name: /partitura routes/i });
expect(screen.getByRole("link", { name: "Partitura" })).toHaveAttribute(
  "href",
  "/dashboard",
);
expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
expect(screen.getByText(/loading partitura data/i)).toBeInTheDocument();
```

Update `tests/observatory-dashboard-section-nav.test.tsx` to require the section navigation landmark name `Partitura sections`.

- [ ] **Step 3: Update the global authenticated header contract**

In `tests/app-shell.test.tsx`, require:

```tsx
expect(
  screen.getByRole("link", { name: /^partitura$/i }),
).toHaveAttribute("href", "/dashboard");
expect(
  screen.queryByRole("link", { name: /^dashboard$/i }),
).not.toBeInTheDocument();
```

Keep the existing checks for Orchestrator, Work Tracker, Publish, and authorization visibility unchanged.

- [ ] **Step 4: Update product-root return-link contracts**

In `tests/observatory-directory-pages.test.tsx`, change the Projects and Automations assertions to:

```tsx
expect(screen.getByRole("link", { name: /back to partitura/i }))
  .toHaveAttribute("href", "/dashboard");
```

Add the same assertion to the Skills-page test. Do not change expectations for data records whose title is `Dashboard`.

- [ ] **Step 5: Run the focused suite and verify RED**

Run:

```bash
npx vitest run \
  tests/observatory-page.test.tsx \
  tests/observatory-dashboard-layout.test.tsx \
  tests/observatory-dashboard-section-nav.test.tsx \
  tests/app-shell.test.tsx \
  tests/observatory-directory-pages.test.tsx
```

Expected: failures identify the old `Dashboard` product heading, route label, loading copy, global header link, return links, and missing metadata. Existing authorization and data-title assertions must continue to pass.

- [ ] **Step 6: Commit the RED contracts**

```bash
git add tests/observatory-page.test.tsx tests/observatory-dashboard-layout.test.tsx tests/observatory-dashboard-section-nav.test.tsx tests/app-shell.test.tsx tests/observatory-directory-pages.test.tsx
git commit -m "test: define Partitura brand contracts"
```

### Task 2: Implement the shared Partitura brand layer

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/dashboard/loading.tsx`
- Modify: `components/observatory/DashboardRouteNav.tsx`
- Modify: `components/observatory/DashboardSectionNav.tsx`
- Modify: `components/layout/Header.tsx`
- Modify: `app/dashboard/projects/page.tsx`
- Modify: `app/dashboard/skills/page.tsx`
- Modify: `app/dashboard/automations/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add route-family metadata**

Update `app/dashboard/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Partitura — System Dashboard",
  description: "The score for a society of minds.",
};
```

Keep `dynamic = "force-dynamic"`, the shared shell, and all route behavior unchanged.

- [ ] **Step 2: Replace the root hero lockup**

In `app/dashboard/page.tsx`, preserve the path eyebrow and status values, then render:

```tsx
<p className="eyebrow shell-path">402v /dashboard</p>
<h1>Partitura</h1>
<p className="partitura-product-subtitle">System Dashboard</p>
<p className="partitura-product-slogan">The score for a society of minds.</p>
```

Change only the status-line accessible label to `Partitura access`.

- [ ] **Step 3: Update the shared shell language**

In `components/observatory/DashboardRouteNav.tsx`, use:

```tsx
{ href: "/dashboard", label: "Partitura", exact: true }
```

and change the navigation accessible label to `Partitura routes`.

In `components/observatory/DashboardSectionNav.tsx`, change only the product-level navigation landmark to `Partitura sections`.

In `app/dashboard/loading.tsx`, retain the technical path and live-region attributes, then render:

```tsx
<h1>Loading Partitura data…</h1>
```

- [ ] **Step 4: Update the product entry and return links**

In `components/layout/Header.tsx`, change only the visible `/dashboard` link label to `Partitura`.

In each file below, change only `← Back to Dashboard` to `← Back to Partitura`:

- `app/dashboard/projects/page.tsx`
- `app/dashboard/skills/page.tsx`
- `app/dashboard/automations/page.tsx`

Do not change routes, Project data, source-path strings, or canonical Project titles.

- [ ] **Step 5: Add minimal lockup styles**

Add focused rules beside `.observatory-hero` in `app/globals.css`:

```css
.partitura-product-subtitle {
  margin-top: 10px !important;
  color: var(--success) !important;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.partitura-product-slogan {
  margin-top: 6px !important;
  color: var(--muted) !important;
  font-style: italic;
}
```

Do not introduce a new color token, font, logo, layout system, or breakpoint.

- [ ] **Step 6: Run the focused suite and verify GREEN**

Run the same four-file Vitest command from Task 1. Expected: all tests pass.

- [ ] **Step 7: Commit the implementation**

```bash
git add app/dashboard/page.tsx app/dashboard/layout.tsx app/dashboard/loading.tsx app/dashboard/projects/page.tsx app/dashboard/skills/page.tsx app/dashboard/automations/page.tsx app/globals.css components/layout/Header.tsx components/observatory/DashboardRouteNav.tsx components/observatory/DashboardSectionNav.tsx
git commit -m "feat: brand Dashboard as Partitura"
```

### Task 3: Audit every remaining Dashboard reference

**Files:**
- Create: `docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md`

- [ ] **Step 1: Inventory remaining visible and internal references**

Run:

```bash
rg -n 'Dashboard|dashboard' app/dashboard components/layout/Header.tsx components/observatory tests/observatory-page.test.tsx tests/observatory-dashboard-layout.test.tsx tests/app-shell.test.tsx tests/observatory-directory-pages.test.tsx
```

Classify every remaining match in the report as one of:

- technical route or source identifier — preserve;
- component/type/test identifier — preserve;
- canonical Project/data title — preserve;
- established artifact phrase such as `Dashboard snapshot` — preserve;
- user-facing product label — must change to Partitura before proceeding.

- [ ] **Step 2: Verify protected technical contracts remain present**

Run:

```bash
rg -n '/dashboard|plato/dashboard|DashboardPage|DashboardRouteNav|DashboardSectionNav' app/dashboard components tests/observatory-page.test.tsx tests/observatory-dashboard-layout.test.tsx
```

Expected: route and internal identifiers remain present.

- [ ] **Step 3: Write the evidence report draft**

Create `docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md` with scope, changed files, remaining-reference classification, verification sections, release boundary, and an explicit statement that routes, APIs, schemas, databases, Registry entries, Automations, and runtime configuration were not changed.

- [ ] **Step 4: Commit the report draft**

```bash
git add docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md
git commit -m "docs: record Partitura migration evidence"
```

### Task 4: Run quality gates and browser acceptance

**Files:**
- Modify: `docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md`

- [ ] **Step 1: Run the full local release gate**

```bash
npm run release:verify
```

Expected: tests, typecheck, lint, and repository release checks pass with exit code 0.

- [ ] **Step 2: Run static boundary checks**

```bash
git diff --check origin/main...HEAD
git status --short
```

Expected: no whitespace errors and only intentional tracked changes before the report update.

- [ ] **Step 3: Start the isolated local app**

Run the app from this worktree on a free task-scoped port. Do not reuse or stop another task's local server.

- [ ] **Step 4: Verify desktop acceptance with agent-browser**

At 1440px, verify the Partitura heading, subtitle, exact slogan, route navigation label, authenticated global header label, functional subpages, horizontal overflow, page errors, and console errors.

- [ ] **Step 5: Verify mobile acceptance with agent-browser**

At 390px, verify readable hero hierarchy, existing route-nav overflow behavior, no clipped lockup/status text, no page-level horizontal overflow, and no page or console error.

- [ ] **Step 6: Update and commit the report**

Record exact commands and results, then:

```bash
git add docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md
git commit -m "docs: finalize Partitura verification"
```

### Task 5: Review and prepare the production release

**Files:**
- Modify only if review identifies an in-scope defect.

- [ ] **Step 1: Review the exact branch range**

Review `origin/main...HEAD` against the design and plan. Block release for any Critical or Important finding, accidental internal rename, missing user-facing rename, route change, privacy regression, or responsive regression.

- [ ] **Step 2: Re-run affected tests after any review fix**

Use TDD for each defect, then rerun the focused suite and `npm run release:verify`.

- [ ] **Step 3: Freeze the clean candidate**

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: clean worktree and a bounded presentation-layer diff.

- [ ] **Step 4: Prepare the PR through the host-owned entry point**

```bash
/Users/glaucon/.openclaw/agents/plato/agent/bin/work-tracker-release-prepare.sh
```

Do not call `git push` or `gh pr create` directly.

- [ ] **Step 5: Stop at the protected merge gate**

After PR checks pass, request the single required approval for `gh pr merge <number> --squash`. Do not merge without that approval.

### Task 6: Verify production and close this naming stage

**Files:**
- Modify: `docs/superpowers/reports/2026-09-22-partitura-brand-migration-report.md`
- Modify: `plato-academy/projects/openclaw-orchestrator/sinfonia-brand-foundation-v1.md`
- Modify: `plato-academy/agenda.md`
- Modify: `plato-academy/agenda-changelog.md`

- [ ] **Step 1: Wait for exact-SHA production smoke**

Use the existing GitHub Actions `production-smoke` result for the exact merged SHA. Do not substitute local smoke for the standard production gate.

- [ ] **Step 2: Verify production pages**

Confirm production `/dashboard`, `/dashboard/projects`, `/dashboard/skills`, and `/dashboard/automations` show intended Partitura labels while every URL remains unchanged.

- [ ] **Step 3: Finalize the report**

Record merged SHA, production deployment, production smoke, and final desktop/mobile checks without exposing private Dashboard data.

- [ ] **Step 4: Update brand foundation and Agenda**

Mark Partitura as the first completed visible migration. Set Maestro design as the next naming stage; keep Concerto and Contrappunto pending independent product work.

- [ ] **Step 5: Deliver the integrated result**

Report visible brand changes, preserved technical contracts, verification evidence, and next stage. Do not claim the rest of Sinfonia has been migrated.
