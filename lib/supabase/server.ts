import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { formatMissingEnvMessage, getPublicEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = getPublicEnv();

  if (!env.configured) {
    throw new Error(formatMissingEnvMessage(env.missing));
  }

  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware and Route Handlers can.
        }
      },
    },
  });
}
