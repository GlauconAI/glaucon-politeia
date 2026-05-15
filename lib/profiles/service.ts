import { createUniqueUsername } from "@/lib/profiles/username";

// Supabase's fluent query builder is deeply generic. Profile services keep a
// narrow runtime contract and let call sites pass the project client directly.
type SupabaseLike = any;

export type Profile = {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
};

export async function getProfileByUsername(
  supabase: SupabaseLike,
  username: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, display_name, bio, avatar_url, is_admin")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile | null;
}

export async function ensureProfile(
  supabase: SupabaseLike,
  user: { id: string; email?: string | null },
) {
  const existing = await supabase
    .from("profiles")
    .select("user_id, username, display_name, bio, avatar_url, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data as Profile;
  }

  const email = user.email ?? `${user.id}@example.local`;
  const username = createUniqueUsername(email, {
    isTaken: () => false,
    suffix: () => user.id.slice(0, 4),
  });
  const displayName = email.split("@")[0] || "User";
  const created = await supabase
    .from("profiles")
    .insert({
      user_id: user.id,
      username,
      display_name: displayName,
      bio: "",
      avatar_url: "",
    })
    .select("user_id, username, display_name, bio, avatar_url, is_admin")
    .single();

  if (created.error) {
    throw new Error(created.error.message);
  }

  return created.data as Profile;
}

export async function updateProfile(
  supabase: SupabaseLike,
  userId: string,
  fields: { display_name: string; bio: string; avatar_url?: string },
) {
  const { error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
