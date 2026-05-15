"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getPublicAvatarPath,
  isSupportedAvatarFile,
} from "@/lib/profiles/domain";
import { ensureProfile, updateProfile } from "@/lib/profiles/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/auth?redirectTo=/profile/me");
  }

  const profile = await ensureProfile(supabase, data.user);
  const displayName = getFormString(formData, "display_name");
  const bio = getFormString(formData, "bio");

  await updateProfile(supabase, data.user.id, {
    display_name: displayName || profile.display_name,
    bio,
  });

  revalidatePath(`/profile/${profile.username}`);
  redirect(`/profile/${profile.username}?saved=1`);
}

export async function uploadAvatarAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/auth?redirectTo=/profile/me");
  }

  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/profile/me?error=missing-avatar");
  }

  if (!isSupportedAvatarFile(file.type)) {
    redirect("/profile/me?error=unsupported-avatar");
  }

  const profile = await ensureProfile(supabase, data.user);
  const path = getPublicAvatarPath({
    userId: data.user.id,
    fileName: file.name,
    randomId: () => crypto.randomUUID(),
  });
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    redirect(`/profile/${profile.username}?error=${encodeURIComponent(error.message)}`);
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
  await updateProfile(supabase, data.user.id, {
    display_name: profile.display_name,
    bio: profile.bio,
    avatar_url: urlData.publicUrl,
  });

  revalidatePath(`/profile/${profile.username}`);
  redirect(`/profile/${profile.username}?saved=1`);
}
