import { redirect } from "next/navigation";

import { ensureProfile } from "@/lib/profiles/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function MyProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/auth?redirectTo=/profile/me");
  }

  const profile = await ensureProfile(supabase, data.user);
  redirect(`/profile/${profile.username}`);
}
