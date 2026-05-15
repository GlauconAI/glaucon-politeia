# Quality And Test Strategy

## Quality Goals

- Data privacy is enforced by Supabase RLS, not just UI checks.
- Core content flows are testable without a browser.
- UI behavior is verified where it carries risk: auth redirects, optimistic interactions, forms, Prompt capture, and localStorage.
- Build and test commands run cleanly before milestone completion.

## Test Layers

### Unit Tests

Required for deterministic helpers:

- Slug generation.
- Excerpt generation.
- Username generation and collision handling.
- Search query escaping.
- TODO model operations.
- TODO storage parsing and corruption fallback.
- TODO filters, sorting, JSON export, CSV export.
- Prompt validation.
- Prompt sensitive detection.
- Prompt idempotency key creation.
- Prompt queue behavior.
- CSV escaping.

### Component Tests

Use Testing Library for:

- Auth form state.
- Editor validation.
- Article card like/bookmark unauthenticated redirect behavior.
- Comment form and reply state.
- Profile edit form.
- TODO page interactions.
- Prompt admin filter and batch selection state.

### API Route Tests

Required for Prompt APIs:

- `POST /api/prompts` success.
- `POST /api/prompts` validation errors.
- Idempotent duplicate response.
- Admin-only access for query, bulk, export, and stats.
- Bulk UUID and operation validation.
- Export CSV escaping.
- Stats fills 24 hourly buckets.
- Retention secret validation.

### Integration And Manual Verification

Supabase-backed flows need integration checks:

- Email login and OAuth callback.
- Profile auto-create.
- Draft visibility owner vs visitor.
- Published post visibility.
- Comment create/delete.
- Reaction and bookmark toggles.
- Bookmark privacy.
- Admin-only Prompt access.
- Avatar upload policy.

## RLS Verification Checklist

For every table introduced:

- Anonymous read behavior is intentional.
- Authenticated user can only mutate their own rows.
- Admin-only access is explicit.
- Service-role operations are server-only.
- Private row data is not exposed through public aggregate features.

## Security Checklist

- Never import service-role client into client code.
- Escape or parameterize search filters.
- Validate request body shape and length on the server.
- Treat `sourceUrl`, `userAgent`, and Prompt content as untrusted strings.
- Soft delete prompts instead of hard deletion in admin UI.
- Do not capture password or auth form content.
- Do not expose bookmark ownership publicly.

## Performance Checklist

- Home feed paginates at 10 posts.
- Search caps results at 30.
- Prompt export caps at 10000 rows.
- Prompt admin page size caps at 100.
- 3D Lab has a loading fallback and mobile guardrails.
- Avoid shipping Three.js code to ordinary content pages.

## Milestone Completion Gate

Each milestone is complete only when:

- Feature acceptance criteria pass.
- Relevant tests are added and passing.
- `npm run lint`, `npm test`, and `npm run build` pass once those scripts exist.
- RLS changes have been manually verified for the milestone's tables.
- Documentation is updated if scope or behavior changed.
