"use server";

import { redirect } from "next/navigation";

import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { ensureProfile } from "@/lib/profiles/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function loginAction(formData: FormData) {
  const email = getFormString(formData, "email");
  const password = getFormString(formData, "password");
  const redirectTo = getSafeRedirectPath(getFormString(formData, "redirectTo"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth?mode=login&error=${encodeURIComponent(error.message)}&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await ensureProfile(supabase, data.user);
  }

  redirect(redirectTo);
}

export async function registerAction(formData: FormData) {
  const redirectTo = getSafeRedirectPath(getFormString(formData, "redirectTo"));
  redirect(`/auth?error=${encodeURIComponent("Registration is closed")}&redirectTo=${encodeURIComponent(redirectTo)}`);
}

export async function oauthAction(formData: FormData) {
  const redirectTo = getSafeRedirectPath(getFormString(formData, "redirectTo"));
  redirect(`/auth?error=${encodeURIComponent("OAuth login is disabled")}&redirectTo=${encodeURIComponent(redirectTo)}`);
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
