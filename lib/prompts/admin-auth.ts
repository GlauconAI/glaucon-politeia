import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";

export async function getCurrentPromptAdmin() {
  if (!getServerEnv().configured) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, username, display_name, is_admin")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return profile?.is_admin ? profile : null;
}
