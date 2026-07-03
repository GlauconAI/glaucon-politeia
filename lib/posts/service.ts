import {
  normalizePostContentInput,
  normalizePostVisibility,
} from "@/lib/posts/content";
import { createUniqueSlug } from "@/lib/posts/text";

type SupabaseLike = any;

export async function createPost(
  supabase: SupabaseLike,
  input: {
    authorId: string;
    title: string;
    content: string;
    contentFormat?: string;
    contentHtml?: string;
    tagIds: string[];
    publish: boolean;
    visibility?: string;
  },
) {
  const title = input.title.trim();
  const content = normalizePostContentInput(input);
  const visibility = normalizePostVisibility(input.visibility);

  if (!title) {
    throw new Error("Title is required");
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
      excerpt: content.excerpt,
      content_md: content.contentMd,
      content_html: content.contentHtml,
      content_format: content.contentFormat,
      visibility,
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

export async function updatePost(
  supabase: SupabaseLike,
  input: {
    postId: string;
    slug?: string;
    title: string;
    content: string;
    contentFormat?: string;
    contentHtml?: string;
    tagIds: string[];
    publish: boolean;
    visibility?: string;
  },
) {
  const title = input.title.trim();
  const content = normalizePostContentInput(input);
  const visibility = normalizePostVisibility(input.visibility);
  const slug = createUniqueSlug(input.slug || title, {
    isTaken: () => false,
    suffix: () => Math.floor(1000 + Math.random() * 9000).toString(),
  });

  if (!input.postId.trim()) {
    throw new Error("Post id is required");
  }

  if (!title) {
    throw new Error("Title is required");
  }

  const status = input.publish ? "published" : "draft";
  const payload = {
    slug,
    title,
    excerpt: content.excerpt,
    content_md: content.contentMd,
    content_html: content.contentHtml,
    content_format: content.contentFormat,
    visibility,
    status,
    published_at: input.publish ? new Date().toISOString() : null,
  };
  const { data: post, error } = await supabase
    .from("posts")
    .update(payload)
    .eq("id", input.postId)
    .select("id, slug")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { error: deleteTagError } = await supabase
    .from("post_tags")
    .delete()
    .eq("post_id", input.postId);

  if (deleteTagError) {
    throw new Error(deleteTagError.message);
  }

  const limitedTagIds = input.tagIds.slice(0, 3);
  if (limitedTagIds.length > 0) {
    const { error: tagError } = await supabase.from("post_tags").insert(
      limitedTagIds.map((tagId) => ({
        post_id: input.postId,
        tag_id: tagId,
      })),
    );

    if (tagError) {
      throw new Error(tagError.message);
    }
  }

  return post as { id: string; slug: string };
}

export async function deletePost(supabase: SupabaseLike, postId: string) {
  if (!postId.trim()) {
    throw new Error("Post id is required");
  }

  const { error } = await supabase.from("posts").delete().eq("id", postId);

  if (error) {
    throw new Error(error.message);
  }
}
