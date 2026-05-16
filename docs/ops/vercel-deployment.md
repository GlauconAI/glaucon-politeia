# Vercel Deployment

Use Vercel for preview and production deployments.

## Current Production

Production alias:

```text
https://402v.com
```

The previous Vercel-generated production URL remains available:

```text
https://glaucon-politeia.vercel.app
```

Custom domain routing:

```text
402v.com      -> Vercel project glaucon-politeia
www.402v.com  -> 301 redirect to https://402v.com/
```

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

The current production project has the required Production variables configured. Preview variables may require a branch target when using Vercel CLI in non-interactive mode.

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

Supabase Auth URL configuration is versioned in `supabase/config.toml`.

Current Site URL:

```text
https://402v.com
```

Current redirect allow list:

```text
https://402v.com/auth/callback
https://www.402v.com/auth/callback
https://glaucon-politeia.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

Push Auth URL configuration after `supabase login`:

```bash
npx supabase link --project-ref fiicazfhjkviqaaaiksp
npx supabase config push --project-ref fiicazfhjkviqaaaiksp
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
