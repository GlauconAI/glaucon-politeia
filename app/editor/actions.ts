"use server";

import { redirect } from "next/navigation";

import { createPost } from "@/lib/posts/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function savePostAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/auth?redirectTo=/editor");
  }

  const tagIds = formData
    .getAll("tagIds")
    .filter((value): value is string => typeof value === "string");
  const intent = getFormString(formData, "intent");
  const post = await createPost(supabase, {
    authorId: data.user.id,
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
