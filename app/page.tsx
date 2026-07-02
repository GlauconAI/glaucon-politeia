import { getPublicEnv } from "@/lib/env";
import { PostCard } from "@/components/posts/PostCard";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const collections = [
  {
    href: "/tags/vibe-coding",
    name: "Learn",
    detail: "AI coding notes, reading trails, and research fragments.",
    meta: "learning",
    style: "collection-card-large",
  },
  {
    href: "/search?q=html",
    name: "Sites",
    detail: "Published HTML artifacts, reports, itineraries, and tiny standalone pages.",
    meta: "html",
    style: "collection-card-tall",
  },
  {
    href: "/search?q=fragments",
    name: "Fragments",
    detail: "Essays, observations, working thoughts, and unfinished notes.",
    meta: "writing",
    style: "",
  },
  {
    href: "/search?q=family",
    name: "Family",
    detail: "Trip plans, home references, and private family archives.",
    meta: "home",
    style: "",
  },
  {
    href: "/tags/projects",
    name: "Products",
    detail: "Ideas, experiments, product notes, and company-facing work.",
    meta: "building",
    style: "collection-card-wide",
  },
  {
    href: "/search",
    name: "Archive",
    detail: "Everything placed here, searchable and ready to resurface.",
    meta: "index",
    style: "",
  },
];

const surfaces = [
  "public notes",
  "private references",
  "html sites",
  "family pages",
  "product sketches",
  "research trails",
];

function archiveCardClass(style: string) {
  return ["collection-card", style].filter(Boolean).join(" ");
}

function postBoardClass(index: number) {
  const style = index % 5 === 0 ? "post-card-wide" : index % 3 === 0 ? "post-card-tall" : "";
  return ["archive-card", style].filter(Boolean).join(" ");
}

function inferCollection(post: any) {
  if (post.content_format === "html") {
    return "Sites";
  }
  const tagNames = post.post_tags
    ?.map((item: any) => {
      const tag = Array.isArray(item.tags) ? item.tags[0] : item.tags;
      return tag?.name?.toLowerCase() ?? tag?.slug?.toLowerCase() ?? "";
    })
    .filter(Boolean);

  if (tagNames?.some((tag: string) => tag.includes("project"))) {
    return "Products";
  }

  if (tagNames?.some((tag: string) => tag.includes("vibe"))) {
    return "Learn";
  }

  return "Fragments";
}

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
      <div className="archive-hero">
        <div className="archive-hero-copy">
          <p className="eyebrow">Personal knowledge universe</p>
          <h1>402v</h1>
          <p>
            Notes, sites, fragments, and family archives. A personal collection
            surface for what is being learned, built, remembered, and published.
          </p>
          <div className="surface-strip" aria-label="Archive surfaces">
            {surfaces.map((surface) => (
              <span key={surface}>{surface}</span>
            ))}
          </div>
        </div>
        <div className="archive-note" aria-label="Archive note">
          <span>now placed</span>
          <strong>HTML artifacts live beside notes.</strong>
          <p>Public and private pages share the same archive surface.</p>
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

      <section className="collections-section">
        <div className="section-heading">
          <p className="eyebrow">Boards</p>
          <h2>Collections</h2>
        </div>
        <div className="collection-board">
          {collections.map((collection) => (
            <a
              key={collection.name}
              href={collection.href}
              className={archiveCardClass(collection.style)}
            >
              <span>{collection.meta}</span>
              <strong>{collection.name}</strong>
              <p>{collection.detail}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="feed-section archive-feed">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Recent additions</p>
            <h2>Recently placed</h2>
          </div>
          <a href="/search" className="text-link">
            Full archive
          </a>
        </div>
        {posts?.length ? (
          <div className="archive-post-board">
            {posts.map((post, index) => (
              <PostCard
                key={post.slug}
                collection={inferCollection(post)}
                className={postBoardClass(index)}
                post={post}
              />
            ))}
          </div>
        ) : (
          <p className="empty-text">暂无文章，可以从写作发布第一篇。</p>
        )}
      </section>
    </section>
  );
}
