import { describe, expect, it } from "vitest";

import { getPublicEnv, getServerEnv } from "@/lib/env";

describe("environment helpers", () => {
  it("reports missing Supabase public configuration with clear keys", () => {
    const env = getPublicEnv({});

    expect(env.configured).toBe(false);
    expect(env.missing).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("returns Supabase public configuration when required keys are present", () => {
    const env = getPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });

    expect(env).toEqual({
      configured: true,
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon-key",
      missing: [],
    });
  });

  it("keeps service role configuration server-only", () => {
    const env = getServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    });

    expect(env.configured).toBe(true);
    expect(env.supabaseServiceRoleKey).toBe("service-role-key");
    expect(env.missing).toEqual([]);
  });
});
