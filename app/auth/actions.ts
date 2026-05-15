"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

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
  const email = getFormString(formData, "email");
  const password = getFormString(formData, "password");
  const redirectTo = getSafeRedirectPath(getFormString(formData, "redirectTo"));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(`/auth?mode=register&error=${encodeURIComponent(error.message)}&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  redirect(`/auth?mode=login&message=${encodeURIComponent("请前往邮箱完成确认，或直接登录。")}&redirectTo=${encodeURIComponent(redirectTo)}`);
}

export async function oauthAction(formData: FormData) {
  const provider = getFormString(formData, "provider");
  const redirectTo = getSafeRedirectPath(getFormString(formData, "redirectTo"));

  if (provider !== "github" && provider !== "google") {
    redirect(`/auth?error=${encodeURIComponent("Unsupported OAuth provider")}&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const supabase = await createSupabaseServerClient();
  const headerStore = await headers();
  const origin = headerStore.get("origin") ?? "http://localhost:3000";
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    redirect(`/auth?error=${encodeURIComponent(error?.message ?? "OAuth start failed")}&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  redirect(data.url);
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
