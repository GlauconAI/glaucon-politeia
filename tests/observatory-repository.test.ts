import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  createObservatoryRepository,
  ObservatoryRepositoryError,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";

const adminProfile = {
  user_id: "admin-1",
  username: "glaucon",
  display_name: "Glaucon",
  is_admin: true,
};

describe("Observatory server-only boundary", () => {
  it.each([
    "lib/observatory/admin-auth.ts",
    "lib/observatory/repository.ts",
  ])("marks %s as server-only", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8");

    expect(source).toMatch(/^import "server-only";/u);
  });
});

function repositoryClient(input?: {
  snapshotData?: unknown;
  snapshotError?: { code?: string; message: string } | null;
  rpcData?: unknown;
  rpcError?: { code?: string; message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: input?.snapshotData ?? null,
    error: input?.snapshotError ?? null,
  });
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue({
    data: input?.rpcData ?? null,
    error: input?.rpcError ?? null,
  });

  return {
    client: { from, rpc } as unknown as ObservatoryRepositoryClient,
    from,
    select,
    eq,
    order,
    limit,
    maybeSingle,
    rpc,
  };
}

describe("getCurrentObservatoryAdmin", () => {
  it("returns null without creating clients when server configuration is absent", async () => {
    const createServerClient = vi.fn();
    const createAdminClient = vi.fn();

    await expect(
      getCurrentObservatoryAdmin({
        isConfigured: () => false,
        createServerClient,
        createAdminClient,
      }),
    ).resolves.toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("does not query profiles for an anonymous caller", async () => {
    const createAdminClient = vi.fn();

    await expect(
      getCurrentObservatoryAdmin({
        isConfigured: () => true,
        createServerClient: async () => ({
          auth: { getUser: async () => ({ data: { user: null } }) },
        }),
        createAdminClient,
      }),
    ).resolves.toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns only a 402V administrator profile", async () => {
    let profile: typeof adminProfile | { is_admin: false } | null = adminProfile;
    const maybeSingle = vi.fn(async () => ({ data: profile }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));

    const dependencies = {
      isConfigured: () => true,
      createServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
      }),
      createAdminClient: () => ({ from: () => ({ select }) }),
    };

    await expect(getCurrentObservatoryAdmin(dependencies)).resolves.toEqual(
      adminProfile,
    );
    expect(select).toHaveBeenCalledWith(
      "user_id, username, display_name, is_admin",
    );
    expect(eq).toHaveBeenCalledWith("user_id", "admin-1");

    profile = { is_admin: false };
    await expect(getCurrentObservatoryAdmin(dependencies)).resolves.toBeNull();
  });
});

describe("Observatory repository", () => {
  it("reads only the latest successful snapshot", async () => {
    const snapshot = {
      id: "snapshot-1",
      schema_version: "1.0.0",
      generated_at: "2026-07-21T23:00:00.000Z",
      source_digest: "a".repeat(64),
      payload: { status: "success" },
      summary: { agent_count: 7 },
      collector_version: "1.0.0",
      status: "success",
      created_at: "2026-07-21T23:00:01.000Z",
    };
    const boundary = repositoryClient({ snapshotData: snapshot });
    const repository = createObservatoryRepository(boundary.client);

    await expect(repository.getLatestSuccessfulSnapshot()).resolves.toEqual(
      snapshot,
    );
    expect(boundary.from).toHaveBeenCalledWith("observatory_snapshots");
    expect(boundary.eq).toHaveBeenCalledWith("status", "success");
    expect(boundary.order).toHaveBeenCalledWith("generated_at", {
      ascending: false,
    });
    expect(boundary.limit).toHaveBeenCalledWith(1);
  });

  it("creates a Quick Capture through the atomic audited RPC", async () => {
    const workItem = {
      id: "item-1",
      type: "idea",
      title: "Map runtime health",
      description: "",
      state: "inbox",
      idempotency_key: "capture-1",
      version: 1,
      created_by: "admin-1",
      created_at: "2026-07-21T23:00:00.000Z",
      updated_at: "2026-07-21T23:00:00.000Z",
    };
    const boundary = repositoryClient({ rpcData: workItem });
    const repository = createObservatoryRepository(boundary.client);

    await expect(
      repository.createQuickCapture({
        type: "idea",
        title: "Map runtime health",
        description: "",
        state: "inbox",
        idempotencyKey: "capture-1",
      }),
    ).resolves.toEqual(workItem);
    expect(boundary.rpc).toHaveBeenCalledWith(
      "create_observatory_work_item",
      {
        p_type: "idea",
        p_title: "Map runtime health",
        p_description: "",
        p_idempotency_key: "capture-1",
      },
    );
    expect(boundary.from).not.toHaveBeenCalled();
  });

  it("reports a mismatched duplicate idempotency key explicitly", async () => {
    const boundary = repositoryClient({
      rpcError: {
        code: "23505",
        message: "OBSERVATORY_IDEMPOTENCY_CONFLICT",
      },
    });
    const repository = createObservatoryRepository(boundary.client);

    await expect(
      repository.createQuickCapture({
        type: "bug",
        title: "Different payload",
        description: "",
        state: "inbox",
        idempotencyKey: "capture-1",
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("passes the expected version and reports stale writes explicitly", async () => {
    const boundary = repositoryClient({
      rpcError: {
        code: "40001",
        message: "OBSERVATORY_VERSION_CONFLICT",
      },
    });
    const repository = createObservatoryRepository(boundary.client);

    await expect(
      repository.updateWorkItem({
        workItemId: "item-1",
        expectedVersion: 3,
        type: "feature",
        title: "Refresh runtime health",
        description: "Keep it current.",
      }),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(boundary.rpc).toHaveBeenCalledWith(
      "update_observatory_work_item",
      {
        p_work_item_id: "item-1",
        p_expected_version: 3,
        p_type: "feature",
        p_title: "Refresh runtime health",
        p_description: "Keep it current.",
      },
    );
  });

  it("maps database authorization failures without exposing their messages", async () => {
    const boundary = repositoryClient({
      rpcError: { code: "42501", message: "private database detail" },
    });
    const repository = createObservatoryRepository(boundary.client);

    await expect(
      repository.createQuickCapture({
        type: "idea",
        title: "Unauthorized",
        description: "",
        state: "inbox",
        idempotencyKey: "capture-2",
      }),
    ).rejects.toEqual(
      new ObservatoryRepositoryError(
        "FORBIDDEN",
        "Administrator access is required.",
      ),
    );
  });
});
