import "server-only";

import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ObservatoryAdminProfile {
  user_id: string;
  username: string;
  display_name: string;
  is_admin: true;
}

interface ObservatoryAuthDependencyFailure {
  code?: string;
  name?: string;
  status?: number;
  message: string;
}

export class ObservatoryAdminAuthError extends Error {
  readonly code = "AUTH_DEPENDENCY_FAILED" as const;

  constructor() {
    super("Observatory authorization is temporarily unavailable.");
    this.name = "ObservatoryAdminAuthError";
  }
}

interface ObservatoryServerAuthClient {
  auth: {
    getUser(): PromiseLike<{
      data: { user: { id: string } | null };
      error: ObservatoryAuthDependencyFailure | null;
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
          error: ObservatoryAuthDependencyFailure | null;
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

  try {
    const supabase = await dependencies.createServerClient();
    const { data, error: authError } = await supabase.auth.getUser();

    if (authError) {
      if (authError.name === "AuthSessionMissingError") {
        return null;
      }
      throw new ObservatoryAdminAuthError();
    }
    if (!data.user) {
      return null;
    }

    const admin = dependencies.createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, username, display_name, is_admin")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (profileError) {
      throw new ObservatoryAdminAuthError();
    }

    return profile?.is_admin ? (profile as ObservatoryAdminProfile) : null;
  } catch (error) {
    if (error instanceof ObservatoryAdminAuthError) {
      throw error;
    }
    throw new ObservatoryAdminAuthError();
  }
}
