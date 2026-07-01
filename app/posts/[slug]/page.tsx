import { notFound } from "next/navigation";
import Link from "next/link";

import { CommentSection } from "@/components/comments/CommentSection";
import { PostBody } from "@/components/posts/PostBody";
import { PostInteractions } from "@/components/posts/PostInteractions";
import { buildCommentTree } from "@/lib/comments/tree";
import { loadPostEngagementCounts } from "@/lib/posts/engagement";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const { data: post } = await supabase
    .from("posts")
    .select("id,slug,title,content_md,content_html,content_format,visibility,published_at,profiles(username,display_name),post_tags(tags(slug,name))")
    .eq("slug", slug)
    .maybeSingle();

  if (!post) {
    notFound();
  }

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
  const [{ data: liked }, { data: bookmarked }, { data: comments }, countMap] =
    await Promise.all([
      userData.user
        ? supabase
            .from("post_reactions")
            .select("id")
            .eq("post_id", post.id)
            .eq("user_id", userData.user.id)
            .eq("type", "like")
            .maybeSingle()
        : { data: null },
      userData.user
        ? supabase
            .from("bookmarks")
            .select("id")
            .eq("post_id", post.id)
            .eq("user_id", userData.user.id)
            .maybeSingle()
        : { data: null },
      supabase
        .from("comments")
        .select("id,parent_id,content_md,author_id,created_at,profiles(display_name,username)")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true }),
      loadPostEngagementCounts(supabase, [post.id]),
    ]);
  const counts = countMap.get(post.id);
  const commentTree = buildCommentTree((comments ?? []) as any);

  return (
    <article className="post-detail">
      <p className="eyebrow">
        <Link href="/">首页</Link> / {post.slug}
      </p>
      <h1>{post.title}</h1>
      <div className="post-meta">
        {author ? (
          <Link href={`/profile/${author.username}`}>{author.display_name}</Link>
        ) : (
          <span>匿名</span>
        )}
        {post.published_at ? <span>{new Date(post.published_at).toLocaleDateString()}</span> : null}
        {post.visibility === "private" ? <span>Private</span> : null}
      </div>
      <div className="tag-row">
        {post.post_tags?.map((item) => {
          const tag = Array.isArray(item.tags) ? item.tags[0] : item.tags;
          return tag ? (
            <Link key={tag.slug} href={`/tags/${tag.slug}`}>
              #{tag.name}
            </Link>
          ) : null;
        })}
      </div>
      <PostInteractions
        postId={post.id}
        slug={post.slug}
        liked={Boolean(liked)}
        bookmarked={Boolean(bookmarked)}
        likeCount={counts?.like_count ?? 0}
        bookmarkCount={counts?.bookmark_count ?? 0}
      />
      <PostBody
        contentFormat={post.content_format === "html" ? "html" : "markdown"}
        contentMd={post.content_md ?? ""}
        contentHtml={post.content_html ?? ""}
        title={post.title}
      />
      <CommentSection
        postId={post.id}
        slug={post.slug}
        comments={commentTree as any}
        currentUserId={userData.user?.id ?? null}
      />
    </article>
  );
}
