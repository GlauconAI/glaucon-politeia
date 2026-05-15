import { createBrowserClient } from "@supabase/ssr";

import { formatMissingEnvMessage, getPublicEnv } from "@/lib/env";

export function createSupabaseBrowserClient() {
  const env = getPublicEnv();

  if (!env.configured) {
    throw new Error(formatMissingEnvMessage(env.missing));
  }

  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
