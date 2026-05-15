import { notFound } from "next/navigation";
import Link from "next/link";

import { MarkdownView } from "@/components/posts/MarkdownView";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PostPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: post } = await supabase
    .from("posts")
    .select("slug,title,content_md,published_at,profiles(username,display_name),post_tags(tags(slug,name))")
    .eq("slug", slug)
    .maybeSingle();

  if (!post) {
    notFound();
  }

  const author = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;

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
      <MarkdownView content={post.content_md} />
    </article>
  );
}
