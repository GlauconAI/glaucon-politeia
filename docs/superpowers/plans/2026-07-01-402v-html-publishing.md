# 402v HTML Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable path to publish existing HTML pages and generated HTML artifacts to `https://402v.com` with either anonymous public access or login-required private access.

**Architecture:** Extend the existing `posts` model instead of introducing a parallel CMS. Supabase remains the source of truth for content, visibility, auth, and RLS; Next.js renders Markdown through the existing Markdown renderer and HTML artifacts through a sandboxed iframe viewer. Local publishing is handled by a repository script that reads an HTML file and inserts a post through the existing Supabase service-role environment.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase Auth/RLS, Vercel, Vitest, Testing Library, Node.js scripts, standard browser iframe sandboxing.

---

## Project Scope

This plan packages three pieces into one `402v Publishing System` project:

- Existing production site: `/Users/glaucon/Workspaces/codex_projects/glaucon-politeia`.
- Existing upstream generator: `/Users/glaucon/.config/superpowers/worktrees/plato/html-artifact-publisher-v1/skills-dev/html-artifact-publisher/`.
- New online publishing workflow: publish a local HTML file into the `posts` table and make it visible at `https://402v.com/posts/<slug>`.

The v1 boundary is intentionally small:

- Store HTML artifacts as post content.
- Support `public` and `private` visibility.
- Preserve existing Markdown posts.
- Use a sandboxed iframe for HTML rendering.
- Do not execute arbitrary artifact scripts in v1.
- Do not build a separate file hosting system in v1.
- Do not move `html-artifact-publisher` into this repo during the first implementation pass.

## File Structure

- `supabase/migrations/20260701000100_post_visibility_and_html.sql`
  - Adds `visibility`, `content_format`, and `content_html` to `public.posts`.
  - Adds `public.can_read_post(public.posts)` so all RLS policies share one readability rule.
  - Updates post-related policies to respect public/private access.

- `scripts/supabase-ops.mjs`
  - Adds the new migration to `apply-missing`, `status`, and `readiness` checks.

- `lib/posts/content.ts`
  - Owns post visibility and content-format validation.
  - Converts HTML to plain text for excerpts.
  - Normalizes publish inputs for Markdown and HTML.

- `lib/posts/service.ts`
  - Accepts `visibility`, `contentFormat`, and `contentHtml`.
  - Continues to create existing Markdown posts.
  - Creates HTML posts with sandbox-rendered content.

- `components/posts/HtmlArtifactView.tsx`
  - Renders HTML artifacts in a locked-down iframe using `srcDoc`.

- `components/posts/PostBody.tsx`
  - Chooses Markdown or HTML rendering based on `content_format`.

- `app/posts/[slug]/page.tsx`
  - Selects the new post fields.
  - Renders public/private status metadata.
  - Uses `PostBody`.

- `app/editor/page.tsx`
  - Adds controls for visibility and content format.

- `app/editor/actions.ts`
  - Reads new form fields and passes them to `createPost`.

- `scripts/publish-html.mjs`
  - Local CLI entry point for publishing an HTML file.
  - Reads `.env.local`, validates arguments, derives title/slug/excerpt, and inserts into Supabase.

- `package.json`
  - Adds `publish:html`.

- `tests/post-visibility-migration.test.ts`
  - Verifies migration SQL adds the required columns, constraints, helper, and policy rewrites.

- `tests/posts-content.test.ts`
  - Verifies validation, HTML text extraction, and excerpt generation.

- `tests/post-body.test.tsx`
  - Verifies Markdown and HTML rendering paths.

- `tests/publish-html-cli.test.mjs`
  - Verifies CLI argument handling, title extraction, slug generation, and dry-run output.

---

### Task 1: Add Post Visibility And HTML Schema

**Files:**
- Create: `supabase/migrations/20260701000100_post_visibility_and_html.sql`
- Create: `tests/post-visibility-migration.test.ts`
- Modify: `scripts/supabase-ops.mjs`

- [ ] **Step 1: Write the migration SQL test**

Create `tests/post-visibility-migration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260701000100_post_visibility_and_html.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8").toLowerCase();
}

describe("post visibility and html migration", () => {
  it("adds visibility and content format fields", () => {
    const sql = readMigration();

    expect(sql).toContain("add column if not exists visibility text");
    expect(sql).toContain("check (visibility in ('public', 'private'))");
    expect(sql).toContain("add column if not exists content_format text");
    expect(sql).toContain("check (content_format in ('markdown', 'html'))");
    expect(sql).toContain("add column if not exists content_html text");
  });

  it("centralizes readable-post logic", () => {
    const sql = readMigration();

    expect(sql).toContain("create or replace function public.can_read_post");
    expect(sql).toContain("post_row.visibility = 'public'");
    expect(sql).toContain("auth.uid() is not null");
    expect(sql).toContain("post_row.author_id = auth.uid()");
    expect(sql).toContain("public.is_current_user_admin()");
  });

  it("replaces policies that depend on post readability", () => {
    const sql = readMigration();

    for (const policy of [
      "posts_select_public_owner_or_admin",
      "post_tags_select_readable_posts",
      "comments_select_on_readable_posts",
      "post_reactions_select_readable_posts",
      "comments_insert_own_on_readable_published_posts",
      "post_reactions_insert_own_on_readable_published_posts",
      "bookmarks_insert_own_on_readable_published_posts",
    ]) {
      expect(sql).toContain(policy);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails before the migration exists**

Run:

```bash
npm test -- tests/post-visibility-migration.test.ts
```

Expected result:

```text
FAIL tests/post-visibility-migration.test.ts
ENOENT: no such file or directory
```

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260701000100_post_visibility_and_html.sql`:

```sql
alter table public.posts
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column if not exists content_format text not null default 'markdown'
    check (content_format in ('markdown', 'html')),
  add column if not exists content_html text not null default '';

alter table public.posts
  drop constraint if exists posts_content_matches_format;

alter table public.posts
  add constraint posts_content_matches_format check (
    (content_format = 'markdown' and length(btrim(content_md)) > 0)
    or (content_format = 'html' and length(btrim(content_html)) > 0)
  );

create index if not exists posts_visibility_status_published_idx
on public.posts(visibility, status, published_at desc);

create or replace function public.can_read_post(post_row public.posts)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    post_row.author_id = auth.uid()
    or public.is_current_user_admin()
    or (
      post_row.status = 'published'
      and (
        post_row.visibility = 'public'
        or auth.uid() is not null
      )
    );
$$;

drop policy if exists posts_select_public_owner_or_admin on public.posts;
create policy posts_select_public_owner_or_admin
on public.posts for select
using (public.can_read_post(posts));

drop policy if exists post_tags_select_readable_posts on public.post_tags;
create policy post_tags_select_readable_posts
on public.post_tags for select
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_tags.post_id
      and public.can_read_post(posts)
  )
);

drop policy if exists comments_select_on_readable_posts on public.comments;
create policy comments_select_on_readable_posts
on public.comments for select
using (
  exists (
    select 1
    from public.posts
    where posts.id = comments.post_id
      and public.can_read_post(posts)
  )
);

drop policy if exists comments_insert_own_on_published_posts on public.comments;
create policy comments_insert_own_on_readable_published_posts
on public.comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.posts
    where posts.id = comments.post_id
      and posts.status = 'published'
      and public.can_read_post(posts)
  )
);

drop policy if exists post_reactions_select_public on public.post_reactions;
create policy post_reactions_select_readable_posts
on public.post_reactions for select
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_reactions.post_id
      and public.can_read_post(posts)
  )
);

drop policy if exists post_reactions_insert_own_on_published_posts on public.post_reactions;
create policy post_reactions_insert_own_on_readable_published_posts
on public.post_reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts
    where posts.id = post_reactions.post_id
      and posts.status = 'published'
      and public.can_read_post(posts)
  )
);

drop policy if exists bookmarks_insert_own_on_published_posts on public.bookmarks;
create policy bookmarks_insert_own_on_readable_published_posts
on public.bookmarks for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts
    where posts.id = bookmarks.post_id
      and posts.status = 'published'
      and public.can_read_post(posts)
  )
);

drop view if exists public.post_engagement_counts;
create view public.post_engagement_counts as
select
  posts.id as post_id,
  count(distinct post_reactions.id) filter (where post_reactions.type = 'like')::integer as like_count,
  count(distinct bookmarks.id)::integer as bookmark_count,
  count(distinct comments.id)::integer as comment_count
from public.posts
left join public.post_reactions on post_reactions.post_id = posts.id
left join public.bookmarks on bookmarks.post_id = posts.id
left join public.comments on comments.post_id = posts.id
where posts.status = 'published'
  and posts.visibility = 'public'
group by posts.id;

grant select on public.post_engagement_counts to anon, authenticated;
```

- [ ] **Step 4: Register the migration in Supabase ops**

Modify `scripts/supabase-ops.mjs` so `migrations` includes:

```js
const migrations = {
  avatarStorage: "supabase/migrations/20260515000200_avatar_storage.sql",
  prompts: "supabase/migrations/20260515000300_prompts.sql",
  promptAdminRpc: "supabase/migrations/20260515000400_prompt_admin_rpc.sql",
  postVisibilityHtml: "supabase/migrations/20260701000100_post_visibility_and_html.sql",
};
```

Add a `postVisibilityHtml` status check inside `readStatus`:

```sql
exists(
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'posts'
    and column_name = 'content_format'
) as post_visibility_html
```

Add this condition to `migrationPlanFromStatus`:

```js
if (!status.postVisibilityHtml) {
  plan.push(migrations.postVisibilityHtml);
}
```

- [ ] **Step 5: Verify the migration test passes**

Run:

```bash
npm test -- tests/post-visibility-migration.test.ts
```

Expected:

```text
PASS tests/post-visibility-migration.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260701000100_post_visibility_and_html.sql scripts/supabase-ops.mjs tests/post-visibility-migration.test.ts
git commit -m "feat: add post visibility and html schema"
```

---

### Task 2: Add Post Content Domain Helpers

**Files:**
- Create: `lib/posts/content.ts`
- Create: `tests/posts-content.test.ts`
- Modify: `lib/posts/service.ts`

- [ ] **Step 1: Write the content helper tests**

Create `tests/posts-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createContentExcerpt,
  normalizeContentFormat,
  normalizePostVisibility,
  validatePostContent,
} from "@/lib/posts/content";

describe("post content helpers", () => {
  it("normalizes known visibility values", () => {
    expect(normalizePostVisibility("private")).toBe("private");
    expect(normalizePostVisibility("public")).toBe("public");
    expect(normalizePostVisibility("")).toBe("public");
    expect(normalizePostVisibility("unknown")).toBe("public");
  });

  it("normalizes known content format values", () => {
    expect(normalizeContentFormat("html")).toBe("html");
    expect(normalizeContentFormat("markdown")).toBe("markdown");
    expect(normalizeContentFormat("")).toBe("markdown");
    expect(normalizeContentFormat("pdf")).toBe("markdown");
  });

  it("requires markdown body for markdown posts", () => {
    expect(() =>
      validatePostContent({ contentFormat: "markdown", markdown: "", html: "" }),
    ).toThrow("Markdown content is required");
  });

  it("requires html body for html posts", () => {
    expect(() =>
      validatePostContent({ contentFormat: "html", markdown: "", html: "" }),
    ).toThrow("HTML content is required");
  });

  it("creates a readable excerpt from html", () => {
    expect(
      createContentExcerpt({
        contentFormat: "html",
        markdown: "",
        html: "<main><h1>Report</h1><p>Hello <strong>world</strong>.</p><script>alert(1)</script></main>",
      }),
    ).toBe("Report Hello world.");
  });
});
```

- [ ] **Step 2: Run the tests and confirm the helpers are missing**

Run:

```bash
npm test -- tests/posts-content.test.ts
```

Expected:

```text
FAIL tests/posts-content.test.ts
Cannot find module '@/lib/posts/content'
```

- [ ] **Step 3: Create `lib/posts/content.ts`**

Create:

```ts
import { createExcerpt } from "@/lib/posts/text";

export type PostVisibility = "public" | "private";
export type PostContentFormat = "markdown" | "html";

type ContentInput = {
  contentFormat: PostContentFormat;
  markdown: string;
  html: string;
};

export function normalizePostVisibility(value: string): PostVisibility {
  return value === "private" ? "private" : "public";
}

export function normalizeContentFormat(value: string): PostContentFormat {
  return value === "html" ? "html" : "markdown";
}

export function stripHtmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function validatePostContent(input: ContentInput) {
  if (input.contentFormat === "markdown" && !input.markdown.trim()) {
    throw new Error("Markdown content is required");
  }

  if (input.contentFormat === "html" && !input.html.trim()) {
    throw new Error("HTML content is required");
  }
}

export function createContentExcerpt(input: ContentInput) {
  if (input.contentFormat === "html") {
    return createExcerpt(stripHtmlToText(input.html));
  }

  return createExcerpt(input.markdown);
}
```

- [ ] **Step 4: Modify `lib/posts/service.ts`**

Extend `createPost` input:

```ts
visibility?: "public" | "private";
contentFormat?: "markdown" | "html";
contentHtml?: string;
```

Import helpers:

```ts
import {
  createContentExcerpt,
  normalizeContentFormat,
  normalizePostVisibility,
  validatePostContent,
} from "@/lib/posts/content";
```

Inside `createPost`, normalize the new fields:

```ts
const visibility = normalizePostVisibility(input.visibility ?? "public");
const contentFormat = normalizeContentFormat(input.contentFormat ?? "markdown");
const contentHtml = input.contentHtml?.trim() ?? "";

validatePostContent({
  contentFormat,
  markdown: content,
  html: contentHtml,
});
```

Add these fields to the `posts` insert:

```ts
excerpt: createContentExcerpt({
  contentFormat,
  markdown: content,
  html: contentHtml,
}),
content_md: contentFormat === "markdown" ? content : "",
content_html: contentFormat === "html" ? contentHtml : "",
content_format: contentFormat,
visibility,
```

- [ ] **Step 5: Verify helper tests pass**

Run:

```bash
npm test -- tests/posts-content.test.ts
```

Expected:

```text
PASS tests/posts-content.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/posts/content.ts lib/posts/service.ts tests/posts-content.test.ts
git commit -m "feat: add post content format helpers"
```

---

### Task 3: Render HTML Artifacts Safely

**Files:**
- Create: `components/posts/HtmlArtifactView.tsx`
- Create: `components/posts/PostBody.tsx`
- Create: `tests/post-body.test.tsx`
- Modify: `app/posts/[slug]/page.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write rendering tests**

Create `tests/post-body.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PostBody } from "@/components/posts/PostBody";

describe("PostBody", () => {
  it("renders markdown posts with the markdown body", () => {
    render(
      <PostBody
        contentFormat="markdown"
        contentMd="# Hello"
        contentHtml=""
        title="Hello"
      />,
    );

    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("renders html posts inside a sandboxed iframe", () => {
    render(
      <PostBody
        contentFormat="html"
        contentMd=""
        contentHtml="<html><body><h1>Artifact</h1></body></html>"
        title="Artifact"
      />,
    );

    const frame = screen.getByTitle("Artifact");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcDoc", "<html><body><h1>Artifact</h1></body></html>");
  });
});
```

- [ ] **Step 2: Run the tests and confirm the component is missing**

Run:

```bash
npm test -- tests/post-body.test.tsx
```

Expected:

```text
FAIL tests/post-body.test.tsx
Cannot find module '@/components/posts/PostBody'
```

- [ ] **Step 3: Create HTML artifact renderer**

Create `components/posts/HtmlArtifactView.tsx`:

```tsx
type HtmlArtifactViewProps = {
  html: string;
  title: string;
};

export function HtmlArtifactView({ html, title }: HtmlArtifactViewProps) {
  return (
    <div className="html-artifact-view">
      <iframe
        title={title}
        srcDoc={html}
        sandbox=""
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create post body switcher**

Create `components/posts/PostBody.tsx`:

```tsx
import { HtmlArtifactView } from "@/components/posts/HtmlArtifactView";
import { MarkdownView } from "@/components/posts/MarkdownView";

type PostBodyProps = {
  contentFormat: "markdown" | "html";
  contentMd: string;
  contentHtml: string;
  title: string;
};

export function PostBody({
  contentFormat,
  contentMd,
  contentHtml,
  title,
}: PostBodyProps) {
  if (contentFormat === "html") {
    return <HtmlArtifactView html={contentHtml} title={title} />;
  }

  return <MarkdownView content={contentMd} />;
}
```

- [ ] **Step 5: Modify post detail route**

In `app/posts/[slug]/page.tsx`, replace the selected fields:

```ts
.select("id,slug,title,content_md,content_html,content_format,visibility,published_at,profiles(username,display_name),post_tags(tags(slug,name)),post_engagement_counts(like_count,bookmark_count,comment_count)")
```

Replace:

```tsx
<MarkdownView content={post.content_md} />
```

with:

```tsx
{post.visibility === "private" ? (
  <p className="visibility-badge">Private</p>
) : null}
<PostBody
  contentFormat={post.content_format === "html" ? "html" : "markdown"}
  contentMd={post.content_md}
  contentHtml={post.content_html}
  title={post.title}
/>
```

- [ ] **Step 6: Add iframe styles**

Add to `app/globals.css`:

```css
.visibility-badge {
  display: inline-flex;
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  color: var(--muted-foreground);
  font-size: 0.875rem;
}

.html-artifact-view {
  margin-top: 1.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.html-artifact-view iframe {
  display: block;
  width: 100%;
  min-height: 72vh;
  border: 0;
  background: white;
}
```

- [ ] **Step 7: Verify rendering tests pass**

Run:

```bash
npm test -- tests/post-body.test.tsx
```

Expected:

```text
PASS tests/post-body.test.tsx
```

- [ ] **Step 8: Commit**

```bash
git add app/posts/[slug]/page.tsx app/globals.css components/posts/HtmlArtifactView.tsx components/posts/PostBody.tsx tests/post-body.test.tsx
git commit -m "feat: render html artifact posts"
```

---

### Task 4: Extend The Editor For Visibility And Format

**Files:**
- Modify: `app/editor/page.tsx`
- Modify: `app/editor/actions.ts`

- [ ] **Step 1: Add editor form fields**

In `app/editor/page.tsx`, add this fieldset before the content textarea:

```tsx
<fieldset>
  <legend>发布设置</legend>
  <div className="tag-picker">
    <label>
      <input type="radio" name="visibility" value="public" defaultChecked />
      Public
    </label>
    <label>
      <input type="radio" name="visibility" value="private" />
      Private
    </label>
  </div>
  <div className="tag-picker">
    <label>
      <input type="radio" name="contentFormat" value="markdown" defaultChecked />
      Markdown
    </label>
    <label>
      <input type="radio" name="contentFormat" value="html" />
      HTML
    </label>
  </div>
</fieldset>
```

Rename the textarea label to:

```tsx
正文（Markdown 或 HTML）
```

- [ ] **Step 2: Read new form fields in the server action**

In `app/editor/actions.ts`, read:

```ts
const visibility = getFormString(formData, "visibility");
const contentFormat = getFormString(formData, "contentFormat");
const content = getFormString(formData, "content");
```

Pass:

```ts
content,
contentHtml: contentFormat === "html" ? content : "",
visibility: visibility === "private" ? "private" : "public",
contentFormat: contentFormat === "html" ? "html" : "markdown",
```

For Markdown posts, `content` remains Markdown. For HTML posts, `contentHtml` contains the HTML and `content` is used only as a form input value.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected:

```text
tsc --noEmit
```

with exit code `0`.

- [ ] **Step 4: Commit**

```bash
git add app/editor/page.tsx app/editor/actions.ts
git commit -m "feat: add editor visibility and format controls"
```

---

### Task 5: Add Local HTML Publish CLI

**Files:**
- Create: `scripts/publish-html.mjs`
- Create: `tests/publish-html-cli.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write dry-run CLI tests**

Create `tests/publish-html-cli.test.mjs`:

```js
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("publish-html cli", () => {
  it("extracts title and reports dry-run payload", () => {
    const dir = mkdtempSync(join(tmpdir(), "publish-html-"));
    const input = join(dir, "artifact.html");
    writeFileSync(input, "<!doctype html><title>My Artifact</title><h1>Hello</h1>");

    const output = execFileSync(
      "node",
      [
        "scripts/publish-html.mjs",
        "--input",
        input,
        "--visibility",
        "private",
        "--author-id",
        "00000000-0000-0000-0000-000000000000",
        "--dry-run",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    const payload = JSON.parse(output);
    expect(payload.title).toBe("My Artifact");
    expect(payload.slug).toBe("my-artifact");
    expect(payload.visibility).toBe("private");
    expect(payload.contentFormat).toBe("html");
  });
});
```

- [ ] **Step 2: Run the test and confirm the CLI is missing**

Run:

```bash
npm test -- tests/publish-html-cli.test.mjs
```

Expected:

```text
FAIL tests/publish-html-cli.test.mjs
Cannot find module 'scripts/publish-html.mjs'
```

- [ ] **Step 3: Create `scripts/publish-html.mjs`**

Create a Node script with these exported-free top-level functions:

```js
#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
const html = readFileSync(args.input, "utf8");
const title = args.title || extractTitle(html) || "Untitled Artifact";
const slug = args.slug || slugify(title);
const payload = {
  author_id: args.authorId,
  slug,
  title,
  excerpt: stripHtmlToText(html).slice(0, 140),
  content_md: "",
  content_html: html,
  content_format: "html",
  visibility: args.visibility,
  status: args.publish ? "published" : "draft",
  published_at: args.publish ? new Date().toISOString() : null,
};

if (args.dryRun) {
  process.stdout.write(
    JSON.stringify(
      {
        title,
        slug,
        visibility: args.visibility,
        contentFormat: "html",
        publish: args.publish,
      },
      null,
      2,
    ),
  );
  process.stdout.write("\n");
  process.exit(0);
}

const env = readEnv(".env.local");
const missing = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
].filter((key) => !env[key]);

if (missing.length > 0) {
  fail(`Missing required environment variables in .env.local: ${missing.join(", ")}`);
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const { data, error } = await supabase
  .from("posts")
  .insert(payload)
  .select("slug")
  .single();

if (error) {
  fail(error.message);
}

console.log(`Published: https://402v.com/posts/${data.slug}`);

function parseArgs(values) {
  const input = readFlag(values, "--input");
  const title = readFlag(values, "--title");
  const slug = readFlag(values, "--slug");
  const authorId = readFlag(values, "--author-id");
  const visibility = readFlag(values, "--visibility") || "public";
  const dryRun = values.includes("--dry-run");
  const publish = !values.includes("--draft");

  if (!input) fail("--input is required");
  if (!authorId) fail("--author-id is required");
  if (!["public", "private"].includes(visibility)) {
    fail("--visibility must be public or private");
  }

  return { input, title, slug, authorId, visibility, dryRun, publish };
}

function readFlag(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? undefined : values[index + 1];
}

function extractTitle(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64)
    .replace(/-+$/g, "") || "artifact";
}

function stripHtmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
```

- [ ] **Step 4: Add package script**

In `package.json` scripts:

```json
"publish:html": "node scripts/publish-html.mjs"
```

- [ ] **Step 5: Verify CLI dry-run test passes**

Run:

```bash
npm test -- tests/publish-html-cli.test.mjs
```

Expected:

```text
PASS tests/publish-html-cli.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/publish-html.mjs tests/publish-html-cli.test.mjs
git commit -m "feat: add html publish cli"
```

---

### Task 6: Update Feed, Search, Tags, Profiles, And Operations

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/search/page.tsx`
- Modify: `app/tags/[tag]/page.tsx`
- Modify: `app/profile/[username]/page.tsx`
- Modify: `docs/ops/deployment-checklist.md`
- Modify: `docs/ops/rls-verification.md`

- [ ] **Step 1: Confirm all list queries select the new visibility field**

For each list route, include `visibility` in selected post fields. Example for `app/page.tsx`:

```ts
"slug,title,excerpt,visibility,published_at,profiles(username,display_name),post_tags(tags(slug,name)),post_engagement_counts(like_count,bookmark_count,comment_count)"
```

- [ ] **Step 2: Keep anonymous filtering in the database**

Do not add a client-side filter for private posts. Supabase RLS must be the source of truth. Route queries may continue to use:

```ts
.eq("status", "published")
```

Authenticated users can see private published posts because RLS allows authenticated reads. Anonymous users receive only public rows.

- [ ] **Step 3: Update operational docs**

In `docs/ops/deployment-checklist.md`, add:

```markdown
- Post visibility/content migration applied.
- Anonymous browser cannot read `visibility = private` posts.
- Authenticated browser can read `visibility = private` published posts.
- HTML posts render inside a sandboxed iframe.
- `npm run publish:html -- --input <file> --author-id <uuid> --visibility public --dry-run` works locally.
```

In `docs/ops/rls-verification.md`, add a section:

```markdown
## Post Visibility

- Anonymous role can select published public posts.
- Anonymous role cannot select published private posts.
- Authenticated role can select published private posts.
- Author and admin can select drafts.
- Post tags, comments, reactions, and bookmarks use the same readable-post rule.
```

- [ ] **Step 4: Run full local verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected:

```text
Test Files 17 passed
tsc --noEmit
Compiled successfully
```

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/search/page.tsx app/tags/[tag]/page.tsx app/profile/[username]/page.tsx docs/ops/deployment-checklist.md docs/ops/rls-verification.md
git commit -m "docs: document html publishing verification"
```

---

### Task 7: Apply Migration, Verify Vercel, And Deploy

**Files:**
- No source files unless verification exposes a concrete bug.

- [ ] **Step 1: Confirm CLI auth**

Run:

```bash
npx vercel whoami
```

Expected:

```text
plato-8448
```

- [ ] **Step 2: Apply missing Supabase migrations**

Run:

```bash
npm run supabase:apply-missing
```

Expected:

```text
Applying supabase/migrations/20260701000100_post_visibility_and_html.sql ... ok
```

If the migration was already applied, expected:

```text
No missing Supabase migrations detected.
```

- [ ] **Step 3: Confirm readiness**

Run:

```bash
npm run supabase:readiness
```

Expected:

```text
Launch readiness: ready
```

- [ ] **Step 4: Build through Vercel**

Run:

```bash
npm run vercel:build
```

Expected:

```text
Build Completed
```

- [ ] **Step 5: Deploy**

Run:

```bash
npm run vercel:deploy
```

Expected:

```text
Production: https://402v.com
```

- [ ] **Step 6: Publish a public smoke-test artifact**

Resolve the owner profile id from the existing admin profile:

```bash
OWNER_PROFILE_USER_ID="$(node --input-type=module - <<'NODE'
import fs from "node:fs";
import postgres from "postgres";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index === -1) continue;
  env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
}

if (!env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is missing from .env.local");
}

const sql = postgres(env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
const rows = await sql`
  select user_id
  from public.profiles
  where is_admin = true
  order by created_at asc
  limit 1
`;
await sql.end({ timeout: 5 });

if (!rows[0]?.user_id) {
  throw new Error("No admin profile found");
}

console.log(rows[0].user_id);
NODE
)"
```

Run:

```bash
npm run publish:html -- --input /tmp/402v-public-smoke.html --author-id "$OWNER_PROFILE_USER_ID" --visibility public
```

Expected:

```text
Published: https://402v.com/posts/402v-public-smoke
```

Open the URL in an anonymous browser session and verify the iframe renders.

- [ ] **Step 7: Publish a private smoke-test artifact**

Run:

```bash
npm run publish:html -- --input /tmp/402v-private-smoke.html --author-id "$OWNER_PROFILE_USER_ID" --visibility private
```

Expected:

```text
Published: https://402v.com/posts/402v-private-smoke
```

Verify:

- Anonymous browser gets not-found or inaccessible content.
- Logged-in browser can read the post.

- [ ] **Step 8: Commit deployment docs if smoke-test notes are recorded**

```bash
git add docs/ops/deployment-checklist.md docs/ops/rls-verification.md
git commit -m "docs: record html publishing launch checks"
```

---

## Self-Review

### Spec Coverage

- Existing `402v.com` maintenance is covered by the README project package and current Vercel/Supabase ops.
- Existing `html-artifact-publisher` v1 is represented as the upstream generator and not confused with the online app.
- Public publishing is covered by `visibility = public`, RLS, feed/detail rendering, and CLI publish.
- Private publishing is covered by `visibility = private`, `public.can_read_post`, route rendering, and smoke tests.
- HTML rendering is covered by the sandboxed iframe component.
- Markdown compatibility is preserved by keeping `content_md`, defaulting `content_format` to `markdown`, and using `PostBody`.
- Vercel authorization is covered in Task 7.

### Placeholder Scan

This plan contains no unknown implementation placeholders. Runtime owner identity is resolved from the existing admin profile through `SUPABASE_DB_URL` before smoke-test publishing.

### Risk Notes

- Sandboxed iframe rendering means arbitrary scripts inside HTML artifacts do not run in v1. This is the correct default for public publishing.
- `post_engagement_counts` remains public-only to avoid leaking private post IDs through a public view.
- The first implementation should not migrate `html-artifact-publisher` into this repo. It should connect through CLI usage first.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-01-402v-html-publishing.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** - execute tasks in this session using `executing-plans`, with checkpoints after each task.

Recommended choice for this project: **Inline Execution for Task 1 and Task 2 first**, because database/RLS shape should be reviewed before UI and deployment tasks proceed.
