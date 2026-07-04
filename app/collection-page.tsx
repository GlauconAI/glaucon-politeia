import { notFound } from "next/navigation";

import { LaoyaoGuitarFeature } from "@/components/family/LaoyaoGuitarFeature";
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

function archivePageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_value, index) => index + 1);
  }

  const pages = new Set([1, totalPages]);
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let page = start; page <= end; page += 1) {
    pages.add(page);
  }

  const sortedPages = [...pages].sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  sortedPages.forEach((pageNumber, index) => {
    const previous = sortedPages[index - 1];
    if (previous && pageNumber - previous > 1) {
      items.push("ellipsis");
    }
    items.push(pageNumber);
  });

  return items;
}

export async function CollectionPage({
  headingLabel,
  page = 1,
  slug,
}: {
  headingLabel?: string;
  page?: number;
  slug: string;
}) {
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
  const postTagsSelect = query.tagSlugs.length
    ? "post_tags!inner(tags!inner(slug,name))"
    : "post_tags(tags(slug,name))";
  let request = supabase
    .from("posts")
    .select(
      `id,slug,title,excerpt,published_at,visibility,content_format,profiles(username,display_name),${postTagsSelect}`,
      isArchive ? { count: "exact" } : undefined,
    )
    .eq("status", "published")
    .eq("visibility", "public")
    .order("published_at", { ascending: false });

  if (query.tagSlugs.length) {
    request = request.in("post_tags.tags.slug", query.tagSlugs);
  }

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
        <h1>{headingLabel ?? collection.label}</h1>
        <p>{collection.description}</p>
      </div>
      {slug === "family" ? <LaoyaoGuitarFeature /> : null}
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
          {archivePageItems(currentPage, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <span key={`ellipsis-${index}`} aria-hidden="true">
                ...
              </span>
            ) : (
              <a
                key={item}
                aria-current={item === currentPage ? "page" : undefined}
                href={archivePageHref(item)}
              >
                {item}
              </a>
            ),
          )}
          {currentPage < totalPages ? (
            <a href={archivePageHref(currentPage + 1)}>Next</a>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
