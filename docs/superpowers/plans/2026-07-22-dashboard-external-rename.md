# Dashboard External Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dashboard the canonical external name and `/dashboard` the canonical admin route while preserving all released Observatory database and internal compatibility identifiers.

**Architecture:** Add a canonical `app/dashboard` page that reuses the existing Observatory internals, reduce `app/observatory` to a permanent compatibility redirect, and update only user-visible copy and actively maintained project records. No Supabase schema, persisted payload, collector, publisher, RPC, or migration changes are allowed.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase, Vitest, Testing Library, Vercel

---

### Task 1: Canonical Dashboard route and legacy redirect

**Files:**
- Create: `app/dashboard/page.tsx`
- Modify: `app/observatory/page.tsx`
- Modify: `tests/observatory-page.test.tsx`
- Create: `tests/observatory-route-redirect.test.ts`

- [ ] **Step 1: Change the page test to specify the Dashboard route before implementation**

Update the page import and external assertions in `tests/observatory-page.test.tsx`:

```tsx
import DashboardPage, { dynamic } from "@/app/dashboard/page";

describe("DashboardPage", () => {
  it("redirects anonymous and non-admin visitors before reading snapshots", async () => {
    mocks.currentAdmin = null;

    await expect(DashboardPage()).rejects.toThrow(
      "redirect:/auth?redirectTo=/dashboard",
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/auth?redirectTo=/dashboard",
    );
    expect(mocks.getLatestSuccessfulSnapshot).not.toHaveBeenCalled();
  });

  it("renders the admin overview and Quick Capture", async () => {
    render(await DashboardPage());
    expect(
      screen.getByRole("heading", { name: /^dashboard$/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/dashboard access/i)).toBeInTheDocument();
  });
});
```

Replace all remaining `ObservatoryPage()` calls in this test with `DashboardPage()` while keeping internal idempotency-key assertions unchanged.

- [ ] **Step 2: Add the failing legacy-route redirect test**

Create `tests/observatory-route-redirect.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const permanentRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`permanentRedirect:${path}`);
  }),
);

vi.mock("next/navigation", () => ({ permanentRedirect }));

import ObservatoryRedirectPage from "@/app/observatory/page";

describe("legacy Observatory route", () => {
  it("permanently redirects to the canonical Dashboard route", () => {
    expect(() => ObservatoryRedirectPage()).toThrow(
      "permanentRedirect:/dashboard",
    );
    expect(permanentRedirect).toHaveBeenCalledWith("/dashboard");
  });
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
npm test -- tests/observatory-page.test.tsx tests/observatory-route-redirect.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `@/app/dashboard/page` and the legacy redirect do not exist yet.

- [ ] **Step 4: Implement the canonical route and compatibility redirect**

Create `app/dashboard/page.tsx` from the existing page implementation with these external changes:

```tsx
export default async function DashboardPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();

  if (!currentAdmin) {
    redirect("/auth?redirectTo=/dashboard");
  }

  const overviewState = await loadOverviewState();
  const initialIdempotencyKey = `observatory-capture-${randomUUID()}`;

  return (
    <section className="observatory-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /dashboard</p>
          <h1>Dashboard</h1>
          <p>&gt; inspect the validated system map and capture the next signal</p>
        </div>
        <div className="shell-status-line" aria-label="Dashboard access">
          <span>mode: admin</span>
          <span>source: read-only</span>
          <span>capture: audited inbox</span>
        </div>
      </header>

      <div className="observatory-layout">
        <ObservatoryOverview state={overviewState} />
        <aside className="observatory-capture" aria-label="Work item capture">
          <QuickCapture initialIdempotencyKey={initialIdempotencyKey} />
        </aside>
      </div>
    </section>
  );
}
```

Replace `app/observatory/page.tsx` with:

```tsx
import { permanentRedirect } from "next/navigation";

export default function ObservatoryRedirectPage() {
  permanentRedirect("/dashboard");
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 3 command. Expected: both test files pass.

- [ ] **Step 6: Commit the canonical route**

```bash
git add app/dashboard/page.tsx app/observatory/page.tsx tests/observatory-page.test.tsx tests/observatory-route-redirect.test.ts
git commit -m "feat: make Dashboard the canonical admin route"
```

### Task 2: Dashboard navigation, errors, and cache invalidation

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `app/observatory/actions.ts`
- Modify: `tests/app-shell.test.tsx`
- Modify: `tests/observatory-actions.test.ts`

- [ ] **Step 1: Write failing external-name assertions**

In `tests/app-shell.test.tsx`, replace the admin and non-admin Observatory assertions with:

```tsx
expect(
  screen.getByRole("link", { name: /^dashboard$/i }),
).toHaveAttribute("href", "/dashboard");

expect(
  screen.queryByRole("link", { name: /^dashboard$/i }),
).not.toBeInTheDocument();
```

In `tests/observatory-actions.test.ts`, require:

```ts
formError: "Dashboard is temporarily unavailable. Try again.",
```

```ts
expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
```

Rename the behavior description to `creates a normalized Quick Capture and revalidates Dashboard`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- tests/app-shell.test.tsx tests/observatory-actions.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL with the current Observatory link, message, and cache path.

- [ ] **Step 3: Implement external Dashboard copy**

Update `components/layout/Header.tsx`:

```tsx
<Link href="/dashboard" className="operator-link">
  Dashboard
</Link>
```

Update `app/observatory/actions.ts`:

```ts
function operationalError(): ObservatoryQuickCaptureActionState {
  return {
    status: "error",
    formError: "Dashboard is temporarily unavailable. Try again.",
  };
}
```

```ts
try {
  revalidatePath("/dashboard");
} catch {
  // The RPC already committed. Cache invalidation is best-effort here.
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: both test files pass.

- [ ] **Step 5: Commit navigation and action changes**

```bash
git add components/layout/Header.tsx app/observatory/actions.ts tests/app-shell.test.tsx tests/observatory-actions.test.ts
git commit -m "refactor: expose Dashboard name across 402V"
```

### Task 3: Active repository documentation

**Files:**
- Rename: `docs/observatory-m1a-runbook.md` to `docs/dashboard-m1a-runbook.md`
- Modify: `docs/dashboard-m1a-runbook.md`
- Modify: `docs/superpowers/specs/2026-07-22-dashboard-external-rename-design.md`

- [ ] **Step 1: Rename the active runbook**

```bash
git mv docs/observatory-m1a-runbook.md docs/dashboard-m1a-runbook.md
```

- [ ] **Step 2: Update only current external names in the runbook**

Change the title to `# Dashboard M1A runbook`, use `/dashboard` for the current read route, and describe `/observatory` as the legacy redirect. Keep exact internal commands, `.observatory/` paths, database identifiers, historical branch names, commits, and already-recorded verification outputs unchanged.

Add this compatibility note after the title:

```markdown
> Dashboard is the current external project name and `/dashboard` is the canonical route. Internal `observatory_*` identifiers and historical release evidence are intentionally preserved for compatibility.
```

- [ ] **Step 3: Verify active repository naming boundaries**

```bash
rg -n 'OpenClaw Observatory|Observatory access|Observatory is temporarily' app components docs/dashboard-m1a-runbook.md
rg -n 'href="/observatory"|redirectTo=/observatory|revalidatePath\("/observatory"\)' app components tests
```

Expected: no output. The legacy redirect implementation, internal identifiers, historical plans, and immutable evidence remain allowed.

- [ ] **Step 4: Commit active documentation**

```bash
git add docs/dashboard-m1a-runbook.md docs/observatory-m1a-runbook.md docs/superpowers/specs/2026-07-22-dashboard-external-rename-design.md
git commit -m "docs: rename active Observatory records to Dashboard"
```

### Task 4: Full application verification

**Files:**
- Verify all branch changes

- [ ] **Step 1: Run the full serialized test suite**

```bash
npm test -- --maxWorkers=1 --no-file-parallelism
```

Expected: all test files and tests pass.

- [ ] **Step 2: Run static and production checks**

```bash
npm run lint
npm run typecheck
npm run build
git diff --check main...HEAD
```

Expected: every command exits 0 and the production route manifest contains dynamic `/dashboard` plus the legacy `/observatory` route.

- [ ] **Step 3: Audit the scope**

```bash
git diff --stat main...HEAD
git status --short
rg -n 'OpenClaw Observatory|Observatory access|Observatory is temporarily' app components docs/dashboard-m1a-runbook.md
```

Expected: only the isolated Dashboard rename files are changed; worktree is clean after commits; external-name scan produces no output.

### Task 5: Long-term project records and release

**Files:**
- Rename: `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/projects/openclaw-observatory/` to `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/projects/dashboard/`
- Modify: active Markdown files under `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/projects/dashboard/`
- Modify: `/Users/glaucon/Obsidian/Glaucon's Vault/plato-academy/agenda.md`
- Modify: `/Users/glaucon/.openclaw/workspace/plato/STATE.md`
- Append: `/Users/glaucon/.openclaw/workspace/plato/memory/2026-07-22.md`

- [ ] **Step 1: Read the Vault's required governance files before mutation**

Locate and read the Vault rules referenced by its root index before changing project records. Preserve unrelated agent and project files.

- [ ] **Step 2: Rename the active project directory and current names**

Move the project folder to `plato-academy/projects/dashboard/`. Update current project titles, links, route references, and active planning text to `Dashboard` and `/dashboard`. Preserve exact internal identifiers and historical evidence, adding `legacy Observatory identifier` only where the old term would otherwise look like the current project name.

- [ ] **Step 3: Update runtime continuity records**

Change the current project heading and canonical path in `STATE.md`. Append a durable memory entry stating that Dashboard is the canonical external name, `/dashboard` is canonical, `/observatory` is a compatibility redirect, and internal `observatory_*` identifiers remain intentional.

- [ ] **Step 4: Merge, push, and deploy under the existing authorization**

Fast-forward the isolated branch into local `main` without touching the unrelated anonymous-engagement changes, push `main` to `GlauconAI/glaucon-politeia`, and deploy the committed revision through the existing 402V Vercel project. Do not run a Supabase migration and do not change Cron or Gateway.

- [ ] **Step 5: Run production smoke checks**

Verify:

```text
GET https://402v.com/dashboard    -> 307 /auth?redirectTo=/dashboard when anonymous
GET https://402v.com/observatory  -> 308 /dashboard
```

Then use the existing administrator login to confirm Dashboard renders. Do not create a second retained Quick Capture merely for the rename; the existing M1A work item and event remain the release evidence because the data path is unchanged.

- [ ] **Step 6: Clean up the worktree after verified integration**

Remove the isolated worktree and delete `chore/dashboard-rename` only after `main`, `origin/main`, the Vercel deployment revision, and production smoke evidence agree.
