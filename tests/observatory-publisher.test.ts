import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { collectObservatorySnapshot } from "@/lib/observatory/collector";
import {
  ObservatoryPublisherError,
  publishObservatorySnapshot,
} from "@/lib/observatory/publisher";

const registryHtml = readFileSync(
  join(process.cwd(), "tests/fixtures/observatory-registry.html"),
  "utf8",
);

async function validSnapshot() {
  return collectObservatorySnapshot(
    { registryPath: "/canonical/registry.html" },
    {
      runCommand: async (invocation) => ({
        exitCode: 0,
        stdout:
          invocation.args[0] === "agents"
            ? JSON.stringify([
                {
                  id: "plato",
                  displayName: "Plato",
                  emoji: "🏛️",
                  modelLabel: "gpt-5",
                  workspaceLabel: "plato",
                  bindingCount: 2,
                  default: true,
                },
              ])
            : JSON.stringify({
                runtimeVersion: "2026.7.21",
                gateway: { reachable: true },
                gatewayService: {
                  loaded: true,
                  runtime: { status: "running" },
                },
                configuredAgentCount: 1,
                taskTotals: {
                  total: 3,
                  active: 1,
                  queued: 0,
                  completed: 2,
                  failed: 0,
                },
              }),
      }),
      readTextFile: async () => registryHtml,
      now: () => new Date("2026-07-21T23:00:00.000Z"),
    },
  );
}

const config = {
  supabaseUrl: "https://project.supabase.co",
  serviceRoleKey: "super-secret-service-role-key",
};

describe("publishObservatorySnapshot", () => {
  it("rejects remote HTTP endpoints before sending credentials", async () => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 201 }),
    );

    await expect(
      publishObservatorySnapshot(snapshot, {
        supabaseUrl: "http://project.supabase.co",
        serviceRoleKey: config.serviceRoleKey,
        fetch: fetchAdapter,
      }),
    ).rejects.toMatchObject({ code: "CONFIG_MISSING" });
    expect(fetchAdapter).not.toHaveBeenCalled();
  });

  it.each([
    "http://127.23.45.67:54321",
    "http://[::1]:54321",
    "http://localhost:54321",
  ])("allows an HTTP loopback endpoint at %s", async (supabaseUrl) => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 201 }),
    );

    await expect(
      publishObservatorySnapshot(snapshot, {
        supabaseUrl,
        serviceRoleKey: config.serviceRoleKey,
        fetch: fetchAdapter,
      }),
    ).resolves.toEqual({ published: true, idempotent: false });
    expect(fetchAdapter).toHaveBeenCalledTimes(1);
  });

  it("rejects a failed snapshot before network I/O", async () => {
    const fetchAdapter = vi.fn<typeof fetch>();

    await expect(
      publishObservatorySnapshot(
        { status: "failed", error: "private command output" },
        { ...config, fetch: fetchAdapter },
      ),
    ).rejects.toMatchObject({ code: "INVALID_SNAPSHOT" });
    expect(fetchAdapter).not.toHaveBeenCalled();
  });

  it("rejects invalid or tampered digests before network I/O", async () => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi.fn<typeof fetch>();

    await expect(
      publishObservatorySnapshot(
        { ...snapshot, source_digest: "f".repeat(64) },
        { ...config, fetch: fetchAdapter },
      ),
    ).rejects.toMatchObject({ code: "DIGEST_MISMATCH" });
    expect(fetchAdapter).not.toHaveBeenCalled();
  });

  it("inserts a schema-valid successful snapshot through Supabase REST", async () => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 201 }),
    );

    const result = await publishObservatorySnapshot(snapshot, {
      ...config,
      fetch: fetchAdapter,
    });

    expect(result).toEqual({ published: true, idempotent: false });
    expect(fetchAdapter).toHaveBeenCalledTimes(1);
    const [url, init] = fetchAdapter.mock.calls[0];
    expect(url).toBe(
      "https://project.supabase.co/rest/v1/observatory_snapshots",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      schema_version: snapshot.schema_version,
      generated_at: snapshot.generated_at,
      source_digest: snapshot.source_digest,
      payload: snapshot,
      summary: snapshot.summary,
      collector_version: snapshot.collector_version,
      status: "success",
    });
  });

  it("treats a duplicate digest as success only after confirming it exists", async () => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "23505" }), { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ source_digest: snapshot.source_digest }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const result = await publishObservatorySnapshot(snapshot, {
      ...config,
      fetch: fetchAdapter,
    });

    expect(result).toEqual({ published: false, idempotent: true });
    expect(fetchAdapter).toHaveBeenCalledTimes(2);
    expect(
      fetchAdapter.mock.calls.map(([, init]) => init?.redirect),
    ).toEqual(["error", "error"]);
    expect(fetchAdapter.mock.calls[1][0]).toContain(
      `/rest/v1/observatory_snapshots?source_digest=eq.${snapshot.source_digest}`,
    );
  });

  it("does not accept an unconfirmed duplicate", async () => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      publishObservatorySnapshot(snapshot, {
        ...config,
        fetch: fetchAdapter,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CONFIRM_FAILED" });
  });

  it("redacts credentials from network errors", async () => {
    const snapshot = await validSnapshot();
    const fetchAdapter = vi.fn<typeof fetch>().mockRejectedValue(
      new Error(`request failed for ${config.serviceRoleKey}`),
    );

    let caught: unknown;
    try {
      await publishObservatorySnapshot(snapshot, {
        ...config,
        fetch: fetchAdapter,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ObservatoryPublisherError);
    expect(caught).toMatchObject({ code: "PUBLISH_FAILED" });
    expect(String(caught)).not.toContain(config.serviceRoleKey);
  });
});
