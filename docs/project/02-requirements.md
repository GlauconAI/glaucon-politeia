# Requirements

## Foundation

- Use Next.js App Router, TypeScript, React, Tailwind CSS, and Supabase.
- Use Supabase SSR-compatible auth helpers for server and browser clients.
- Support environment variables for Supabase URL, publishable key, secret key, Prompt retention secret, and optional development admin help.
- Provide `.env.example` during implementation.
- Configure Vitest and Testing Library early.

## Layout And Navigation

- Fixed top header across the site.
- Desktop layout uses left navigation, main content, and right information panel.
- Mobile layout hides side panels and keeps the main content readable.
- Header includes brand, subtitle, search, write action, theme toggle, and user menu.
- Left navigation includes home, 3D lab, TODO, primary tags, profile, and Prompt admin.
- Right panel includes welcome content and popular tags.

## Theme

- Support light and dark modes.
- Persist theme preference locally.
- Avoid initial theme flash.
- Apply theme styling to layout, cards, forms, buttons, Markdown, tables, and admin UI.

## Authentication

- `/auth` supports email/password login for existing trusted users.
- Public registration and public OAuth entrypoints are disabled for the production owner-publishing model.
- `/auth/callback` remains available for already-configured provider callbacks, but the public auth UI must not advertise OAuth signup.
- `redirectTo` must be preserved through login flows.
- Missing Supabase configuration must produce a clear developer-facing error.
- User logout refreshes authenticated state.

## Profiles

- Automatically create a profile on first login or first `/profile/me` access.
- Generate unique usernames from email prefixes with collision handling.
- Public profile pages show avatar, display name, username, bio, and posts.
- Owners can edit display name, bio, and avatar.
- Avatar upload uses Supabase Storage bucket `avatars`.
- Non-owners must only see published posts.
- Owners can see their own drafts and published posts.
- Owners can view their own bookmarks.

## Posts

- Home page lists published posts, 10 per page, newest first.
- Article cards show title, author, relative publish time, excerpt, tags, like count, and bookmark count.
- `/editor` supports title, up to three existing tags, Markdown content, save draft, and publish.
- `/editor` supports public/private visibility and Markdown/HTML content format selection.
- `/editor` is owner/admin-only and must not be reachable by anonymous or non-admin users.
- `/editor` lists existing posts for maintenance.
- `/editor/[slug]` supports editing title, slug, content, tags, visibility, format, draft/publish state, and deletion.
- Slugs are generated from titles, limited to 64 characters, and collision-safe.
- Excerpts are generated from Markdown content with code and Markdown syntax removed.
- Excerpts for HTML posts are generated from text extracted from HTML content.
- Drafts have `published_at = null`; published posts set `published_at`.
- `/posts/[slug]` renders article details, Markdown, reactions, bookmarks, and comments.
- `/posts/[slug]` renders HTML posts in a sandboxed iframe.
- Published posts support `public` visibility for anonymous readers and `private` visibility for logged-in readers.
- Markdown supports GFM, code highlighting, and dark mode.

## HTML Artifact Publishing

- A local CLI command can publish an existing HTML file into the `posts` table.
- The command accepts `--input`, `--title`, optional `--slug`, `--author-id`, `--visibility public|private`, `--dry-run`, and `--publish`.
- Dry-run mode prints the insert payload without writing to Supabase.
- Publish mode uses trusted local Supabase service-role configuration and must fail clearly when required env vars are missing.
- HTML content is stored separately from Markdown content and rendered only through the sandboxed HTML viewer.
- The upstream `html-artifact-publisher` remains a local generator; Glaucon Politeia is the online publishing target.

## Tags And Search

- Top-level collection pages `/learn`, `/sites`, `/fragments`, `/family`, `/products`, and `/archive` show curated content groups instead of keyword-search aliases.
- `/tags/[tag]` shows tag metadata and published posts for the tag.
- Missing tags return 404.
- `/search?q=...` searches published post title, Markdown content, and HTML content.
- Search supports content-format filters for HTML sites and Markdown notes.
- Search returns up to 30 results.
- Search input must be escaped or parameterized so Supabase `.or()` strings cannot be broken by special characters.

## Comments

- Comments support top-level comments and nested replies.
- Comments render Markdown with GFM and code highlighting.
- Unauthenticated users are redirected to login when posting.
- Authors can delete their own comments.
- Delete operations must filter by both comment id and author id.

## Reactions And Bookmarks

- Unauthenticated like/bookmark actions redirect to login with `redirectTo`.
- Authenticated actions toggle rows in `post_reactions` and `bookmarks`.
- UI should update optimistically and then revalidate.
- Bookmark row visibility must be private to the owner or admin; public pages should use aggregate counts.

## TODO Tool

- `/todos` is a self-contained local-storage tool inside the site.
- Supports create, edit, notes, priority, complete, delete, filters, sorting, JSON export, and CSV export.
- Uses localStorage key `vibe-academy.todos.v1`.
- Does not require authentication or Supabase.

## Prompt Capture

- Global provider captures submitted prompt-like text from forms, textareas, and contenteditable fields.
- Must not capture `/auth`, password forms, or password autocomplete fields.
- Captured content length must be 3 to 20000 characters after trim.
- Uses client session id, SHA-256 idempotency key, retries, and local failure queue.
- Server accepts anonymous and authenticated inserts.
- Sensitive content detection flags likely secrets.

## Prompt Admin

- `/admin/prompts` is available only to logged-in users with `profiles.is_admin = true`.
- Non-admins get 404 in production.
- Admins can filter, paginate, highlight, export CSV, view 24-hour stats, mark, unmark, soft delete, and trigger retention archival.

## 3D Lab

- `/lab/world` is a separate interactive navigation experiment.
- Uses Three.js through React Three Fiber and Drei.
- Supports scroll, hover, click, keyboard activation, active card focus, fallback loading UI, and mobile performance guardrails.

## Non-Functional Requirements

- RLS policies must protect every Supabase table before UI features depend on them.
- Published private content must be protected by database RLS, not only by UI filtering.
- Core helpers must be unit-tested before route integration.
- Avoid inherited SaaS template complexity.
- Avoid route files that mix data access, validation, mutation logic, and presentation beyond a small page boundary.
- Public pages should be resilient to empty data, missing configuration, and network failures.
