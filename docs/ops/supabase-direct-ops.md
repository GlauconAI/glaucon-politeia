# Supabase Direct Ops

These commands use `SUPABASE_DB_URL` from `.env.local` to run database operations directly from the local project.

## Commands

Check remote objects:

```bash
npm run supabase:status
```

Apply currently known missing migrations:

```bash
npm run supabase:apply-missing
```

Check launch readiness:

```bash
npm run supabase:readiness
```

Promote a signed-in user to site admin:

```bash
npm run supabase:make-admin -- --email owner@example.com
```

The user must exist in `auth.users`; log in once before running the admin command.

## Required Environment

`.env.local` must contain:

```bash
SUPABASE_DB_URL=
```

Use the Supabase Dashboard database connection string and replace the password placeholder before running these commands.
