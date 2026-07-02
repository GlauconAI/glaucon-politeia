drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_insert_admin_only on public.posts;

create policy posts_insert_admin_only
on public.posts for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.is_current_user_admin()
);

drop policy if exists posts_update_own_or_admin on public.posts;
drop policy if exists posts_update_admin_only on public.posts;

create policy posts_update_admin_only
on public.posts for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists posts_delete_own_or_admin on public.posts;
drop policy if exists posts_delete_admin_only on public.posts;

create policy posts_delete_admin_only
on public.posts for delete
to authenticated
using (public.is_current_user_admin());

drop policy if exists post_tags_insert_post_author_or_admin on public.post_tags;
drop policy if exists post_tags_insert_admin_only on public.post_tags;

create policy post_tags_insert_admin_only
on public.post_tags for insert
to authenticated
with check (public.is_current_user_admin());

drop policy if exists post_tags_delete_post_author_or_admin on public.post_tags;
drop policy if exists post_tags_delete_admin_only on public.post_tags;

create policy post_tags_delete_admin_only
on public.post_tags for delete
to authenticated
using (public.is_current_user_admin());
