# Dashboard Skill Categories and Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four user-facing Skill categories and repair Dashboard tablet/mobile layout without changing collection, authorization, or refresh behavior.

**Architecture:** Derive categories from the existing effective source and Agent-visibility projection in `buildSkillDirectory()`, then expose them through the current client-side directory filters. Reuse the persistent route navigation component to publish measured sticky-stack CSS variables, let the section navigation consume those variables, and constrain Dashboard containers so only intended inner controls can scroll horizontally.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS custom properties, Vitest, Testing Library

---

## File map

- `lib/observatory/dashboard-directory.ts`: category type, labels, precedence, visibility classification, override flag.
- `components/observatory/SkillDirectory.tsx`: category cards, category filter, badges, URL state, existing filters.
- `app/dashboard/skills/page.tsx`: validate the `category` search parameter and stop accepting `scope`.
- `components/observatory/DashboardRouteNav.tsx`: measure site header and route navigation and publish shared CSS variables.
- `components/observatory/DashboardSectionNav.tsx`: read the computed sticky offset for IntersectionObserver; remove the independent header-only offset.
- `app/globals.css`: category presentation, sticky stack, container shrink rules, Dashboard ordering, and mobile summary columns.
- `tests/observatory-dashboard-directory.test.ts`: four-category and override derivation.
- `tests/observatory-skill-directory.test.tsx`: category UI, filtering, search, and URL persistence.
- `tests/observatory-dashboard-section-nav.test.tsx`: shared sticky-stack behavior.
- `tests/observatory-dashboard-responsive.test.tsx`: CSS layout contract.
- `tests/observatory-dashboard-performance.test.tsx`: updated category fixture and unchanged DOM budget.

### Task 1: Derive the four Skill categories

**Files:**
- Modify: `lib/observatory/dashboard-directory.ts`
- Test: `tests/observatory-dashboard-directory.test.ts`

- [ ] **Step 1: Write failing category projection tests**

Add fixtures covering bundled, personal-system, global custom, scoped custom,
unknown custom, and an origin Skill with a custom override:

```ts
const categoryAssets = [
  skill("skill:a:weather", "weather", "a", "healthy", [
    { key: "install_source", value: "openclaw-bundled" },
  ]),
  skill("skill:b:weather", "weather", "b", "healthy", [
    { key: "install_source", value: "openclaw-workspace" },
  ]),
  skill("skill:a:agent-browser", "agent-browser", "a", "healthy", [
    { key: "install_source", value: "agents-skills-personal" },
  ]),
  skill("skill:b:agent-browser", "agent-browser", "b", "healthy", [
    { key: "install_source", value: "agents-skills-personal" },
  ]),
  skill("skill:a:shared", "shared", "a", "healthy", [
    { key: "install_source", value: "openclaw-managed" },
  ]),
  skill("skill:b:shared", "shared", "b", "healthy", [
    { key: "install_source", value: "openclaw-extra" },
  ]),
  skill("skill:a:private", "private", "a", "healthy", [
    { key: "install_source", value: "openclaw-workspace" },
  ]),
  skill("skill:a:future", "future", "a", "healthy", [
    { key: "install_source", value: "future-source" },
  ]),
];

expect(
  Object.fromEntries(
    buildSkillDirectory(categoryAssets).map((entry) => [
      entry.name,
      { category: entry.category, hasAgentOverride: entry.hasAgentOverride },
    ]),
  ),
).toEqual({
  "agent-browser": {
    category: "system-web",
    hasAgentOverride: false,
  },
  future: {
    category: "agent-scoped-custom",
    hasAgentOverride: false,
  },
  private: {
    category: "agent-scoped-custom",
    hasAgentOverride: false,
  },
  shared: {
    category: "shared-custom",
    hasAgentOverride: false,
  },
  weather: {
    category: "openclaw-built-in",
    hasAgentOverride: true,
  },
});
```

- [ ] **Step 2: Run the projection test and verify RED**

Run:

```bash
npx vitest run tests/observatory-dashboard-directory.test.ts
```

Expected: TypeScript/runtime assertions fail because `category` and
`hasAgentOverride` do not exist.

- [ ] **Step 3: Add the category type and minimal classifier**

Add:

```ts
export const dashboardSkillCategories = [
  "openclaw-built-in",
  "system-web",
  "shared-custom",
  "agent-scoped-custom",
] as const;

export type DashboardSkillCategory =
  (typeof dashboardSkillCategories)[number];

export const dashboardSkillCategoryLabels: Record<
  DashboardSkillCategory,
  string
> = {
  "openclaw-built-in": "OpenClaw built-in",
  "system-web": "System Web Skill",
  "shared-custom": "Shared custom",
  "agent-scoped-custom": "Agent-scoped custom",
};

const originSources = new Set([
  "openclaw-bundled",
  "agents-skills-personal",
]);

function classifySkill(
  sources: string[],
  agentCount: number,
  representedAgentCount: number,
): Pick<DashboardSkillEntry, "category" | "hasAgentOverride"> {
  const hasBundled = sources.includes("openclaw-bundled");
  const hasSystemWeb = sources.includes("agents-skills-personal");
  const hasCustom = sources.some((source) => !originSources.has(source));
  if (hasBundled) {
    return {
      category: "openclaw-built-in",
      hasAgentOverride: hasCustom,
    };
  }
  if (hasSystemWeb) {
    return {
      category: "system-web",
      hasAgentOverride: hasCustom,
    };
  }
  return {
    category:
      representedAgentCount > 0 && agentCount === representedAgentCount
        ? "shared-custom"
        : "agent-scoped-custom",
    hasAgentOverride: false,
  };
}
```

Extend `DashboardSkillEntry` with:

```ts
category: DashboardSkillCategory;
hasAgentOverride: boolean;
```

Inside `buildSkillDirectory()`, calculate:

```ts
const representedAgentCount = new Set(
  assets
    .filter((asset) => asset.kind === "skill")
    .map((asset) => asset.owner),
).size;
```

Then spread `classifySkill(sources, owners.length, representedAgentCount)` into
each returned entry. Remove the obsolete `scope` property.

- [ ] **Step 4: Run the projection test and verify GREEN**

Run:

```bash
npx vitest run tests/observatory-dashboard-directory.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 5: Commit the category model**

```bash
git add lib/observatory/dashboard-directory.ts tests/observatory-dashboard-directory.test.ts
git commit -m "feat: classify dashboard skills"
```

### Task 2: Add category index, filter, badges, and URL state

**Files:**
- Modify: `components/observatory/SkillDirectory.tsx`
- Modify: `app/dashboard/skills/page.tsx`
- Modify: `app/globals.css`
- Test: `tests/observatory-skill-directory.test.tsx`
- Test: `tests/observatory-dashboard-performance.test.tsx`

- [ ] **Step 1: Update fixtures and write failing UI tests**

Replace `scope` in `SkillDirectoryFilters` fixtures with:

```ts
category: "all",
```

Give every `DashboardSkillEntry` fixture `category` and
`hasAgentOverride`. Add assertions that:

```ts
expect(
  screen.getByRole("button", { name: /OpenClaw built-in.*1 Skill/i }),
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: /Agent-scoped custom.*1 Skill/i }),
).toBeInTheDocument();
expect(screen.getByText("Agent override")).toBeInTheDocument();
```

Click the Agent-scoped card and assert only the custom Skill remains and the
last URL is:

```ts
"/dashboard/skills?category=agent-scoped-custom"
```

Change the combined filter test to select `Category` instead of `Skill scope`.

- [ ] **Step 2: Run UI and performance tests and verify RED**

Run:

```bash
npx vitest run tests/observatory-skill-directory.test.tsx tests/observatory-dashboard-performance.test.tsx
```

Expected: fixtures and assertions fail because category UI is absent.

- [ ] **Step 3: Implement category filter state**

Change the filter type to:

```ts
export type SkillDirectoryFilters = {
  q: string;
  category: "all" | DashboardSkillCategory;
  health: string;
  agent: string;
  source: string;
  sort: "name" | "agents" | "instances" | "health";
};
```

Persist non-default category state:

```ts
if (filters.category !== "all") {
  search.set("category", filters.category);
}
```

Filter on `skill.category`, include
`dashboardSkillCategoryLabels[skill.category]` in search text, and remove all
`scope` filtering and URL behavior.

In `app/dashboard/skills/page.tsx`, validate `category` against:

```ts
["all", ...dashboardSkillCategories]
```

and ignore legacy `scope`.

- [ ] **Step 4: Render the four category index cards and badges**

Compute counts with:

```ts
const categoryCounts = Object.fromEntries(
  dashboardSkillCategories.map((category) => [
    category,
    skills.filter((skill) => skill.category === category).length,
  ]),
) as Record<DashboardSkillCategory, number>;
```

Render four buttons before controls. Each button sets `category`, exposes
`aria-pressed`, and includes the label and unique-Skill count. Add a Category
select to the controls. On each Skill card render the category label and, when
true, an `Agent override` badge. Keep Source, Agent, health, sorting, and lazy
instance rendering unchanged.

Add focused CSS classes:

```css
.dashboard-skill-categories {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}

.dashboard-skill-category {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-muted);
  color: var(--text);
  padding: 12px;
  text-align: left;
}

.dashboard-skill-category[aria-pressed="true"] {
  border-color: rgba(67, 211, 139, 0.55);
  background: rgba(67, 211, 139, 0.1);
}
```

Collapse to two columns at `720px` and one column at `520px`.

- [ ] **Step 5: Run UI and performance tests and verify GREEN**

Run:

```bash
npx vitest run tests/observatory-skill-directory.test.tsx tests/observatory-dashboard-performance.test.tsx
```

Expected: all tests pass and Skills initial DOM remains below 3,000 nodes.

- [ ] **Step 6: Commit the Skills directory experience**

```bash
git add app/dashboard/skills/page.tsx app/globals.css components/observatory/SkillDirectory.tsx tests/observatory-skill-directory.test.tsx tests/observatory-dashboard-performance.test.tsx
git commit -m "feat: add dashboard skill categories"
```

### Task 3: Unify sticky navigation offsets

**Files:**
- Modify: `components/observatory/DashboardRouteNav.tsx`
- Modify: `components/observatory/DashboardSectionNav.tsx`
- Modify: `app/globals.css`
- Test: `tests/observatory-dashboard-section-nav.test.tsx`

- [ ] **Step 1: Write failing sticky-stack tests**

Update the CSS assertions to require:

```ts
expect(css).toMatch(
  /\.dashboard-route-nav\s*\{[^}]*top:\s*var\(--dashboard-header-height/u,
);
expect(css).toMatch(
  /\.dashboard-section-nav\s*\{[^}]*top:\s*var\(--dashboard-section-nav-top/u,
);
expect(css).toMatch(
  /\.dashboard-section-anchor\s*\{[^}]*scroll-margin-top:\s*var\(--dashboard-anchor-offset/u,
);
```

Mock `ResizeObserver`, give `.site-header` and route navigation deterministic
heights, and assert the closest `.dashboard-route-shell` receives:

```ts
expect(shell).toHaveStyle({
  "--dashboard-header-height": "64px",
  "--dashboard-route-height": "48px",
});
```

- [ ] **Step 2: Run the navigation test and verify RED**

Run:

```bash
npx vitest run tests/observatory-dashboard-section-nav.test.tsx
```

Expected: CSS variable and measurement assertions fail.

- [ ] **Step 3: Publish shared measurements from `DashboardRouteNav`**

Add a navigation ref and an effect that measures `.site-header` and the route
navigation. Write their rounded heights to the closest route shell:

```ts
shell.style.setProperty(
  "--dashboard-header-height",
  `${Math.ceil(header?.getBoundingClientRect().height ?? 64)}px`,
);
shell.style.setProperty(
  "--dashboard-route-height",
  `${Math.ceil(nav.getBoundingClientRect().height)}px`,
);
```

Observe both elements with `ResizeObserver`; use window resize as the fallback.
Clean up every observer or event listener.

- [ ] **Step 4: Consume the shared stack in section navigation and CSS**

Remove the header-only measurement and inline `--dashboard-nav-top` style from
`DashboardSectionNav`. Keep a nav ref and calculate the IntersectionObserver
reading band from `parseFloat(getComputedStyle(nav).top) + nav.offsetHeight`.

Define:

```css
.dashboard-route-shell {
  --dashboard-header-height: 68px;
  --dashboard-route-height: 48px;
  --dashboard-nav-gap: 12px;
  --dashboard-section-nav-top: calc(
    var(--dashboard-header-height) +
    var(--dashboard-route-height) +
    var(--dashboard-nav-gap)
  );
  --dashboard-anchor-offset: calc(
    var(--dashboard-section-nav-top) + 56px
  );
}
```

Use those variables for the route nav top, section nav top, and section anchor
scroll margin.

- [ ] **Step 5: Run the navigation test and verify GREEN**

Run:

```bash
npx vitest run tests/observatory-dashboard-section-nav.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit sticky-stack coordination**

```bash
git add app/globals.css components/observatory/DashboardRouteNav.tsx components/observatory/DashboardSectionNav.tsx tests/observatory-dashboard-section-nav.test.tsx
git commit -m "fix: coordinate dashboard sticky navigation"
```

### Task 4: Repair Dashboard responsive ordering and overflow

**Files:**
- Modify: `app/globals.css`
- Create: `tests/observatory-dashboard-responsive.test.tsx`

- [ ] **Step 1: Write failing CSS contract tests**

Read `app/globals.css` and assert:

```ts
expect(css).toMatch(
  /\.dashboard-route-shell\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/u,
);
expect(css).toMatch(
  /\.observatory-layout\s*>\s*\*\s*\{[^}]*min-width:\s*0/u,
);
expect(css).not.toMatch(
  /@media\s*\(max-width:\s*960px\)[\s\S]*?\.observatory-capture\s*\{[^}]*order:\s*-1/u,
);
expect(css).toMatch(
  /@media\s*\(max-width:\s*520px\)[\s\S]*?\.observatory-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u,
);
```

- [ ] **Step 2: Run the responsive test and verify RED**

Run:

```bash
npx vitest run tests/observatory-dashboard-responsive.test.tsx
```

Expected: assertions fail against the current narrow layout.

- [ ] **Step 3: Implement the minimal responsive CSS repair**

Add shrink constraints to `.dashboard-route-shell`, `.observatory-page`,
`.observatory-overview`, `.observatory-layout > *`, and Dashboard directory
containers. Remove `order: -1` from the `960px` capture rule. Keep the single
column layout in DOM order. Keep two summary columns through tablet/mobile and
add:

```css
@media (max-width: 520px) {
  .observatory-summary {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

Ensure table and navigation wrappers own their horizontal overflow; do not set
page-level `overflow-x: hidden`, which would mask unresolved layout defects.

- [ ] **Step 4: Run responsive and existing navigation tests**

Run:

```bash
npx vitest run tests/observatory-dashboard-responsive.test.tsx tests/observatory-dashboard-section-nav.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit responsive layout repair**

```bash
git add app/globals.css tests/observatory-dashboard-responsive.test.tsx
git commit -m "fix: restore responsive dashboard layout"
```

### Task 5: Full verification and production release

**Files:**
- Verify all modified files
- Update only release metadata already maintained by the repository, if any

- [ ] **Step 1: Run focused tests**

```bash
npx vitest run tests/observatory-dashboard-directory.test.ts tests/observatory-skill-directory.test.tsx tests/observatory-dashboard-section-nav.test.tsx tests/observatory-dashboard-responsive.test.tsx tests/observatory-dashboard-performance.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run full quality gates**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits zero.

- [ ] **Step 3: Run responsive browser verification**

Start the production build locally and inspect `/dashboard` and
`/dashboard/skills` at `390`, `520`, `720`, `900`, `1024`, and `1440` pixels
using the authenticated test path available to the repository. Verify:

- document scroll width equals viewport width;
- sticky navigations do not overlap;
- Overview precedes Quick Capture at `960px` and below;
- all Dashboard sections remain reachable;
- category cards and directory cards remain readable.

If no authenticated browser state is available, validate protected route
behavior through route tests and use the production CSS/DOM fixture for visual
geometry without accessing a personal browser profile.

- [ ] **Step 4: Rebase on the latest `origin/main` and rerun affected gates**

```bash
git fetch origin
git rebase origin/main
npx vitest run tests/observatory-dashboard-directory.test.ts tests/observatory-skill-directory.test.tsx tests/observatory-dashboard-section-nav.test.tsx tests/observatory-dashboard-responsive.test.tsx tests/observatory-dashboard-performance.test.tsx
npm run typecheck
```

Expected: clean rebase and all affected gates pass.

- [ ] **Step 5: Fast-forward the authorized change to `main` and push**

Preserve the dirty user worktree. Update the branch through Git refs or a clean
release worktree; do not checkout or overwrite unrelated files in the main
worktree.

```bash
git push origin HEAD:main
```

Expected: remote `main` points to the verified release commit.

- [ ] **Step 6: Verify Vercel production**

Confirm the deployment for the exact pushed commit reaches `READY`, then smoke:

```text
GET /dashboard
GET /dashboard/projects
GET /dashboard/skills
```

Expected for anonymous access: each route redirects to `/auth` while preserving
its exact `redirectTo`; no Dashboard data is present in the response.

- [ ] **Step 7: Record final evidence**

Report the release commit, Vercel deployment ID, full test count, lint,
typecheck, build results, responsive widths checked, protected-route smoke
results, and confirmation that unrelated post changes remain untouched.
