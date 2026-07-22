import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ObservatoryAdminProfile {
  user_id: string;
  username: string;
  display_name: string;
  is_admin: true;
}

interface ObservatoryServerAuthClient {
  auth: {
    getUser(): PromiseLike<{
      data: { user: { id: string } | null };
    }>;
  };
}

interface ObservatoryAdminProfileClient {
  from(table: "profiles"): {
    select(columns: string): {
      eq(column: "user_id", value: string): {
        maybeSingle(): PromiseLike<{
          data:
            | (Omit<ObservatoryAdminProfile, "is_admin"> & {
                is_admin: boolean;
              })
            | { is_admin: false }
            | null;
        }>;
      };
    };
  };
}

export interface ObservatoryAdminAuthDependencies {
  isConfigured(): boolean;
  createServerClient(): Promise<ObservatoryServerAuthClient>;
  createAdminClient(): ObservatoryAdminProfileClient;
}

const defaultDependencies: ObservatoryAdminAuthDependencies = {
  isConfigured: () => getServerEnv().configured,
  createServerClient: async () =>
    (await createSupabaseServerClient()) as unknown as ObservatoryServerAuthClient,
  createAdminClient: () =>
    createSupabaseAdminClient() as unknown as ObservatoryAdminProfileClient,
};

export async function getCurrentObservatoryAdmin(
  dependencies: ObservatoryAdminAuthDependencies = defaultDependencies,
): Promise<ObservatoryAdminProfile | null> {
  if (!dependencies.isConfigured()) {
    return null;
  }

  const supabase = await dependencies.createServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return null;
  }

  const admin = dependencies.createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id, username, display_name, is_admin")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return profile?.is_admin ? (profile as ObservatoryAdminProfile) : null;
}
