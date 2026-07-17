# Standalone HTML Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve every visible HTML post as the exact top-level HTML document at its existing `/posts/<slug>` URL while leaving Markdown posts unchanged.

**Architecture:** A root Next.js `proxy.ts` intercepts `/posts/:slug`, reads the post through a request-scoped Supabase SSR client, and returns raw HTML only when RLS exposes a published HTML record. Focused helpers build the secure response and bridge refreshed auth cookies; Markdown and unavailable posts fall through to the existing App Router page.

**Tech Stack:** Next.js 16 Proxy, TypeScript, Supabase SSR/RLS, Vitest, Vercel

---

### Task 1: Standalone HTML response

**Files:**
- Create: `lib/posts/standalone-html.ts`
- Test: `tests/standalone-html.test.ts`

- [ ] **Step 1: Write the failing response test**

```ts
import { describe, expect, it } from "vitest";

import { createStandaloneHtmlResponse } from "@/lib/posts/standalone-html";

describe("createStandaloneHtmlResponse", () => {
  it("returns the exact HTML as a sandboxed top-level document", async () => {
    const html = "<!doctype html><html><body><h1>Artifact</h1></body></html>";
    const response = createStandaloneHtmlResponse(html);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(html);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(response.headers.get("content-security-policy")).not.toContain("allow-same-origin");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/standalone-html.test.ts`

Expected: FAIL because `@/lib/posts/standalone-html` does not exist.

- [ ] **Step 3: Implement the minimal response helper**

```ts
import { NextResponse } from "next/server";

const artifactCsp = [
  "sandbox allow-scripts allow-forms allow-modals allow-popups",
  "default-src 'none'",
  "style-src 'unsafe-inline' https:",
  "script-src 'unsafe-inline' 'unsafe-eval' https:",
  "img-src data: blob: https:",
  "font-src data: https:",
  "connect-src https:",
  "media-src data: blob: https:",
  "frame-src https:",
  "form-action https:",
].join("; ");

export function createStandaloneHtmlResponse(html: string) {
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": artifactCsp,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test -- tests/standalone-html.test.ts`

Expected: 1 test passes.

- [ ] **Step 5: Commit the response helper**

```bash
git add lib/posts/standalone-html.ts tests/standalone-html.test.ts
git commit -m "feat: add standalone HTML responses"
```

### Task 2: Proxy cookie bridge and post request routing

**Files:**
- Create: `lib/supabase/proxy.ts`
- Create: `proxy.ts`
- Test: `tests/proxy.test.ts`

- [ ] **Step 1: Write failing routing and cookie tests**

```ts
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createProxyCookieAdapter, copyResponseCookies } from "@/lib/supabase/proxy";
import { resolvePostRequest } from "@/proxy";

describe("standalone HTML proxy", () => {
  it("returns exact HTML for a visible HTML post", async () => {
    const html = "<!doctype html><html><body>full page</body></html>";
    const loader = vi.fn().mockResolvedValue({ content_format: "html", content_html: html });
    const request = new NextRequest("https://402v.com/posts/artifact");

    const response = await resolvePostRequest(request, loader);

    expect(loader).toHaveBeenCalledWith(request, expect.any(NextResponse), "artifact");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toBe(html);
  });

  it("falls through for Markdown and unavailable posts", async () => {
    const request = new NextRequest("https://402v.com/posts/note");
    const markdown = await resolvePostRequest(
      request,
      vi.fn().mockResolvedValue({ content_format: "markdown", content_html: null }),
    );
    const missing = await resolvePostRequest(request, vi.fn().mockResolvedValue(null));

    expect(markdown.headers.get("x-middleware-next")).toBe("1");
    expect(missing.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes request cookies to Supabase and copies refreshed cookies", () => {
    const request = new NextRequest("https://402v.com/posts/private", {
      headers: { cookie: "session=old" },
    });
    const continuation = NextResponse.next();
    const adapter = createProxyCookieAdapter(request, continuation);

    expect(adapter.getAll()).toEqual(expect.arrayContaining([{ name: "session", value: "old" }]));
    adapter.setAll(
      [{ name: "session", value: "new", options: { httpOnly: true } }],
      { "Cache-Control": "private, no-store" },
    );

    const standalone = NextResponse.next();
    copyResponseCookies(continuation, standalone);
    expect(standalone.cookies.get("session")?.value).toBe("new");
    expect(continuation.headers.get("cache-control")).toBe("private, no-store");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/proxy.test.ts`

Expected: FAIL because `proxy.ts` and `lib/supabase/proxy.ts` do not exist.

- [ ] **Step 3: Implement the cookie bridge**

```ts
import type { CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function createProxyCookieAdapter(request: NextRequest, response: NextResponse) {
  return {
    getAll: () => request.cookies.getAll(),
    setAll: (
      cookies: Array<{ name: string; value: string; options: CookieOptions }>,
      headers: Record<string, string>,
    ) => {
      for (const { name, value, options } of cookies) {
        response.cookies.set(name, value, options);
      }
      for (const [name, value] of Object.entries(headers)) {
        response.headers.set(name, value);
      }
    },
  };
}

export function copyResponseCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}
```

- [ ] **Step 4: Implement the request proxy**

```ts
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { createStandaloneHtmlResponse } from "@/lib/posts/standalone-html";
import { copyResponseCookies, createProxyCookieAdapter } from "@/lib/supabase/proxy";

type VisiblePost = { content_format: string; content_html: string | null };
type VisiblePostLoader = (
  request: NextRequest,
  response: NextResponse,
  slug: string,
) => Promise<VisiblePost | null>;

async function loadVisiblePost(
  request: NextRequest,
  response: NextResponse,
  slug: string,
): Promise<VisiblePost | null> {
  const env = getPublicEnv();
  if (!env.configured) return null;

  const supabase = createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: createProxyCookieAdapter(request, response),
  });
  await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("posts")
    .select("content_format,content_html")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  return error ? null : data;
}

export async function resolvePostRequest(
  request: NextRequest,
  loader: VisiblePostLoader = loadVisiblePost,
) {
  const continuation = NextResponse.next();
  const slug = request.nextUrl.pathname.slice("/posts/".length);
  if (!slug || slug.includes("/")) return continuation;

  const post = await loader(request, continuation, slug);
  if (post?.content_format !== "html" || !post.content_html) return continuation;

  const standalone = createStandaloneHtmlResponse(post.content_html);
  copyResponseCookies(continuation, standalone);
  return standalone;
}

export async function proxy(request: NextRequest) {
  return resolvePostRequest(request);
}

export const config = { matcher: ["/posts/:slug"] };
```

- [ ] **Step 5: Run routing tests and verify GREEN**

Run: `npm test -- tests/proxy.test.ts tests/standalone-html.test.ts`

Expected: 4 tests pass.

- [ ] **Step 6: Commit the proxy**

```bash
git add proxy.ts lib/supabase/proxy.ts tests/proxy.test.ts
git commit -m "feat: serve HTML posts as top-level documents"
```

### Task 3: Regression and production build verification

**Files:**
- Verify: all tracked source and test files

- [ ] **Step 1: Run the full quality gate**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev
npm run supabase:readiness
```

Expected: all commands exit 0; 104 or more tests pass; production dependencies report zero vulnerabilities; launch readiness is `ready`.

- [ ] **Step 2: Verify the scoped diff**

Run:

```bash
git diff --check
git status --short --branch
git log -3 --oneline
```

Expected: no whitespace errors; only the approved branch commits are ahead of `main`.

### Task 4: Production deployment and canonical URL verification

**Files:**
- Operational: `.vercel/project.json`, `.vercel/output/` (ignored)

- [ ] **Step 1: Prepare a real Vercel project directory**

Run:

```bash
mkdir -p .vercel
cp /Users/glaucon/.openclaw/workspace/plato/projects/glaucon-politeia/.vercel/project.json .vercel/project.json
```

Expected: `.vercel` is a real directory, not a symlink.

- [ ] **Step 2: Build and deploy production**

Run:

```bash
npx vercel@latest build --prod
npx vercel@latest deploy --prebuilt --prod --yes
```

Expected: deployment reaches `READY` and aliases `https://402v.com`.

- [ ] **Step 3: Verify exact top-level HTML**

Run:

```bash
node --input-type=module -e '
  import fs from "node:fs";
  import crypto from "node:crypto";
  import { createClient } from "@supabase/supabase-js";
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['\"]|['\"]$/g, "");
  }
  const response = await fetch("https://402v.com/posts/orchestration-system-design", { cache: "no-store" });
  const body = await response.text();
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("posts").select("content_html").eq("slug", "orchestration-system-design").single();
  if (error) throw error;
  const forbidden = ["artifact-preview", "html-artifact-frame", "publication-page"];
  if (response.status !== 200) throw new Error(`status ${response.status}`);
  if (!/^<!doctype html>/i.test(body)) throw new Error("response is not a top-level HTML document");
  if (response.headers.get("content-type") !== "text/html; charset=utf-8") throw new Error("wrong content type");
  if (forbidden.some((marker) => body.includes(marker))) throw new Error("402v shell marker found");
  const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
  if (sha(body) !== sha(data.content_html)) throw new Error("stored and served HTML differ");
  console.log(JSON.stringify({ status: response.status, sha256: sha(body), exactMatch: true }));
'
```

Expected checks:

```text
HTTP status = 200
Content-Type = text/html; charset=utf-8
Response starts with <!doctype html>
Response contains no artifact-preview, html-artifact-frame, or 402v shell markers
Response SHA-256 equals the Supabase content_html SHA-256
```

- [ ] **Step 4: Verify Markdown fallthrough**

Request one known published Markdown URL and confirm it returns HTTP 200 with the 402v article shell.

- [ ] **Step 5: Fast-forward and push main**

```bash
git -C /Users/glaucon/.openclaw/workspace/plato/projects/glaucon-politeia fetch origin main
git -C /Users/glaucon/.openclaw/workspace/plato/projects/glaucon-politeia merge --ff-only feature/standalone-html-artifacts
git -C /Users/glaucon/.openclaw/workspace/plato/projects/glaucon-politeia push origin main
```

Expected: local `main`, `origin/main`, and the deployed commit match; unrelated primary-worktree changes remain unstaged and uncommitted.

### Task 5: Reusable publishing skill

**Files:**
- Skill Workshop proposal only; do not edit live skill files directly

- [ ] **Step 1: Establish the baseline failure**

Give a clean evaluator this scenario without the proposed skill: publish a complete HTML artifact to 402v while preserving its full viewport and public/private behavior. Record whether it chooses the nested `/posts` iframe path or omits production/hash verification.

- [ ] **Step 2: Create the `402v-html-publisher` proposal**

Use Skill Workshop `action=create` with a concise procedure covering:

```text
Trigger: publishing or updating complete HTML artifacts on 402v.com.
Canonical repo: projects/glaucon-politeia.
Standalone rule: HTML owns the full viewport; never nest it in the 402v shell or iframe.
Visibility: default private unless the user requests anonymous sharing; explicit public links must return 200 logged out.
Verification: dry-run, exact source/stored hash, clean external worktree, tests/lint/typecheck/build, Vercel READY + 402v alias, canonical URL raw HTML smoke, push main.
Safety: preserve unrelated changes; real .vercel directory; RLS remains the access boundary.
```

- [ ] **Step 3: Apply the explicitly requested skill proposal**

Use Skill Workshop `action=apply` on the created proposal. The user's request to update the skill is explicit lifecycle authorization.

- [ ] **Step 4: Verify the applied skill**

Inspect the applied proposal/skill and rerun the publishing scenario with the new procedure available. Confirm it selects top-level HTML, preserves visibility, and requires production/hash verification.
