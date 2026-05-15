# Architecture

## Starting Point

Use a thin Next.js + Supabase starter rather than continuing from a static blog template or cloning a large SaaS template.

Recommended base:

```bash
npx create-next-app@latest -e with-supabase glaucon-politeia
```

The current repository already exists, so implementation can either initialize the app in place or scaffold in a sibling directory and migrate files back deliberately. The important decision is the architecture: minimal framework foundation, product-specific schema and modules.

## High-Level Structure

```text
app/
  (site)/
    page.tsx
    posts/[slug]/page.tsx
    tags/[tag]/page.tsx
    search/page.tsx
    profile/me/page.tsx
    profile/[username]/page.tsx
    editor/page.tsx
    todos/page.tsx
    lab/world/page.tsx
    admin/prompts/page.tsx
  auth/page.tsx
  auth/callback/route.ts
  api/prompts/route.ts
  api/prompts/bulk/route.ts
  api/prompts/export/route.ts
  api/prompts/stats/route.ts
  api/prompts/retention/route.ts
components/
  layout/
  auth/
  posts/
  comments/
  profile/
  prompts/
  todos/
  lab/
lib/
  supabase/
  auth/
  posts/
  comments/
  profiles/
  prompts/
  todos/
  markdown/
  theme/
supabase/
  migrations/
  seed.sql
tests/
```

Exact paths can adapt to the starter, but these boundaries should remain clear.

## Module Boundaries

### Supabase Access

- `lib/supabase/browser.ts`: browser client.
- `lib/supabase/server.ts`: request-scoped server client.
- `lib/supabase/admin.ts`: service-role client for retention and trusted server tasks only.
- No component should construct Supabase clients directly outside these helpers.

### Domain Helpers

Domain modules own validation and data shaping:

- `lib/posts`: slug generation, excerpt generation, post queries, post mutations.
- `lib/profiles`: profile lookup, auto-create, username generation.
- `lib/comments`: comment tree shaping and mutation helpers.
- `lib/prompts`: validation, sensitive detection, idempotency, queue model, admin filters.
- `lib/todos`: local model, storage parsing, filtering, sorting, export.

### UI Components

Components should be small and feature-owned. For example, post cards live with post UI, not in a generic global folder unless they become genuinely shared primitives.

### Route Handlers

Route handlers should stay thin:

1. Parse request.
2. Authorize.
3. Call domain helper.
4. Return typed response.

Validation and business rules belong in `lib/*`, where they can be tested without a Next.js runtime.

## Rendering Strategy

- Public feed, post detail, tag, search, and profile pages should prefer server rendering for data loading.
- Mutating interactions can use server actions or route handlers where appropriate.
- Client components should be limited to forms, optimistic interactions, theme control, Prompt capture, TODO local-storage state, and 3D canvas.
- Use cache invalidation deliberately after mutations; avoid full `window.location.reload()` except as a temporary fallback.

## Extensibility Rules

- Each independent subsystem gets its own domain module and tests.
- Prompt Capture, TODO, and 3D Lab must not introduce dependencies into the core post/profile modules.
- Admin-only behavior should be isolated behind explicit authorization helpers.
- Privacy-sensitive aggregate data should use views or RPCs where direct table selection would expose private rows.
- New content features should first extend the data model and tests, then UI.

## Key Architectural Decisions

- Dynamic Supabase-backed content instead of local MDX.
- Profile auto-creation as a server-side invariant, not only a UI behavior.
- Bookmark details private; public UI uses counts.
- Prompt capture delayed until after the content product is stable.
- 3D Lab delayed until after baseline UX and data correctness are proven.
