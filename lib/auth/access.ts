type SupabaseLike = any;

export async function getCurrentUserAccess(supabase: SupabaseLike) {
  const { data } = await supabase.auth.getUser();
  const user = data.user ?? null;

  if (!user) {
    return {
      user: null,
      email: null,
      isAdmin: false,
      canPublish: false,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(profile?.is_admin);

  return {
    user,
    email: user.email ?? null,
    isAdmin,
    canPublish: isAdmin,
  };
}
