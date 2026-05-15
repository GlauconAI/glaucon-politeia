import { createExcerpt, createUniqueSlug } from "@/lib/posts/text";

type SupabaseLike = any;

export async function createPost(
  supabase: SupabaseLike,
  input: {
    authorId: string;
    title: string;
    content: string;
    tagIds: string[];
    publish: boolean;
  },
) {
  const title = input.title.trim();
  const content = input.content.trim();

  if (!title || !content) {
    throw new Error("Title and content are required");
  }

  const slug = createUniqueSlug(title, {
    isTaken: () => false,
    suffix: () => Math.floor(1000 + Math.random() * 9000).toString(),
  });
  const status = input.publish ? "published" : "draft";
  const { data: post, error } = await supabase
    .from("posts")
    .insert({
      author_id: input.authorId,
      slug,
      title,
      excerpt: createExcerpt(content),
      content_md: content,
      status,
      published_at: input.publish ? new Date().toISOString() : null,
    })
    .select("id, slug")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const limitedTagIds = input.tagIds.slice(0, 3);
  if (limitedTagIds.length > 0) {
    const { error: tagError } = await supabase.from("post_tags").insert(
      limitedTagIds.map((tagId) => ({
        post_id: post.id,
        tag_id: tagId,
      })),
    );

    if (tagError) {
      throw new Error(tagError.message);
    }
  }

  return post as { id: string; slug: string };
}
