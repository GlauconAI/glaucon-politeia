# Work Tracker Top-Level Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Work Tracker and its canonical item details out of Dashboard into an admin-only top-level surface, preserve legacy links, and make Chinese the default authoring language without rejecting technical English.

**Architecture:** Add `/work-tracker` and `/work-tracker/items/[id]` as the only active Work Tracker UI routes. Reuse existing components, repository methods, Server Actions, workflow contracts, and Project Control bindings. Reduce `/dashboard` to snapshot observability, and keep `/dashboard/work-items/[id]` as a permanent compatibility redirect.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Supabase repository layer, Vitest, Testing Library, ESLint.

---

## File map

- Create `app/work-tracker/page.tsx` — admin gate, board data loader, idempotency key, Quick Capture and board composition.
- Create `app/work-tracker/items/[id]/page.tsx` — canonical audited item detail loader.
- Modify `app/dashboard/page.tsx` — remove all Work Tracker reads and rendering.
- Modify `app/dashboard/work-items/[id]/page.tsx` — permanent redirect only.
- Modify `app/observatory/actions.ts` — revalidate canonical Work Tracker paths.
- Modify `components/layout/Header.tsx` — top-level admin link.
- Modify `components/observatory/QuickCapture.tsx` — Chinese authoring guidance and placeholders.
- Modify `components/observatory/WorkTrackerBoard.tsx` — canonical item links.
- Modify `components/observatory/WorkItemDetail.tsx` — canonical breadcrumb and Chinese authoring guidance.
- Modify `components/observatory/ProjectControlView.tsx` — canonical Work Tracker item links.
- Modify tests listed below to prove route ownership and compatibility.
- Modify Plato workspace `AGENTS.md` outside the repository — durable Chinese Item authoring rule.

## Task 1: Separate the Work Tracker page from Dashboard

**Files:**
- Create: `tests/work-tracker-page.test.tsx`
- Modify: `tests/observatory-page.test.tsx`
- Create: `app/work-tracker/page.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Write failing Work Tracker page tests**

Create a page test with hoisted mocks for admin auth, repository construction, item reads, active-claim reads, and redirect. The core expectations are:

```tsx
expect(dynamic).toBe("force-dynamic");
await expect(WorkTrackerPage()).rejects.toThrow(
  "redirect:/auth?redirectTo=/work-tracker",
);
expect(mocks.listWorkItems).not.toHaveBeenCalled();

render(await WorkTrackerPage());
expect(screen.getByRole("heading", { name: /^work tracker$/i })).toBeInTheDocument();
expect(screen.getByRole("form", { name: /quick capture/i })).toBeInTheDocument();
expect(screen.getByRole("region", { name: /work tracker/i })).toBeInTheDocument();
expect(screen.getByText(/标题、描述和验收标准默认使用中文/)).toBeInTheDocument();
```

Also render the page twice and assert the hidden `idempotencyKey` values are distinct UUID-backed keys.

- [ ] **Step 2: Rewrite Dashboard tests to require read-only separation**

Replace the old Quick Capture and board expectations with:

```tsx
render(await DashboardPage());
expect(screen.queryByRole("form", { name: /quick capture/i })).not.toBeInTheDocument();
expect(screen.queryByRole("heading", { name: /^work tracker$/i })).not.toBeInTheDocument();
expect(screen.queryByRole("link", { name: "Capture" })).not.toBeInTheDocument();
expect(screen.queryByRole("link", { name: "Work" })).not.toBeInTheDocument();
expect(mocks.listWorkItems).not.toHaveBeenCalled();
expect(mocks.listActiveWorkItemClaims).not.toHaveBeenCalled();
```

Delete Dashboard tests that generate capture keys or expect Work Tracker fallback behavior; those behaviors move to the new page test.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/work-tracker-page.test.tsx tests/observatory-page.test.tsx
```

Expected: failure because `app/work-tracker/page.tsx` does not exist and Dashboard still renders the write surface.

- [ ] **Step 4: Implement the minimal independent page and Dashboard removal**

`app/work-tracker/page.tsx` must:

```tsx
export const dynamic = "force-dynamic";

export default async function WorkTrackerPage() {
  const currentAdmin = await getCurrentObservatoryAdmin();
  if (!currentAdmin) redirect("/auth?redirectTo=/work-tracker");
  const state = await loadWorkTrackerState();
  const initialIdempotencyKey = `observatory-capture-${randomUUID()}`;
  return (
    <section className="observatory-page work-tracker-page">
      <header className="observatory-hero">
        <div>
          <p className="eyebrow shell-path">402v /work-tracker</p>
          <h1>Work Tracker</h1>
          <p>&gt; 管理、推进并审计真实工作事项</p>
        </div>
      </header>
      <p className="work-tracker-language-guidance">
        标题、描述和验收标准默认使用中文；常用英文专有名词、产品名、代码标识、路径、API 与提交哈希可以保留。
      </p>
      <QuickCapture initialIdempotencyKey={initialIdempotencyKey} />
      <WorkTrackerBoard state={state} />
    </section>
  );
}
```

Keep `loadWorkTrackerState()` bounded: return the existing generic error state and never expose caught error text.

`app/dashboard/page.tsx` must remove `randomUUID`, Quick Capture, Work Tracker, Supabase repository imports, `loadWorkTrackerState()`, Capture/Work section links, and the two rendered write-surface blocks. Load only `loadObservatoryOverviewState()`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Step 3 command. Expected: both files pass.

- [ ] **Step 6: Commit the page separation**

```bash
git add app/work-tracker/page.tsx app/dashboard/page.tsx tests/work-tracker-page.test.tsx tests/observatory-page.test.tsx
git commit -m "feat: separate work tracker from dashboard"
```

## Task 2: Make item details canonical under Work Tracker

**Files:**
- Create: `app/work-tracker/items/[id]/page.tsx`
- Modify: `app/dashboard/work-items/[id]/page.tsx`
- Modify: `tests/observatory-work-item-page.test.tsx`
- Create: `tests/observatory-work-item-legacy-route.test.ts`
- Modify: `components/observatory/WorkTrackerBoard.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `components/observatory/ProjectControlView.tsx`
- Modify: `tests/observatory-work-tracker-board.test.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`
- Modify the existing Project Control view test that asserts Work Item links.

- [ ] **Step 1: Write failing canonical route and link tests**

Change the page import to:

```tsx
import WorkItemPage from "@/app/work-tracker/items/[id]/page";
```

Change the anonymous expectation to:

```tsx
`redirect:/auth?redirectTo=/work-tracker/items/${item.id}`
```

Add assertions:

```tsx
expect(screen.getByRole("link", { name: item.title })).toHaveAttribute(
  "href",
  `/work-tracker/items/${item.id}`,
);
expect(screen.getByRole("link", { name: /work tracker/i })).toHaveAttribute(
  "href",
  "/work-tracker",
);
```

For the legacy route, mock `permanentRedirect` and assert:

```ts
await expect(LegacyWorkItemPage({ params: Promise.resolve({ id }) }))
  .rejects.toThrow(`permanent:/work-tracker/items/${id}`);
```

- [ ] **Step 2: Run focused route/component tests and verify RED**

```bash
npx vitest run tests/observatory-work-item-page.test.tsx tests/observatory-work-item-legacy-route.test.ts tests/observatory-work-tracker-board.test.tsx tests/observatory-work-item-detail.test.tsx tests/observatory-project-control-view.test.tsx
```

Expected: missing canonical page, old links, and absent permanent redirect.

- [ ] **Step 3: Implement the canonical route and compatibility redirect**

Move the complete current detail loader to `app/work-tracker/items/[id]/page.tsx`, changing only the anonymous return URL. Replace the legacy page body with:

```tsx
import { permanentRedirect } from "next/navigation";

export default async function LegacyWorkItemPage({ params }: WorkItemPageProps) {
  const { id } = await params;
  permanentRedirect(`/work-tracker/items/${id}`);
}
```

Update all three component links and the detail breadcrumb to canonical paths. Do not change workflow or Project Control behavior.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit canonical detail routing**

```bash
git add app/work-tracker/items app/dashboard/work-items components/observatory tests
git commit -m "feat: move work item details under work tracker"
```

## Task 3: Add top-level navigation, Chinese guidance, and canonical revalidation

**Files:**
- Modify: `components/layout/Header.tsx`
- Modify: `components/observatory/QuickCapture.tsx`
- Modify: `components/observatory/WorkItemDetail.tsx`
- Modify: `app/observatory/actions.ts`
- Modify: `tests/app-shell.test.tsx`
- Modify: `tests/observatory-quick-capture.test.tsx`
- Modify: `tests/observatory-work-item-detail.test.tsx`
- Modify: `tests/observatory-actions.test.ts`

- [ ] **Step 1: Write failing navigation, guidance, and revalidation tests**

Add admin shell assertions:

```tsx
expect(screen.getByRole("link", { name: /^work tracker$/i }))
  .toHaveAttribute("href", "/work-tracker");
```

Add a corresponding non-admin absence assertion.

Add Quick Capture and detail expectations for the Chinese rule. Assert the title placeholder is `用中文简要说明需要处理的事项` and the details placeholder is `补充背景、目标或限制；专有名词可保留英文`.

Change action expectations from `/dashboard` and `/dashboard/work-items/${id}` to:

```ts
expect(mocks.revalidatePath).toHaveBeenCalledWith("/work-tracker");
expect(mocks.revalidatePath).toHaveBeenCalledWith(
  `/work-tracker/items/${workItemId}`,
);
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx vitest run tests/app-shell.test.tsx tests/observatory-quick-capture.test.tsx tests/observatory-work-item-detail.test.tsx tests/observatory-actions.test.ts
```

Expected: Work Tracker link and Chinese copy are absent; actions revalidate old paths.

- [ ] **Step 3: Implement minimal navigation, copy, and revalidation changes**

Add the admin-only header link between Orchestrator and Publish:

```tsx
<Link href="/work-tracker" className="operator-link">
  Work Tracker
</Link>
```

Add this shared guidance sentence to Quick Capture and Work Item detail:

```text
标题、描述和验收标准默认使用中文；常用英文专有名词、产品名、代码标识、路径、API 与提交哈希可以保留。
```

Change capture revalidation to `/work-tracker`. Change work-item mutation revalidation to `/work-tracker` plus `/work-tracker/items/${workItemId}`. Keep best-effort error handling.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit navigation and language guidance**

```bash
git add components/layout/Header.tsx components/observatory/QuickCapture.tsx components/observatory/WorkItemDetail.tsx app/observatory/actions.ts tests
git commit -m "feat: add work tracker navigation and Chinese guidance"
```

## Task 4: Add the durable authoring rule

**Files:**
- Modify outside repository: `/Users/glaucon/.openclaw/workspace/plato/AGENTS.md`
- Create: `docs/product/work-tracker-top-level-acceptance.md`

- [ ] **Step 1: Add the explicit durable rule to Plato's workspace instructions**

Under the core workflow or Work Tracker governance section add:

```markdown
## Work Tracker Item 语言规则

- Plato 创建或编辑 Work Tracker Item 时，标题、描述和验收标准默认使用中文，便于 User 阅读。
- 常用英文专有名词、产品名、代码标识、路径、API、提交哈希和不可准确翻译的技术术语可以保留英文。
- 该规则是默认写作规范，不得通过语言校验阻止已有英文 Item 或合理的中英混合内容。
```

- [ ] **Step 2: Write the acceptance record**

Document approved scope, route map, compatibility redirect, Chinese rule, security boundaries, test evidence, and the explicit fact that production release remains pending until separately authorized.

- [ ] **Step 3: Verify no competing or contradictory instruction exists**

```bash
rg -n "Work Tracker Item|默认使用中文|优先中文" /Users/glaucon/.openclaw/workspace/plato/AGENTS.md docs
```

Expected: one coherent workspace rule and the matching product/spec records.

- [ ] **Step 4: Commit the repository acceptance record**

```bash
git add docs/product/work-tracker-top-level-acceptance.md
git commit -m "docs: record work tracker separation acceptance"
```

## Task 5: Full verification and release checkpoint

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused route and mutation tests together**

```bash
npx vitest run tests/work-tracker-page.test.tsx tests/observatory-page.test.tsx tests/observatory-work-item-page.test.tsx tests/observatory-work-item-legacy-route.test.ts tests/observatory-work-tracker-board.test.tsx tests/observatory-work-item-detail.test.tsx tests/observatory-actions.test.ts tests/app-shell.test.tsx
```

Expected: 0 failed tests.

- [ ] **Step 2: Run the complete test suite**

```bash
npm test
```

Expected: exit code 0.

- [ ] **Step 3: Run static gates**

```bash
npm run lint
npm run typecheck
git diff --check
```

Expected: all exit code 0 and no diff-check output.

- [ ] **Step 4: Run the production build**

```bash
npm run build
```

Expected: optimized production build succeeds and includes `/work-tracker`, `/work-tracker/items/[id]`, and the legacy redirect route.

- [ ] **Step 5: Verify repository state**

```bash
git status --short
git log --oneline --decorate -8
```

Expected: clean worktree with the design, implementation, and acceptance commits on `feat/work-tracker-top-level`.

- [ ] **Step 6: Stop at the production authorization gate**

Report the exact head commit and verification evidence. Request explicit authorization to push the branch head to canonical `main` and deploy the resulting commit to 402v production. Do not push or deploy before that authorization.
