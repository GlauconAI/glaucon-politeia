import { notFound } from "next/navigation";

import { PostCard } from "@/components/posts/PostCard";
import { collectionForPath, collectionQueryForPath } from "@/lib/posts/collections";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function postHasTag(post: any, tagSlugs: string[]) {
  if (!tagSlugs.length) {
    return true;
  }

  return post.post_tags?.some((item: any) => {
    const tag = Array.isArray(item.tags) ? item.tags[0] : item.tags;
    return tag?.slug && tagSlugs.includes(tag.slug);
  });
}

export async function CollectionPage({ slug }: { slug: string }) {
  const collection = collectionForPath(slug);
  const query = collectionQueryForPath(slug);

  if (!collection || !query) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from("posts")
    .select(
      "id,slug,title,excerpt,published_at,visibility,content_format,profiles(username,display_name),post_tags(tags(slug,name))",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(60);

  if (query.contentFormat) {
    request = request.eq("content_format", query.contentFormat);
  }

  const { data: postRows } = await request;
  const visibleRows = ((postRows ?? []) as any[]).filter((post) =>
    postHasTag(post, query.tagSlugs),
  );
  const posts = visibleRows.length
    ? await attachPostEngagementCounts(supabase, visibleRows)
    : [];

  return (
    <section className="feed-section collection-page">
      <div className="section-heading">
        <p className="eyebrow">{collection.meta}</p>
        <h1>{collection.label}</h1>
        <p>{collection.description}</p>
      </div>
      {posts.length ? (
        <div className="archive-post-board">
          {posts.map((post) => (
            <PostCard key={post.slug} collection={collection.label} post={post} />
          ))}
        </div>
      ) : (
        <p className="empty-text">No published items in this collection yet.</p>
      )}
    </section>
  );
}
