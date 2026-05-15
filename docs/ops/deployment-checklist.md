# Deployment Checklist

## Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `PROMPTS_RETENTION_SECRET`
- `PROMPTS_DEV_ACCESS_HELP` only for development

## Supabase

- P0 schema migration applied.
- Avatar storage migration applied.
- Seed tags inserted.
- RLS enabled on all P0 tables.
- Public bookmark detail access is not granted.

## Verification

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev`
- Manual anonymous browsing of home, tags, search, and post detail.
- Manual authenticated publish, comment, like, bookmark, and profile edit.
