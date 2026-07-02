import Link from "next/link";

type PostCardProps = {
  className?: string;
  collection?: string;
  post: any;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function PostCard({ className = "archive-card", collection, post }: PostCardProps) {
  const author = first<{ username: string; display_name: string }>(post.profiles);
  const counts = first<{
    like_count: number;
    bookmark_count: number;
    comment_count: number;
  }>(post.post_engagement_counts);
  const format = post.content_format === "html" ? "HTML Site" : "Note";
  const visibility = post.visibility === "private" ? "Private" : "Public";

  return (
    <article className={["post-card", className].filter(Boolean).join(" ")}>
      <div className="post-meta">
        <span className="content-pill">{format}</span>
        <span className="content-pill content-pill-muted">{visibility}</span>
        {collection ? <span className="content-pill content-pill-muted">{collection}</span> : null}
        {author ? (
          <Link href={`/profile/${author.username}`}>{author.display_name}</Link>
        ) : (
          <span>匿名</span>
        )}
        {post.published_at ? <span>{new Date(post.published_at).toLocaleDateString()}</span> : null}
      </div>
      <h2>
        <Link href={`/posts/${post.slug}`}>{post.title}</Link>
      </h2>
      <p>{post.excerpt}</p>
      <div className="tag-row">
        {post.post_tags?.map((item: any) =>
          first<{ slug: string; name: string }>(item.tags) ? (
            <Link
              key={first<{ slug: string; name: string }>(item.tags)!.slug}
              href={`/tags/${first<{ slug: string; name: string }>(item.tags)!.slug}`}
            >
              #{first<{ slug: string; name: string }>(item.tags)!.name}
            </Link>
          ) : null,
        )}
      </div>
      <div className="post-stats">
        <span>{counts?.like_count ?? 0} likes</span>
        <span>{counts?.bookmark_count ?? 0} bookmarks</span>
        <span>{counts?.comment_count ?? 0} comments</span>
      </div>
    </article>
  );
}
