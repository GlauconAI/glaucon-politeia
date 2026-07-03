import { notFound } from "next/navigation";

import { PostCard } from "@/components/posts/PostCard";
import { collectionForPath, collectionQueryForPath } from "@/lib/posts/collections";
import { attachPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const archivePageSize = 24;

function postHasTag(post: any, tagSlugs: string[]) {
  if (!tagSlugs.length) {
    return true;
  }

  return post.post_tags?.some((item: any) => {
    const tag = Array.isArray(item.tags) ? item.tags[0] : item.tags;
    return tag?.slug && tagSlugs.includes(tag.slug);
  });
}

function archivePageHref(page: number) {
  return `/archive?page=${page}`;
}

function pageWindow(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 1);
  const end = Math.min(totalPages, currentPage + 1);

  return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
}

export async function CollectionPage({ page = 1, slug }: { page?: number; slug: string }) {
  const collection = collectionForPath(slug);
  const query = collectionQueryForPath(slug);

  if (!collection || !query) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const isArchive = slug === "archive";
  const currentPage = Math.max(1, Math.floor(page));
  const from = (currentPage - 1) * archivePageSize;
  const to = from + archivePageSize - 1;
  let request = supabase
    .from("posts")
    .select(
      "id,slug,title,excerpt,published_at,visibility,content_format,profiles(username,display_name),post_tags(tags(slug,name))",
      isArchive ? { count: "exact" } : undefined,
    )
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false });

  request = isArchive ? request.range(from, to) : request.limit(60);

  if (query.contentFormat) {
    request = request.eq("content_format", query.contentFormat);
  }

  const { count, data: postRows } = await request;
  const visibleRows = ((postRows ?? []) as any[]).filter((post) =>
    postHasTag(post, query.tagSlugs),
  );
  const posts = visibleRows.length
    ? await attachPostEngagementCounts(supabase, visibleRows)
    : [];
  const totalPages =
    isArchive && count ? Math.max(1, Math.ceil(count / archivePageSize)) : 1;

  return (
    <section className="feed-section collection-page">
      <div className="section-heading">
        <p className="eyebrow">{collection.meta}</p>
        <h1>{collection.label}</h1>
        <p>{collection.description}</p>
      </div>
      {isArchive ? (
        <div className="archive-pagination-summary">
          <span>{count ?? 0} published items</span>
          <span>
            Page {currentPage} / {totalPages}
          </span>
        </div>
      ) : null}
      {posts.length ? (
        <div className="archive-post-board">
          {posts.map((post) => (
            <PostCard key={post.slug} collection={collection.label} post={post} />
          ))}
        </div>
      ) : (
        <p className="empty-text">No published items in this collection yet.</p>
      )}
      {isArchive && totalPages > 1 ? (
        <nav className="archive-pagination" aria-label="Archive pages">
          {currentPage > 1 ? (
            <a href={archivePageHref(currentPage - 1)}>Previous</a>
          ) : null}
          {pageWindow(currentPage, totalPages).map((pageNumber) => (
            <a
              key={pageNumber}
              aria-current={pageNumber === currentPage ? "page" : undefined}
              href={archivePageHref(pageNumber)}
            >
              Page {pageNumber}
            </a>
          ))}
          {currentPage < totalPages ? (
            <a href={archivePageHref(currentPage + 1)}>Next</a>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
