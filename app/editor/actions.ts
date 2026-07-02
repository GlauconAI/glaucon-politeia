"use server";

import { redirect } from "next/navigation";

import { createPost } from "@/lib/posts/service";
import { getCurrentUserAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function savePostAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const access = await getCurrentUserAccess(supabase);

  if (!access.user) {
    redirect("/auth?redirectTo=/editor");
  }

  if (!access.canPublish) {
    redirect("/");
  }

  const tagIds = formData
    .getAll("tagIds")
    .filter((value): value is string => typeof value === "string");
  const intent = getFormString(formData, "intent");
  const post = await createPost(supabase, {
    authorId: access.user.id,
    title: getFormString(formData, "title"),
    content: getFormString(formData, "content"),
    contentFormat: getFormString(formData, "contentFormat"),
    contentHtml: getFormString(formData, "content"),
    tagIds,
    publish: intent === "publish",
    visibility: getFormString(formData, "visibility"),
  });

  redirect(`/posts/${post.slug}`);
}
