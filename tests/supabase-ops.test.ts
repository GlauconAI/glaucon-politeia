import { describe, expect, it } from "vitest";

import {
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
});
