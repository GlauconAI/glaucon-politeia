type EnvSource = Record<string, string | undefined>;

type PublicEnv =
  | {
      configured: true;
      supabaseUrl: string;
      supabasePublishableKey: string;
      missing: [];
    }
  | {
      configured: false;
      supabaseUrl?: undefined;
      supabasePublishableKey?: undefined;
      missing: string[];
    };

type ServerEnv =
  | {
      configured: true;
      supabaseUrl: string;
      supabasePublishableKey: string;
      supabaseSecretKey: string;
      missing: [];
    }
  | {
      configured: false;
      supabaseUrl?: string;
      supabasePublishableKey?: string;
      supabaseSecretKey?: undefined;
      missing: string[];
    };

const publicKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

const serverKeys = [...publicKeys, "SUPABASE_SECRET_KEY"] as const;

function readTrimmed(env: EnvSource, key: string) {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function missingKeys(env: EnvSource, keys: readonly string[]) {
  return keys.filter((key) => !readTrimmed(env, key));
}

export function getPublicEnv(env: EnvSource = process.env): PublicEnv {
  const missing = missingKeys(env, publicKeys);

  if (missing.length > 0) {
    return { configured: false, missing };
  }

  return {
    configured: true,
    supabaseUrl: readTrimmed(env, "NEXT_PUBLIC_SUPABASE_URL")!,
    supabasePublishableKey: readTrimmed(
      env,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    )!,
    missing: [],
  };
}

export function getServerEnv(env: EnvSource = process.env): ServerEnv {
  const missing = missingKeys(env, serverKeys);
  const supabaseUrl = readTrimmed(env, "NEXT_PUBLIC_SUPABASE_URL");
  const supabasePublishableKey = readTrimmed(
    env,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );

  if (missing.length > 0) {
    return {
      configured: false,
      supabaseUrl,
      supabasePublishableKey,
      missing,
    };
  }

  return {
    configured: true,
    supabaseUrl: supabaseUrl!,
    supabasePublishableKey: supabasePublishableKey!,
    supabaseSecretKey: readTrimmed(env, "SUPABASE_SECRET_KEY")!,
    missing: [],
  };
}

export function formatMissingEnvMessage(missing: readonly string[]) {
  return `Missing required environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`;
}
