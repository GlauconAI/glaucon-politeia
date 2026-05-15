# Deployment Checklist

## Environment

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `PROMPTS_RETENTION_SECRET`
- `PROMPTS_DEV_ACCESS_HELP`
- Do not configure `SUPABASE_DB_URL` in Vercel production; it is local-only.

## Supabase

- P0 schema migration applied.
- Avatar storage migration applied.
- Seed tags inserted.
- RLS enabled on all P0 tables.
- Public bookmark detail access is not granted.
- Prompt migrations and RPCs are applied.
- At least one admin profile exists.

## Vercel

- Vercel project linked.
- Production and Preview environment variables configured.
- Supabase Auth callback includes production `/auth/callback`.
- `npm run vercel:build` passes before `npm run vercel:deploy`.

## Verification

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev`
- `npm run supabase:readiness`
- Manual anonymous browsing of home, tags, search, and post detail.
- Manual authenticated publish, comment, like, bookmark, and profile edit.
