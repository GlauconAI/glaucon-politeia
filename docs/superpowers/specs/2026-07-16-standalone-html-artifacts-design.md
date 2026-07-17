# Standalone HTML Artifacts Design

## Goal

HTML posts must render as complete top-level documents that own the browser viewport. The canonical URL remains `/posts/<slug>`, but HTML artifacts must not inherit the 402v app shell, article header, comments, margins, or iframe preview UI.

Markdown posts continue to use the existing 402v article page unchanged.

## Current Failure

`PostBody` routes HTML content through `HtmlArtifactView`, which adds an artifact toolbar and renders the document with `iframe srcDoc`. That places the source HTML inside the 402v root layout, article layout, preview wrapper, and iframe. The nesting reduces the usable canvas and prevents the artifact from behaving like the complete page it was designed to be.

## Approaches Considered

### 1. Full-screen iframe

Keep `srcDoc` but position the iframe over the app shell. This preserves sandboxing but remains a nested page and contradicts the explicit requirement.

### 2. Separate `/sites/<slug>` route

Serve raw HTML from a Route Handler and change the public URL. This is technically simple, but breaks the approved canonical `/posts/<slug>` URL and creates two link conventions.

### 3. Request interception for HTML posts — selected

Add a Next.js `proxy.ts` matcher for `/posts/:slug`. The proxy reads the post through Supabase using the request's auth cookies. When the record is a published HTML post visible to that requester, it returns `content_html` directly as a `text/html` response. Markdown and non-visible posts continue to the existing App Router page.

This preserves one canonical URL, makes the artifact the top-level document, and avoids modifying the currently in-progress post-page engagement work.

## Request Flow

1. Browser requests `/posts/<slug>`.
2. The proxy creates a request-scoped Supabase client from the publishable key and request cookies.
3. The proxy queries the post by slug through RLS.
4. If the visible record is `published + html`, return its exact `content_html` as the response body.
5. If the record is Markdown or not visible, continue to the existing Next.js post page.
6. The existing page remains responsible for Markdown rendering and its current 404 behavior.

No HTML rewriting, wrapping, toolbar injection, or body extraction occurs.

## Visibility

- `published + public`: available as standalone HTML to anonymous and authenticated visitors.
- `published + private`: available only when the request carries a valid authenticated Supabase session.
- `draft`, missing, or unauthorized: the proxy does not expose content; the existing page resolves the request and returns its normal not-found behavior.

The service-role key is not used for artifact reads. RLS remains the authorization boundary.

## Response Safety

The standalone response sets:

- `Content-Type: text/html; charset=utf-8`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cache-Control: private, no-store` for the first version, preventing a private response from being shared through an intermediary cache
- a CSP sandbox that permits the artifact's presentation and scripts but omits `allow-same-origin`, so artifact JavaScript cannot read 402v cookies or same-origin storage

The CSP permits inline styles, inline scripts, images, fonts, HTTPS resources, forms, and popups because generated standalone artifacts may use them. Same-origin privilege remains unavailable.

## Compatibility

- Existing canonical links remain valid.
- Markdown posts are unaffected.
- The Supabase post record remains the source of truth.
- The publishing CLI continues to store complete HTML without transformation.
- HTML cards and search results can keep linking to `/posts/<slug>`.
- The current iframe components remain temporarily for editor/legacy use but are no longer reached by canonical HTML post navigation.

## Observability Boundary

The standalone page intentionally contains no 402v interaction UI. Likes, comments, bookmarks, and navigation chrome are excluded because they would reintroduce nesting. View counting is not added in this change; it can be handled later at the request layer after the existing anonymous-engagement work is integrated.

## Testing

Automated tests must prove:

1. A visible published HTML post returns the exact source HTML with `text/html` and security headers.
2. A Markdown post falls through to the existing page.
3. A missing or unauthorized post falls through without exposing HTML.
4. Request cookies are passed to the Supabase client so private visibility remains RLS-controlled.
5. Existing post-body and Markdown tests continue to pass.

Production verification must prove:

1. `https://402v.com/posts/orchestration-system-design` returns HTTP 200 anonymously.
2. The response begins with the source document and contains no 402v shell markers or iframe markup.
3. The returned body hash matches the stored HTML hash.
4. A known Markdown post still renders through the normal 402v article shell.

## Scope

This change only introduces top-level delivery for existing HTML posts. It does not redesign the source HTML, add navigation inside artifacts, migrate Markdown posts, or merge the unrelated anonymous-engagement work already present in the primary worktree.
