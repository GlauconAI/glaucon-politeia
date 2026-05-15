"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function requireUser(redirectTo: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/auth?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return { supabase, user: data.user };
}

export async function toggleLikeAction(formData: FormData) {
  const slug = getFormString(formData, "slug");
  const postId = getFormString(formData, "postId");
  const { supabase, user } = await requireUser(`/posts/${slug}`);
  const existing = await supabase
    .from("post_reactions")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .eq("type", "like")
    .maybeSingle();

  if (existing.data) {
    await supabase.from("post_reactions").delete().eq("id", existing.data.id).eq("user_id", user.id);
  } else {
    await supabase.from("post_reactions").insert({ post_id: postId, user_id: user.id, type: "like" });
  }

  revalidatePath(`/posts/${slug}`);
}

export async function toggleBookmarkAction(formData: FormData) {
  const slug = getFormString(formData, "slug");
  const postId = getFormString(formData, "postId");
  const { supabase, user } = await requireUser(`/posts/${slug}`);
  const existing = await supabase
    .from("bookmarks")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.data) {
    await supabase.from("bookmarks").delete().eq("id", existing.data.id).eq("user_id", user.id);
  } else {
    await supabase.from("bookmarks").insert({ post_id: postId, user_id: user.id });
  }

  revalidatePath(`/posts/${slug}`);
}

export async function createCommentAction(formData: FormData) {
  const slug = getFormString(formData, "slug");
  const postId = getFormString(formData, "postId");
  const content = getFormString(formData, "content");
  const parentId = getFormString(formData, "parentId") || null;
  const { supabase, user } = await requireUser(`/posts/${slug}`);

  if (content) {
    await supabase.from("comments").insert({
      post_id: postId,
      author_id: user.id,
      parent_id: parentId,
      content_md: content,
    });
  }

  revalidatePath(`/posts/${slug}`);
}

export async function deleteCommentAction(formData: FormData) {
  const slug = getFormString(formData, "slug");
  const commentId = getFormString(formData, "commentId");
  const { supabase, user } = await requireUser(`/posts/${slug}`);
  await supabase.from("comments").delete().eq("id", commentId).eq("author_id", user.id);
  revalidatePath(`/posts/${slug}`);
}
