import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  markObservatorySnapshotReleaseEvidence,
  pruneObservatorySnapshots,
} from "@/lib/observatory/publisher";

const config = {
  supabaseUrl: "https://project.supabase.co",
  serviceRoleKey: "service-role-secret",
};

describe("Observatory retention", () => {
  it("calls the restricted retention RPC with a bounded keep count", async () => {
    const fetchAdapter = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(7), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      pruneObservatorySnapshots(30, { ...config, fetch: fetchAdapter }),
    ).resolves.toBe(7);
    expect(fetchAdapter).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/prune_observatory_snapshots",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({ p_keep: 30 }),
      }),
    );
    await expect(
      pruneObservatorySnapshots(0, { ...config, fetch: fetchAdapter }),
    ).rejects.toMatchObject({ code: "CONFIG_MISSING" });
  });

  it("marks release evidence through a restricted digest RPC", async () => {
    const digest = "a".repeat(64);
    const fetchAdapter = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await markObservatorySnapshotReleaseEvidence(digest, {
      ...config,
      fetch: fetchAdapter,
    });
    expect(fetchAdapter).toHaveBeenCalledWith(
      "https://project.supabase.co/rest/v1/rpc/mark_observatory_snapshot_release",
      expect.objectContaining({ body: JSON.stringify({ p_digest: digest }) }),
    );
  });

  it("defines service-role-only SQL that preserves release evidence", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260722000100_observatory_snapshot_retention.sql",
      ),
      "utf8",
    );

    expect(sql).toMatch(/release_evidence boolean not null default false/u);
    expect(sql).toMatch(/where release_evidence = false/u);
    expect(sql).toMatch(/row_number\(\) over \(order by generated_at desc/u);
    expect(sql).toMatch(/grant execute on function public\.prune_observatory_snapshots\(integer\)\s+to service_role/iu);
    expect(sql).toMatch(/grant execute on function public\.mark_observatory_snapshot_release\(text\)\s+to service_role/iu);
    expect(sql).not.toMatch(/grant execute[\s\S]*to authenticated/iu);
  });
});
