# Vercel Deployment

Use Vercel for preview and production deployments.

## Required Production Environment Variables

Set these in Vercel Project Settings -> Environment Variables for Production and Preview:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
PROMPTS_RETENTION_SECRET=
PROMPTS_DEV_ACCESS_HELP=
```

Do not add `SUPABASE_DB_URL` to Vercel. It is for local operator scripts only.

## First Deployment

Link the local repo to a Vercel project:

```bash
npm run vercel:link
```

Pull Vercel environment variables if you want local `.env.local` to mirror Vercel:

```bash
npm run vercel:env:pull
```

Build with Vercel's build environment:

```bash
npm run vercel:build
```

Deploy the prebuilt output:

```bash
npm run vercel:deploy
```

## Supabase Auth URLs

In Supabase Auth settings, add:

```text
https://YOUR_VERCEL_DOMAIN/auth/callback
```

Keep the local callback too:

```text
http://localhost:3000/auth/callback
```

## Launch Gate

Before production deployment:

```bash
npm run supabase:readiness
npm test
npm run lint
npm run typecheck
npm run build
```

`supabase:readiness` should report `Launch readiness: ready`. If it warns about the admin user, sign in once and run:

```bash
npm run supabase:make-admin -- --email owner@example.com
```
