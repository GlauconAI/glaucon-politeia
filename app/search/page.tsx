import Link from "next/link";

import { PostCard } from "@/components/posts/PostCard";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import {
  buildSearchOrFilter,
  normalizeSearchQuery,
  normalizeSearchType,
} from "@/lib/posts/search";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchPageProps = {
  searchParams: Promise<{ q?: string; type?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, type } = await searchParams;
  const query = normalizeSearchQuery(q);
  const searchType = normalizeSearchType(type);
  const supabase = await createSupabaseServerClient();
  let postRows: any[] = [];

  if (query) {
    let request = supabase
        .from("posts")
        .select(
          "id,slug,title,excerpt,published_at,visibility,content_format,profiles(username,display_name),post_tags(tags(slug,name))",
        )
        .eq("status", "published")
        .or(buildSearchOrFilter(query));

    if (searchType) {
      request = request.eq("content_format", searchType);
    }

    const { data } = await request.limit(30);
    postRows = data ?? [];
  }

  const posts: any[] = postRows?.length
    ? await attachPostEngagementCounts(supabase, postRows as any)
    : ((postRows ?? []) as any[]);
  const encodedQuery = encodeURIComponent(query);

  return (
    <section className="feed-section">
      <h1>搜索</h1>
      {query ? (
        <div className="search-filter-row" aria-label="Search filters">
          <Link className={!searchType ? "active" : ""} href={`/search?q=${encodedQuery}`}>
            All
          </Link>
          <Link
            className={searchType === "html" ? "active" : ""}
            href={`/search?q=${encodedQuery}&type=html`}
          >
            HTML Sites
          </Link>
          <Link
            className={searchType === "markdown" ? "active" : ""}
            href={`/search?q=${encodedQuery}&type=markdown`}
          >
            Notes
          </Link>
        </div>
      ) : null}
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
