-- Supabase removes implicit grants on NEW public tables on 2026-10-30.
-- Keep applied migrations immutable; make legacy API dependencies explicit
-- for new projects, preview branches and full migration replays.
-- Existing production tables keep their grants. This migration does not
-- revoke existing access, change RLS, or restore schema-wide default grants.

-- Prompt ingestion uses the requesting user's client. Row visibility and
-- admin-only mutations remain controlled by the existing prompts policies.
-- POST /api/prompts uses INSERT ... RETURNING and duplicate lookup; SELECT
-- must reach RLS too. This grant does not add an anonymous SELECT policy.
grant select, insert on table public.prompts to anon;
grant select, insert, update, delete on table public.prompts to authenticated;

-- Server-only publishing/import clients and prompt administration use the
-- service role. Do not grant direct access to Tracker's RPC-only tables.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.posts to service_role;
grant select, insert, update, delete on table public.tags to service_role;
grant select, insert, update, delete on table public.post_tags to service_role;
grant select, insert, update, delete on table public.prompts to service_role;
