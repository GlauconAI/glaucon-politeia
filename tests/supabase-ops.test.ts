import { describe, expect, it } from "vitest";

import {
  buildLaunchReadinessReport,
  directAdminBootstrapTriggerPlan,
  requiredVercelEnvKeys,
  migrationPlanFromStatus,
  parseOpsArgs,
  usernameFromEmailForOps,
} from "@/lib/ops/supabase";

describe("supabase ops helpers", () => {
  it("plans only migrations that are missing from the remote database", () => {
    expect(
      migrationPlanFromStatus({
        avatarsBucket: false,
        promptsTable: true,
        promptHourlyStats: false,
        archiveOldPrompts: false,
      }),
    ).toEqual([
      "supabase/migrations/20260515000200_avatar_storage.sql",
      "supabase/migrations/20260515000400_prompt_admin_rpc.sql",
    ]);
  });

  it("parses admin email arguments", () => {
    expect(parseOpsArgs(["make-admin", "--email", "Owner@Example.com"])).toEqual({
      command: "make-admin",
      email: "owner@example.com",
    });
  });

  it("normalizes fallback usernames from email", () => {
    expect(usernameFromEmailForOps("First.Last+admin@example.com")).toBe(
      "first-last-admin",
    );
  });

  it("marks launch readiness as failed when admin and migrations are missing", () => {
    const report = buildLaunchReadinessReport({
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        SUPABASE_SECRET_KEY: "secret",
        PROMPTS_RETENTION_SECRET: "retention",
        SUPABASE_DB_URL: "postgres://example",
      },
      status: {
        avatarsBucket: true,
        promptsTable: false,
        promptHourlyStats: true,
        archiveOldPrompts: true,
      },
      adminCount: 0,
    });

    expect(report.ready).toBe(false);
    expect(report.checks.map((check) => check.id)).toContain("admin-user");
    expect(report.checks.find((check) => check.id === "migrations")?.state).toBe(
      "fail",
    );
  });

  it("documents the required Vercel production environment keys", () => {
    expect(requiredVercelEnvKeys).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "PROMPTS_RETENTION_SECRET",
      "PROMPTS_DEV_ACCESS_HELP",
    ]);
  });

  it("documents the trigger bypass needed for direct admin bootstrap", () => {
    expect(directAdminBootstrapTriggerPlan).toEqual({
      table: "public.profiles",
      trigger: "profiles_prevent_admin_escalation",
    });
  });
});
