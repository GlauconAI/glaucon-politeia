import { getPublicEnv } from "@/lib/env";
import { PostCard } from "@/components/posts/PostCard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function Home() {
  const env = getPublicEnv();
  const supabase = env.configured ? await createSupabaseServerClient() : null;
  const { data: posts } = supabase
    ? await supabase
        .from("posts")
        .select(
          "slug,title,excerpt,published_at,profiles(username,display_name),post_tags(tags(slug,name)),post_engagement_counts(like_count,bookmark_count,comment_count)",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(10)
    : { data: [] };

  return (
    <section className="home-stack">
      <div className="intro-panel">
        <p className="eyebrow">Vibe First, Code Later</p>
        <h1>Glaucon Politeia</h1>
        <p>
          A personal publishing site for AI coding notes, project retrospectives,
          and experiments. The core shell is ready for authentication, profiles,
          posts, comments, likes, and bookmarks.
        </p>
        <div className="intro-actions">
          <a href="/lab/world" className="button-primary">
            查看互动实验模块
          </a>
          <a href="/editor" className="button-secondary">
            开始写作
          </a>
        </div>
      </div>

      <div className="status-panel">
        <h2>Supabase configuration</h2>
        {env.configured ? (
          <p className="success-text">
            Public Supabase environment variables are configured.
          </p>
        ) : (
          <p className="warning-text">
            Missing public environment variables: {env.missing.join(", ")}. Copy
            .env.example to .env.local and add your Supabase project URL and
            publishable key before connecting Supabase.
          </p>
        )}
      </div>

      <section className="feed-section">
        <h2>最新文章</h2>
        {posts?.length ? (
          <div className="post-list">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p className="empty-text">暂无文章，可以从写作发布第一篇。</p>
        )}
      </section>
    </section>
  );
}
