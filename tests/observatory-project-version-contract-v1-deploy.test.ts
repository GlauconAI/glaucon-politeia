import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assertProductionSupabaseTarget,
  parseDeploymentCommand,
} from "@/scripts/observatory/deploy-project-version-contract-v1";

describe("Project Version contract v1 production deployment", () => {
  it("defaults to a rollback check and accepts only bounded commands", () => {
    expect(parseDeploymentCommand([])).toBe("check");
    expect(parseDeploymentCommand(["check"])).toBe("check");
    expect(parseDeploymentCommand(["apply"])).toBe("apply");
    expect(parseDeploymentCommand(["status"])).toBe("status");
    expect(() => parseDeploymentCommand(["apply", "extra"])).toThrow(/unexpected/iu);
    expect(() => parseDeploymentCommand(["delete"])).toThrow(/usage/iu);
  });

  it("requires the database target to match the production Supabase project", () => {
    expect(assertProductionSupabaseTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://fiicazfhjkviqaaaiksp.supabase.co",
      SUPABASE_DB_URL: "postgresql://postgres.fiicazfhjkviqaaaiksp:secret@aws-0.ca-central-1.pooler.supabase.com:6543/postgres",
    })).toMatchObject({ projectRef: "fiicazfhjkviqaaaiksp" });
    expect(assertProductionSupabaseTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://fiicazfhjkviqaaaiksp.supabase.co",
      SUPABASE_DB_URL: "postgresql://postgres:secret@db.fiicazfhjkviqaaaiksp.supabase.co:5432/postgres",
    })).toMatchObject({ projectRef: "fiicazfhjkviqaaaiksp" });
    expect(() => assertProductionSupabaseTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_DB_URL: "postgresql://postgres.other:secret@aws-0.ca-central-1.pooler.supabase.com:6543/postgres",
    })).toThrow(/identity mismatch/iu);
    expect(() => assertProductionSupabaseTarget({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_DB_URL: "postgresql://postgres.example:secret@aws-0.ca-central-1.pooler.supabase.com:6543/postgres",
    })).toThrow(/identity mismatch/iu);
    expect(() => assertProductionSupabaseTarget({
      NEXT_PUBLIC_SUPABASE_URL: "http://example.invalid",
      SUPABASE_DB_URL: "postgresql://postgres.example:secret@example.invalid:5432/postgres",
    })).toThrow(/identity mismatch/iu);
  });

  it("verifies the migrated database inside the apply transaction before commit", async () => {
    const source = await readFile(
      "scripts/observatory/deploy-project-version-contract-v1.ts",
      "utf8",
    );
    const start = source.indexOf("let verifiedBeforeCommit");
    const apply = source.slice(start, source.indexOf("const verified =", start));
    expect(apply).toMatch(/sql\.begin[\s\S]*readProjectVersionContractStatus\(transaction\)/u);
  });
});
