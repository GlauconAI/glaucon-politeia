import { createClient } from "@supabase/supabase-js";

import { formatMissingEnvMessage, getServerEnv } from "@/lib/env";

export function createSupabaseAdminClient() {
  const env = getServerEnv();

  if (!env.configured) {
    throw new Error(formatMissingEnvMessage(env.missing));
  }

  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
