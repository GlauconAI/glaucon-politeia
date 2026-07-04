import { getPublicEnv } from "@/lib/env";
import { PostCard } from "@/components/posts/PostCard";
import { collectionRoutes } from "@/lib/posts/collections";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const collectionStyles = new Map([
  ["Learn", "collection-card-large"],
  ["Sites", "collection-card-tall"],
  ["Products", "collection-card-wide"],
]);

const commands = [
  { href: "/search", keys: "Cmd K", label: "Search 402v", detail: "Find notes, artifacts, tags, and people." },
  { href: "/", keys: "G H", label: "Go Home", detail: "Return to the command center from anywhere." },
  { href: "/sites", keys: "G S", label: "Open latest HTML artifact", detail: "Browse published standalone pages." },
  { href: "/learn", keys: "G L", label: "Jump to Learn", detail: "AI, coding, reading trails, and research notes." },
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
      <div className="shell-hero">
        <div className="shell-hero-copy">
          <p className="eyebrow">Personal publishing command center</p>
          <h1>
            <span>402v</span> ~/publishing-system
          </h1>
          <p>
            &gt; open notes, sites, fragments, and family archives
          </p>
          <div className="shell-status-line" aria-label="Shell status">
            <span>status: online</span>
            <span>mode: public/private</span>
            <span>runtime: publishing</span>
          </div>
        </div>
        <div className="command-panel" aria-label="402v command palette">
          <form className="command-search" action="/search">
            <span>&gt;</span>
            <input
              aria-label="Search 402v"
              name="q"
              placeholder="Search 402v"
              type="search"
            />
          </form>
          <div className="command-list">
            {commands.map((command) => (
              <a key={command.label} href={command.href} className="command-row">
                <span className="command-keys">{command.keys}</span>
                <span>
                  <strong>{command.label}</strong>
                  <small>{command.detail}</small>
                </span>
              </a>
            ))}
          </div>
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

      <section className="earth-home-feature" aria-label="Earth Revolution feature">
        <div className="earth-home-copy">
          <p className="eyebrow">Novel project</p>
          <h2>地球革命</h2>
          <p>
            一部关于未来地球如何在星际殖民压力下，从
            <strong>半殖民地半封建星球</strong>
            生成共同身份的科幻小说。
          </p>
          <a className="button-primary" href="/earth-revolution">
            Open Earth Revolution
          </a>
        </div>
        <div className="earth-home-meta" aria-label="Earth Revolution project signals">
          <span>泽鲁 / Lurra 文明</span>
          <span>信息殖民</span>
          <span>月球谋杀案</span>
          <span>地球人共同身份</span>
        </div>
      </section>

      <section className="collections-section">
        <div className="section-heading">
          <p className="eyebrow">Mounted paths</p>
          <h2>Mounted collections</h2>
        </div>
        <div className="collection-board">
          {collectionRoutes.map((collection) => (
            <a
              key={collection.label}
              href={collection.href}
              className={archiveCardClass(collectionStyles.get(collection.label) ?? "")}
            >
              <span>{collection.meta}</span>
              <strong>{collection.command}</strong>
              <p>{collection.description}</p>
              <small>{collection.label}</small>
            </a>
          ))}
        </div>
      </section>

      <section className="feed-section archive-feed">
        <div className="section-heading section-heading-row">
          <div>
            <p className="eyebrow">Published stream</p>
            <h2>Recent outputs</h2>
          </div>
          <a href="/search" className="text-link">
            run full archive
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
