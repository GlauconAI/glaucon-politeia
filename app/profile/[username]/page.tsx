import { notFound } from "next/navigation";

import { updateProfileAction, uploadAvatarAction } from "@/app/profile/actions";
import { getProfilePostVisibilityFilter } from "@/lib/profiles/domain";
import { getProfileByUsername } from "@/lib/profiles/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProfilePageProps = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function ProfilePage({
  params,
  searchParams,
}: ProfilePageProps) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const [{ data: userResult }, profile] = await Promise.all([
    supabase.auth.getUser(),
    getProfileByUsername(supabase, username),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwner = userResult.user?.id === profile.user_id;
  const visibility = getProfilePostVisibilityFilter({ isOwner });
  const postsQuery = supabase
    .from("posts")
    .select("id, slug, title, excerpt, status, published_at, created_at")
    .eq("author_id", profile.user_id)
    .order("created_at", { ascending: false });

  if (!visibility.includeDrafts) {
    postsQuery.eq("status", visibility.status);
  }

  const { data: posts } = await postsQuery;
  const { data: bookmarks } = isOwner
    ? await supabase
        .from("bookmarks")
        .select("created_at, posts(id, slug, title, excerpt, status)")
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <section className="profile-page">
      <div className="profile-header">
        <div className="avatar">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" />
          ) : (
            <span>{profile.display_name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div>
          <p className="eyebrow">@{profile.username}</p>
          <h1>{profile.display_name}</h1>
          <p>{profile.bio || "这个人还没有写简介。"}</p>
          {query.saved ? <p className="success-text">已保存</p> : null}
          {query.error ? <p className="form-error">{query.error}</p> : null}
        </div>
      </div>

      {isOwner ? (
        <section className="profile-editor">
          <h2>编辑资料</h2>
          <form action={updateProfileAction} className="auth-form">
            <label>
              昵称
              <input
                type="text"
                name="display_name"
                defaultValue={profile.display_name}
                required
              />
            </label>
            <label>
              简介
              <input type="text" name="bio" defaultValue={profile.bio} />
            </label>
            <button type="submit" className="button-primary">
              保存资料
            </button>
          </form>
          <form action={uploadAvatarAction} className="auth-form">
            <label>
              头像
              <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" />
            </label>
            <button type="submit" className="button-secondary">
              上传头像
            </button>
          </form>
        </section>
      ) : null}

      <section className="profile-section">
        <h2>{isOwner ? "我的文章" : "文章"}</h2>
        {posts?.length ? (
          <ul className="content-list">
            {posts.map((post) => (
              <li key={post.id}>
                <a href={`/posts/${post.slug}`}>{post.title}</a>
                {isOwner ? <span>{post.status}</span> : null}
                <p>{post.excerpt}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-text">暂无文章。</p>
        )}
      </section>

      {isOwner ? (
        <section className="profile-section">
          <h2>我的收藏</h2>
          {bookmarks?.length ? (
            <ul className="content-list">
              {bookmarks.map((bookmark) => (
                <li key={bookmark.created_at}>
                  <span>{bookmark.created_at}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">暂无收藏。</p>
          )}
        </section>
      ) : null}
    </section>
  );
}
