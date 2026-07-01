import { getPublicEnv } from "@/lib/env";
import { PostCard } from "@/components/posts/PostCard";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const spaces = [
  {
    href: "/tags/vibe-coding",
    name: "Learn",
    detail: "AI coding notes, research trails, and study logs.",
    meta: "Notes",
  },
  {
    href: "/search?q=essay",
    name: "Notes",
    detail: "Essays, fragments, personal observations, and working thoughts.",
    meta: "Writing",
  },
  {
    href: "/search?q=html",
    name: "Sites",
    detail: "Published HTML artifacts, reports, itineraries, and mini-sites.",
    meta: "HTML",
  },
  {
    href: "/search?q=family",
    name: "Family",
    detail: "Family references, plans, trips, and private household pages.",
    meta: "Home",
  },
  {
    href: "/tags/projects",
    name: "Products",
    detail: "Product experiments, company work, and long-running builds.",
    meta: "Builds",
  },
  {
    href: "/search",
    name: "Archive",
    detail: "Everything published, searchable, and ready to resurface.",
    meta: "Index",
  },
];

export default async function Home() {
  const env = getPublicEnv();
  const supabase = env.configured ? await createSupabaseServerClient() : null;
  const { data: postRows } = supabase
    ? await supabase
        .from("posts")
        .select(
          "id,slug,title,excerpt,published_at,visibility,content_format,profiles(username,display_name),post_tags(tags(slug,name))",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(10)
    : { data: [] };
  const posts: any[] =
    supabase && postRows?.length
      ? await attachPostEngagementCounts(supabase, postRows as any)
      : ((postRows ?? []) as any[]);

  return (
    <section className="home-stack">
      <div className="intro-panel intro-panel-os">
        <div className="intro-copy">
          <p className="eyebrow">Calm personal OS for publishing</p>
          <h1>402v</h1>
          <p>
            A quiet web surface for learning notes, essays, HTML sites, family
            references, and future products. Public when it should travel;
            private when it should stay close.
          </p>
          <div className="intro-actions">
            <a href="/search?q=html" className="button-primary">
              Browse Sites
            </a>
            <a href="/editor" className="button-secondary">
              Publish
            </a>
          </div>
        </div>
        <div className="system-card" aria-label="Publishing system status">
          <span>public / private</span>
          <strong>HTML artifacts are live</strong>
          <p>Markdown notes and sandboxed HTML pages now share one publishing flow.</p>
        </div>
      </div>

      {!env.configured ? (
        <div className="status-panel">
          <h2>Supabase configuration</h2>
          <p className="warning-text">
            Missing public environment variables: {env.missing.join(", ")}. Copy
            .env.example to .env.local and add your Supabase project URL and
            publishable key before connecting Supabase.
          </p>
        </div>
      ) : null}

      <section className="spaces-section">
        <div className="section-heading">
          <p className="eyebrow">Information architecture</p>
          <h2>Spaces</h2>
        </div>
        <div className="space-grid">
          {spaces.map((space) => (
            <a key={space.name} href={space.href} className="space-card">
              <span>{space.meta}</span>
              <strong>{space.name}</strong>
              <p>{space.detail}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="feed-section">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Recent output</p>
            <h2>Latest publishing</h2>
          </div>
          <a href="/search" className="text-link">
            View archive
          </a>
        </div>
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
