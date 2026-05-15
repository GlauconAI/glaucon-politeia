create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(user_id) on delete set null,
  client_session_id text not null,
  source_url text not null,
  ip inet,
  user_agent text,
  content text not null,
  idempotency_key text not null,
  flags jsonb not null default '{}',
  marked boolean not null default false,
  marked_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  content_tsv tsvector generated always as (to_tsvector('simple', coalesce(content, ''))) stored,
  unique (client_session_id, idempotency_key)
);

create index prompts_created_at_desc_idx on public.prompts(created_at desc);
create index prompts_user_created_idx on public.prompts(user_id, created_at desc);
create index prompts_session_created_idx on public.prompts(client_session_id, created_at desc);
create index prompts_source_created_idx on public.prompts(source_url, created_at desc);
create index prompts_content_tsv_idx on public.prompts using gin(content_tsv);

alter table public.prompts enable row level security;

create policy prompts_insert_anyone
on public.prompts for insert
with check (true);

create policy prompts_select_own_or_admin
on public.prompts for select
using (user_id = auth.uid() or public.is_current_user_admin());

create policy prompts_update_admin
on public.prompts for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy prompts_delete_admin
on public.prompts for delete
to authenticated
using (public.is_current_user_admin());
