import { PostCard } from "@/components/posts/PostCard";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { normalizeSearchQuery, toSafeIlikePattern } from "@/lib/posts/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = normalizeSearchQuery(q);
  const supabase = await createSupabaseServerClient();
  const { data: postRows } = query
    ? await supabase
        .from("posts")
        .select(
          "id,slug,title,excerpt,published_at,profiles(username,display_name),post_tags(tags(slug,name))",
        )
        .eq("status", "published")
        .or(`title.ilike.${toSafeIlikePattern(query)},content_md.ilike.${toSafeIlikePattern(query)}`)
        .limit(30)
    : { data: [] };
  const posts: any[] = postRows?.length
    ? await attachPostEngagementCounts(supabase, postRows as any)
    : ((postRows ?? []) as any[]);

  return (
    <section className="feed-section">
      <h1>搜索</h1>
      {!query ? <p className="empty-text">请输入关键词后再搜索。</p> : null}
      {query && !posts?.length ? <p className="empty-text">没有找到相关结果。</p> : null}
      {posts?.length ? (
        <div className="post-list">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
