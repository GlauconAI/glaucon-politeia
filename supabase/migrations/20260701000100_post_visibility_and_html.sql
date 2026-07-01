alter table public.posts
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column if not exists content_format text not null default 'markdown'
    check (content_format in ('markdown', 'html')),
  add column if not exists content_html text not null default '';

alter table public.posts
  drop constraint if exists posts_html_content_required;

alter table public.posts
  add constraint posts_html_content_required check (
    (content_format = 'markdown' and length(btrim(content_md)) > 0)
    or (content_format = 'html' and length(btrim(content_html)) > 0)
  );

create index if not exists posts_visibility_status_published_idx
on public.posts(visibility, status, published_at desc);

create or replace function public.can_read_post(post_row public.posts)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    post_row.author_id = auth.uid()
    or public.is_current_user_admin()
    or (
      post_row.status = 'published'
      and (
        post_row.visibility = 'public'
        or (
          post_row.visibility = 'private'
          and auth.uid() is not null
        )
      )
    );
$$;

drop policy if exists posts_select_public_owner_or_admin on public.posts;
drop policy if exists posts_select_readable on public.posts;

create policy posts_select_readable
on public.posts for select
using (public.can_read_post(posts));

drop policy if exists post_tags_select_readable_posts on public.post_tags;

create policy post_tags_select_readable_posts
on public.post_tags for select
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_tags.post_id
      and public.can_read_post(p)
  )
);

drop policy if exists comments_select_on_readable_posts on public.comments;
drop policy if exists comments_select_readable_posts on public.comments;

create policy comments_select_readable_posts
on public.comments for select
using (
  exists (
    select 1
    from public.posts p
    where p.id = comments.post_id
      and public.can_read_post(p)
  )
);

drop policy if exists post_reactions_select_public on public.post_reactions;
drop policy if exists post_reactions_select_readable_posts on public.post_reactions;

create policy post_reactions_select_readable_posts
on public.post_reactions for select
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_reactions.post_id
      and public.can_read_post(p)
  )
);

drop policy if exists comments_insert_own_on_published_posts on public.comments;

create policy comments_insert_own_on_published_posts
on public.comments for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = comments.post_id
      and p.status = 'published'
      and public.can_read_post(p)
  )
);

drop policy if exists post_reactions_insert_own_on_published_posts on public.post_reactions;

create policy post_reactions_insert_own_on_published_posts
on public.post_reactions for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = post_reactions.post_id
      and p.status = 'published'
      and public.can_read_post(p)
  )
);

drop policy if exists bookmarks_insert_own_on_published_posts on public.bookmarks;

create policy bookmarks_insert_own_on_published_posts
on public.bookmarks for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.posts p
    where p.id = bookmarks.post_id
      and p.status = 'published'
      and public.can_read_post(p)
  )
);

create or replace view public.post_engagement_counts as
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
  and posts.visibility = 'public'
group by posts.id;
