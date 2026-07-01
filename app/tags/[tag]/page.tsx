import { notFound } from "next/navigation";

import { PostCard } from "@/components/posts/PostCard";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TagPageProps = {
  params: Promise<{ tag: string }>;
};

export default async function TagPage({ params }: TagPageProps) {
  const { tag } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: tagRecord } = await supabase
    .from("tags")
    .select("id, slug, name, description")
    .eq("slug", tag)
    .maybeSingle();

  if (!tagRecord) {
    notFound();
  }

  const { data: rows } = await supabase
    .from("post_tags")
    .select(
      "posts(id,slug,title,excerpt,published_at,profiles(username,display_name),post_tags(tags(slug,name)))",
    )
    .eq("tag_id", tagRecord.id)
    .eq("posts.status", "published");

  const postRows =
    rows
      ?.map((row) => (Array.isArray(row.posts) ? row.posts[0] : row.posts))
      .filter(Boolean) ?? [];
  const posts: any[] = postRows.length
    ? await attachPostEngagementCounts(supabase, postRows as any)
    : [];

  return (
    <section className="feed-section">
      <p className="eyebrow">Tag</p>
      <h1>{tagRecord.name}</h1>
      <p>{tagRecord.description}</p>
      {posts.length ? (
        <div className="post-list">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : (
        <p className="empty-text">这个标签下暂无文章。</p>
      )}
    </section>
  );
}
