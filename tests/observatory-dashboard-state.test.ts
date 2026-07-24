import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheKeys: null as string[] | null,
  cacheOptions: null as
    | { revalidate?: number; tags?: string[] }
    | null,
  createAdminClient: vi.fn(),
  createRepository: vi.fn(),
  getLatestSuccessfulSnapshot: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    callback: () => Promise<unknown>,
    keys: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => {
    mocks.cacheKeys = keys;
    mocks.cacheOptions = options;
    return callback;
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/observatory/repository", () => ({
  createObservatoryRepository: mocks.createRepository,
}));

import {
  loadObservatoryOverviewState,
  readObservatoryOverviewState,
} from "@/lib/observatory/dashboard-state";

const registry = {
  schema_version: "1.0.0",
  registry_schema_version: "2.0.0",
  registry_version: "fixture-v2",
  source: {
    logical_reference:
      "shared/projects/openclaw-orchestration-control/orchestration-system-design.html#orchestration-registry",
    authority: "canonical",
    owner: "Socrates",
    collected_at: "2026-07-24T20:00:00.000Z",
    freshness: "fresh",
    digest: "a".repeat(64),
  },
  summary: {
    project_count: 0,
    primary_scene_count: 0,
    secondary_scene_count: 0,
    execution_flow_count: 0,
  },
  project_groups: [],
  scenes: [],
  execution_flows: [],
} as const;

const payload = {
  schema_version: "1.0.0",
  status: "success",
  generated_at: "2026-07-24T20:00:00.000Z",
  source_digest: "b".repeat(64),
  collector_version: "1.0.0",
  registry,
  agents: [],
  runtime: {
    runtime_version: "2026.7.1",
    gateway_running: false,
    gateway_reachable: false,
    configured_agent_count: 0,
    task_totals: {
      total: 0,
      active: 0,
      queued: 0,
      completed: 0,
      failed: 0,
    },
  },
  summary: {
    freshness: "fresh",
    project_count: 0,
    primary_scene_count: 0,
    secondary_scene_count: 0,
    execution_flow_count: 0,
    agent_count: 0,
    binding_count: 0,
    configured_agent_count: 0,
    gateway_running: false,
    gateway_reachable: false,
    task_totals: {
      total: 0,
      active: 0,
      queued: 0,
      completed: 0,
      failed: 0,
    },
  },
};

function row(value: unknown = payload) {
  return {
    id: "snapshot-1",
    schema_version: "1.0.0",
    generated_at: payload.generated_at,
    source_digest: payload.source_digest,
    payload: value,
    summary: payload.summary,
    collector_version: payload.collector_version,
    status: "success" as const,
    created_at: "2026-07-24T20:00:01.000Z",
  };
}

describe("Observatory Dashboard state", () => {
  beforeEach(() => {
    mocks.createAdminClient.mockReset();
    mocks.createRepository.mockReset();
    mocks.getLatestSuccessfulSnapshot.mockReset();
  });

  it("validates a Snapshot through an injectable cookie-free reader", async () => {
    const state = await readObservatoryOverviewState({
      getLatestSuccessfulSnapshot: async () => row(),
    });

    expect(state).toEqual({ status: "ready", snapshot: payload });
  });

  it("keeps empty, invalid, and failed reads safe", async () => {
    await expect(
      readObservatoryOverviewState({
        getLatestSuccessfulSnapshot: async () => null,
      }),
    ).resolves.toEqual({ status: "empty" });
    await expect(
      readObservatoryOverviewState({
        getLatestSuccessfulSnapshot: async () =>
          row({ ...payload, private_session: "secret" }),
      }),
    ).resolves.toEqual({
      status: "error",
      message: "The latest snapshot failed validation and was not rendered.",
    });
    await expect(
      readObservatoryOverviewState({
        getLatestSuccessfulSnapshot: async () => {
          throw new Error("private database detail");
        },
      }),
    ).resolves.toEqual({
      status: "error",
      message: "The latest snapshot could not be loaded. Try again later.",
    });
  });

  it("caches the default validated read for 60 seconds using an admin client", async () => {
    const adminClient = { from: vi.fn() };
    mocks.createAdminClient.mockReturnValue(adminClient);
    mocks.createRepository.mockReturnValue({
      getLatestSuccessfulSnapshot: mocks.getLatestSuccessfulSnapshot,
    });
    mocks.getLatestSuccessfulSnapshot.mockResolvedValue(row());

    await loadObservatoryOverviewState();

    expect(mocks.cacheKeys).toEqual(["observatory-overview-v1"]);
    expect(mocks.cacheOptions).toEqual({
      revalidate: 60,
      tags: ["observatory-overview"],
    });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.createRepository).toHaveBeenCalledWith(adminClient);
  });
});
