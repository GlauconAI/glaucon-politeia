create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null,
  bio text not null default '',
  avatar_url text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_admin = true
  );
$$;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text not null default '',
  content_md text not null,
  status text not null check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_published_at_matches_status check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  )
);

create index posts_author_id_idx on public.posts(author_id);
create index posts_published_at_desc_idx on public.posts(published_at desc);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.post_tags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, tag_id)
);

create index post_tags_post_id_idx on public.post_tags(post_id);
create index post_tags_tag_id_idx on public.post_tags(tag_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(user_id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content_md text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_content_not_blank check (length(btrim(content_md)) > 0)
);

create index comments_post_created_idx on public.comments(post_id, created_at asc);
create index comments_parent_id_idx on public.comments(parent_id);

create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  type text not null default 'like' check (type in ('like')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, type)
);

create index post_reactions_post_id_idx on public.post_reactions(post_id);
create index post_reactions_user_id_idx on public.post_reactions(user_id);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index bookmarks_post_id_idx on public.bookmarks(post_id);
create index bookmarks_user_created_idx on public.bookmarks(user_id, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create or replace function public.prevent_profile_admin_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.is_admin = true and not public.is_current_user_admin() then
    raise exception 'Only admins can create admin profiles';
  end if;

  if tg_op = 'UPDATE'
    and new.is_admin is distinct from old.is_admin
    and not public.is_current_user_admin()
  then
    raise exception 'Only admins can change profile admin status';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_admin_escalation
before insert or update on public.profiles
for each row execute function public.prevent_profile_admin_escalation();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;
alter table public.comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.bookmarks enable row level security;

create policy profiles_select_public
on public.profiles for select
using (true);

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (user_id = auth.uid());

create policy profiles_update_own_or_admin
on public.profiles for update
to authenticated
using (user_id = auth.uid() or public.is_current_user_admin())
with check (user_id = auth.uid() or public.is_current_user_admin());

create policy posts_select_public_owner_or_admin
on public.posts for select
using (
  status = 'published'
  or author_id = auth.uid()
  or public.is_current_user_admin()
);

create policy posts_insert_own
on public.posts for insert
to authenticated
with check (author_id = auth.uid());

create policy posts_update_own_or_admin
on public.posts for update
to authenticated
using (author_id = auth.uid() or public.is_current_user_admin())
with check (author_id = auth.uid() or public.is_current_user_admin());

create policy posts_delete_own_or_admin
on public.posts for delete
to authenticated
using (author_id = auth.uid() or public.is_current_user_admin());

create policy tags_select_public
on public.tags for select
using (true);

create policy tags_insert_admin
on public.tags for insert
to authenticated
with check (public.is_current_user_admin());

create policy tags_update_admin
on public.tags for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

create policy tags_delete_admin
on public.tags for delete
to authenticated
using (public.is_current_user_admin());

create policy post_tags_select_readable_posts
on public.post_tags for select
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_tags.post_id
      and (
        posts.status = 'published'
        or posts.author_id = auth.uid()
        or public.is_current_user_admin()
      )
  )
);

create policy post_tags_insert_post_author_or_admin
on public.post_tags for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts
    where posts.id = post_tags.post_id
      and (posts.author_id = auth.uid() or public.is_current_user_admin())
  )
);

create policy post_tags_delete_post_author_or_admin
on public.post_tags for delete
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_tags.post_id
      and (posts.author_id = auth.uid() or public.is_current_user_admin())
  )
);

create policy comments_select_on_readable_posts
on public.comments for select
using (
  exists (
    select 1
    from public.posts
    where posts.id = comments.post_id
      and (
        posts.status = 'published'
        or posts.author_id = auth.uid()
        or public.is_current_user_admin()
      )
  )
);

create policy comments_insert_own_on_published_posts
on public.comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.posts
    where posts.id = comments.post_id
      and posts.status = 'published'
  )
);

create policy comments_update_own_or_admin
on public.comments for update
to authenticated
using (author_id = auth.uid() or public.is_current_user_admin())
with check (author_id = auth.uid() or public.is_current_user_admin());

create policy comments_delete_own_or_admin
on public.comments for delete
to authenticated
using (author_id = auth.uid() or public.is_current_user_admin());

create policy post_reactions_select_public
on public.post_reactions for select
using (true);

create policy post_reactions_insert_own_on_published_posts
on public.post_reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts
    where posts.id = post_reactions.post_id
      and posts.status = 'published'
  )
);

create policy post_reactions_delete_own_or_admin
on public.post_reactions for delete
to authenticated
using (user_id = auth.uid() or public.is_current_user_admin());

create policy bookmarks_select_own_or_admin
on public.bookmarks for select
to authenticated
using (user_id = auth.uid() or public.is_current_user_admin());

create policy bookmarks_insert_own_on_published_posts
on public.bookmarks for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts
    where posts.id = bookmarks.post_id
      and posts.status = 'published'
  )
);

create policy bookmarks_delete_own_or_admin
on public.bookmarks for delete
to authenticated
using (user_id = auth.uid() or public.is_current_user_admin());

create view public.post_engagement_counts as
select
  posts.id as post_id,
  count(distinct post_reactions.id) filter (where post_reactions.type = 'like')::integer as like_count,
  count(distinct bookmarks.id)::integer as bookmark_count,
  count(distinct comments.id)::integer as comment_count
from public.posts
left join public.post_reactions on post_reactions.post_id = posts.id
left join public.bookmarks on bookmarks.post_id = posts.id
left join public.comments on comments.post_id = posts.id
where posts.status = 'published'
group by posts.id;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.posts to anon, authenticated;
grant select on public.tags to anon, authenticated;
grant select on public.post_tags to anon, authenticated;
grant select on public.comments to anon, authenticated;
grant select on public.post_reactions to anon, authenticated;
grant select on public.post_engagement_counts to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, delete on public.post_tags to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, delete on public.post_reactions to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
