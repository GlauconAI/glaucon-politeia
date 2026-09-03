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

  it("uses a repository-owned server-only shim in Vitest", () => {
    const config = readFileSync(
      join(process.cwd(), "vitest.config.ts"),
      "utf8",
    );

    expect(config).toContain('"tests/server-only.ts"');
    expect(config).not.toContain("next/dist/compiled/server-only");
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
  const orderedQuery: {
    order: ReturnType<typeof vi.fn>;
    limit: typeof limit;
  } = {
    order: vi.fn(),
    limit,
  };
  orderedQuery.order.mockImplementation(() => orderedQuery);
  const order = orderedQuery.order;
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

function workTrackerClient(rows: Record<string, unknown[]>) {
  const queries: Record<
    string,
    {
      select: ReturnType<typeof vi.fn>;
      eq: ReturnType<typeof vi.fn>;
      is: ReturnType<typeof vi.fn>;
      order: ReturnType<typeof vi.fn>;
      maybeSingle: ReturnType<typeof vi.fn>;
    }
  > = {};
  const from = vi.fn((table: string) => {
    const result = rows[table] ?? [];
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      order: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: result[0] ?? null,
        error: null,
      }),
      then: (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
      ) => Promise.resolve(resolve({ data: result, error: null })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.order.mockReturnValue(query);
    queries[table] = {
      select: query.select,
      eq: query.eq,
      is: query.is,
      order: query.order,
      maybeSingle: query.maybeSingle,
    };
    return query;
  });

  return {
    client: {
      from,
      rpc: vi.fn(),
    } as unknown as ObservatoryRepositoryClient,
    from,
    queries,
  };
}

describe("getCurrentObservatoryAdmin", () => {
  it("returns null without creating clients when server configuration is absent", async () => {
    const createServerClient = vi.fn();

    await expect(
      getCurrentObservatoryAdmin({
        isConfigured: () => false,
        createServerClient,
      }),
    ).resolves.toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("does not query profiles for an anonymous caller", async () => {
    const from = vi.fn();

    await expect(
      getCurrentObservatoryAdmin({
        isConfigured: () => true,
        createServerClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
          },
          from,
        }),
      }),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("treats Supabase's missing-session response as an anonymous caller", async () => {
    const from = vi.fn();

    await expect(
      getCurrentObservatoryAdmin({
        isConfigured: () => true,
        createServerClient: async () => ({
          auth: {
            getUser: async () => ({
              data: { user: null },
              error: {
                name: "AuthSessionMissingError",
                status: 400,
                message: "Auth session missing!",
              },
            }),
          },
          from,
        }),
      }),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the authenticated server client to return only a 402V administrator profile", async () => {
    let profile: typeof adminProfile | { is_admin: false } | null = adminProfile;
    const maybeSingle = vi.fn(async () => ({ data: profile, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const dependencies = {
      isConfigured: () => true,
      createServerClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: "admin-1" } },
            error: null,
          }),
        },
        from,
      }),
    };

    await expect(getCurrentObservatoryAdmin(dependencies)).resolves.toEqual(
      adminProfile,
    );
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith(
      "user_id, username, display_name, is_admin",
    );
    expect(eq).toHaveBeenCalledWith("user_id", "admin-1");

    profile = { is_admin: false };
    await expect(getCurrentObservatoryAdmin(dependencies)).resolves.toBeNull();
  });

  it.each(["auth", "profile"] as const)(
    "fails closed with a stable dependency error on %s query failure",
    async (failureAt) => {
      const dependencyError = {
        code: "08006",
        message: "private connection detail",
      };
      const dependencies = {
        isConfigured: () => true,
        createServerClient: async () => ({
          auth: {
            getUser: async () => ({
              data: { user: { id: "admin-1" } },
              error: failureAt === "auth" ? dependencyError : null,
            }),
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: adminProfile,
                  error: failureAt === "profile" ? dependencyError : null,
                }),
              }),
            }),
          }),
        }),
      };

      await expect(
        getCurrentObservatoryAdmin(dependencies),
      ).rejects.toMatchObject({
        name: "ObservatoryAdminAuthError",
        code: "AUTH_DEPENDENCY_FAILED",
        message: "Observatory authorization is temporarily unavailable.",
      });
    },
  );

  it("wraps a thrown authorization dependency without leaking details", async () => {
    await expect(
      getCurrentObservatoryAdmin({
        isConfigured: () => true,
        createServerClient: async () => {
          throw new Error("private client construction detail");
        },
      }),
    ).rejects.toMatchObject({
      name: "ObservatoryAdminAuthError",
      code: "AUTH_DEPENDENCY_FAILED",
      message: "Observatory authorization is temporarily unavailable.",
    });
  });
});

describe("Project Version repository", () => {
  it("creates an audited version through its bounded RPC", async () => {
    const version = { id: "33333333-3333-4333-8333-333333333333", row_version: 1 };
    const boundary = repositoryClient({ rpcData: version });
    const repository = createObservatoryRepository(boundary.client);
    await expect(repository.createProjectVersion({
      projectKey: "plato/dashboard",
      versionLabel: "1.0.0",
      title: "First release",
      description: "Version management",
      targetDate: "2026-09-30",
      semver: "1.0.0",
      isReleaseTarget: true,
      milestoneRef: "OBS-M1",
      predecessorVersionId: null,
      roadmapRef: "docs/product-version-roadmap.md",
      approvedPlanRef: "plans/revision-3.md",
      acceptanceSummary: "Release contract accepted.",
      actualDate: null,
      dependenciesSummary: "Database contract v1.",
      dependenciesSatisfied: true,
      artifactsAccepted: true,
      verificationComplete: true,
      roadmapReconciled: true,
      userGateDecisionRef: "decision:user-gate-1",
    })).resolves.toEqual(version);
    expect(boundary.rpc).toHaveBeenCalledWith("create_observatory_project_version", {
      p_project_key: "plato/dashboard",
      p_version_label: "1.0.0",
      p_semver: "1.0.0",
      p_title: "First release",
      p_description: "Version management",
      p_target_date: "2026-09-30",
      p_is_release_target: true,
      p_milestone_ref: "OBS-M1",
      p_predecessor_version_id: null,
      p_roadmap_ref: "docs/product-version-roadmap.md",
      p_approved_plan_ref: "plans/revision-3.md",
      p_acceptance_summary: "Release contract accepted.",
      p_actual_date: null,
      p_dependencies_summary: "Database contract v1.",
      p_dependencies_satisfied: true,
      p_artifacts_accepted: true,
      p_verification_complete: true,
      p_roadmap_reconciled: true,
      p_user_gate_decision_ref: "decision:user-gate-1",
    });
  });

  it("ensures canonical Project Backlogs in one idempotent RPC", async () => {
    const versions = [{ id: "33333333-3333-4333-8333-333333333333", is_backlog: true }];
    const boundary = repositoryClient({ rpcData: versions });
    const repository = createObservatoryRepository(boundary.client);
    await expect(repository.ensureProjectBacklogs(["plato/dashboard"])).resolves.toEqual(versions);
    expect(boundary.rpc).toHaveBeenCalledWith("ensure_observatory_project_backlog_versions", {
      p_project_keys: ["plato/dashboard"],
    });
  });

  it("updates every mutable roadmap and release Gate field through one RPC", async () => {
    const version = { id: "33333333-3333-4333-8333-333333333333", row_version: 3 };
    const boundary = repositoryClient({ rpcData: version });
    const repository = createObservatoryRepository(boundary.client);
    const input = {
      projectVersionId: version.id,
      expectedVersion: 2,
      versionLabel: "1.1.0",
      semver: "1.1.0",
      title: "Second release",
      description: "Roadmap increment",
      targetDate: "2026-10-31",
      actualDate: null,
      isReleaseTarget: true,
      milestoneRef: "OBS-M2",
      predecessorVersionId: "22222222-2222-4222-8222-222222222222",
      roadmapRef: "docs/product-version-roadmap.md",
      approvedPlanRef: "plans/revision-4.md",
      acceptanceSummary: "Acceptance is explicit.",
      dependenciesSummary: "Version 1.0.0.",
      dependenciesSatisfied: true,
      artifactsAccepted: true,
      verificationComplete: true,
      roadmapReconciled: true,
      userGateDecisionRef: "decision:user-gate-2",
    } as const;

    await expect(repository.updateProjectVersion(input)).resolves.toEqual(version);
    expect(boundary.rpc).toHaveBeenCalledWith("update_observatory_project_version", {
      p_project_version_id: version.id,
      p_expected_version: 2,
      p_version_label: "1.1.0",
      p_semver: "1.1.0",
      p_title: "Second release",
      p_description: "Roadmap increment",
      p_target_date: "2026-10-31",
      p_actual_date: null,
      p_is_release_target: true,
      p_milestone_ref: "OBS-M2",
      p_predecessor_version_id: "22222222-2222-4222-8222-222222222222",
      p_roadmap_ref: "docs/product-version-roadmap.md",
      p_approved_plan_ref: "plans/revision-4.md",
      p_acceptance_summary: "Acceptance is explicit.",
      p_dependencies_summary: "Version 1.0.0.",
      p_dependencies_satisfied: true,
      p_artifacts_accepted: true,
      p_verification_complete: true,
      p_roadmap_reconciled: true,
      p_user_gate_decision_ref: "decision:user-gate-2",
    });
  });

  it.each([
    {
      error: { code: "40001", message: "OBSERVATORY_PROJECT_VERSION_CONFLICT" },
      expectedCode: "PROJECT_VERSION_CONFLICT",
    },
    {
      error: { code: "P0002", message: "OBSERVATORY_PROJECT_VERSION_NOT_FOUND" },
      expectedCode: "PROJECT_VERSION_NOT_FOUND",
    },
    {
      error: { code: "22023", message: "OBSERVATORY_PROJECT_VERSION_SEMVER_INVALID" },
      expectedCode: "PROJECT_VERSION_SEMVER_INVALID",
    },
    {
      error: { code: "23505", message: "duplicate key violates unique constraint observatory_project_versions_one_execution_idx" },
      expectedCode: "PROJECT_VERSION_EXECUTION_CONFLICT",
    },
    {
      error: { code: "23505", message: "duplicate key violates unique constraint observatory_project_versions_one_release_target_idx" },
      expectedCode: "PROJECT_VERSION_RELEASE_TARGET_CONFLICT",
    },
    {
      error: { code: "22023", message: "OBSERVATORY_PROJECT_VERSION_IMMUTABLE" },
      expectedCode: "PROJECT_VERSION_IMMUTABLE",
    },
    {
      error: { code: "23514", message: "OBSERVATORY_PROJECT_VERSION_RELEASE_GATE_INCOMPLETE" },
      expectedCode: "PROJECT_VERSION_RELEASE_GATE_INCOMPLETE",
    },
    {
      error: { code: "23514", message: "OBSERVATORY_PREDECESSOR_ORDER_INVALID" },
      expectedCode: "PROJECT_VERSION_PREDECESSOR_INVALID",
    },
    {
      error: { code: "22023", message: "OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED" },
      expectedCode: "PROJECT_VERSION_BINDING_CLOSED",
    },
    {
      error: { code: "22023", message: "OBSERVATORY_VERSION_BINDING_KIND_INVALID" },
      expectedCode: "VERSION_BINDING_KIND_INVALID",
    },
    {
      error: { code: "23514", message: "OBSERVATORY_WORK_ITEM_VERSION_SCOPE_IMMUTABLE" },
      expectedCode: "WORK_ITEM_VERSION_SCOPE_IMMUTABLE",
    },
  ])("maps Project Version markers before generic SQLSTATE errors", async ({ error, expectedCode }) => {
    const repository = createObservatoryRepository(repositoryClient({ rpcError: error }).client);

    await expect(repository.updateProjectVersion({
      projectVersionId: "33333333-3333-4333-8333-333333333333",
      expectedVersion: 1,
      versionLabel: "v1.0",
      title: "First release",
      description: "Version management",
      targetDate: null,
      semver: "1.0.0",
      isReleaseTarget: false,
      milestoneRef: null,
      predecessorVersionId: null,
      roadmapRef: null,
      approvedPlanRef: null,
      acceptanceSummary: "",
      actualDate: null,
      dependenciesSummary: "",
      dependenciesSatisfied: false,
      artifactsAccepted: false,
      verificationComplete: false,
      roadmapReconciled: false,
      userGateDecisionRef: null,
    })).rejects.toMatchObject({ code: expectedCode });
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
    expect(boundary.order).toHaveBeenCalledWith("created_at", {
      ascending: false,
    });
    expect(boundary.order.mock.calls).toEqual([
      ["generated_at", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
    expect(boundary.limit).toHaveBeenCalledWith(1);
  });

  it.each([
    {
      label: "forbidden",
      error: { code: "42501", message: "private policy detail" },
      expectedCode: "FORBIDDEN",
    },
    {
      label: "generic",
      error: { code: "08006", message: "private connection detail" },
      expectedCode: "SNAPSHOT_READ_FAILED",
    },
  ])("maps $label snapshot read errors", async ({ error, expectedCode }) => {
    const repository = createObservatoryRepository(
      repositoryClient({ snapshotError: error }).client,
    );

    await expect(
      repository.getLatestSuccessfulSnapshot(),
    ).rejects.toMatchObject({ code: expectedCode });
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
        projectRef: "plato/dashboard",
        projectVersionId: "33333333-3333-4333-8333-333333333333",
        versionBindingKind: "required",
        assignedAgentId: "plato",
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
        p_project_ref: "plato/dashboard",
        p_project_version_id: "33333333-3333-4333-8333-333333333333",
        p_version_binding_kind: "required",
        p_assigned_agent_id: "plato",
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
        projectRef: "plato/dashboard",
        projectVersionId: "33333333-3333-4333-8333-333333333333",
        versionBindingKind: "optional",
        assignedAgentId: "plato",
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
        acceptanceCriteria: "The refresh is visible.",
        priority: "high",
        ownerId: "22222222-2222-4222-8222-222222222222",
        assignedAgentId: "plato",
        projectRef: "asgard/archaea-gacha-game",
        projectVersionId: "33333333-3333-4333-8333-333333333333",
        versionBindingKind: "required",
        milestoneRef: "OBS-M3",
        projectKey: "asgard/archaea-gacha-game",
        planRevision: 3,
        stageId: "stage-05b",
        workPackageId: "wp-05b-coordinate-slice",
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
        p_acceptance_criteria: "The refresh is visible.",
        p_priority: "high",
        p_owner_id: "22222222-2222-4222-8222-222222222222",
        p_assigned_agent_id: "plato",
        p_project_ref: "asgard/archaea-gacha-game",
        p_project_version_id: "33333333-3333-4333-8333-333333333333",
        p_version_binding_kind: "required",
        p_milestone_ref: "OBS-M3",
        p_project_key: "asgard/archaea-gacha-game",
        p_plan_revision: 3,
        p_stage_id: "stage-05b",
        p_work_package_id: "wp-05b-coordinate-slice",
      },
    );
  });

  it("reports a missing work item explicitly", async () => {
    const repository = createObservatoryRepository(
      repositoryClient({
        rpcError: {
          code: "P0002",
          message: "OBSERVATORY_WORK_ITEM_NOT_FOUND",
        },
      }).client,
    );

    await expect(
      repository.updateWorkItem({
        workItemId: "missing-item",
        expectedVersion: 1,
        type: "bug",
        title: "Missing",
        description: "",
        acceptanceCriteria: "",
        priority: null,
        ownerId: null,
        assignedAgentId: "plato",
        projectRef: "plato/dashboard",
        projectVersionId: "33333333-3333-4333-8333-333333333333",
        versionBindingKind: "optional",
        milestoneRef: null,
        projectKey: null,
        planRevision: null,
        stageId: null,
        workPackageId: null,
      }),
    ).rejects.toMatchObject({ code: "WORK_ITEM_NOT_FOUND" });
  });

  it.each(["create", "update"] as const)(
    "maps a generic %s mutation failure",
    async (operation) => {
      const repository = createObservatoryRepository(
        repositoryClient({
          rpcError: { code: "08006", message: "private connection detail" },
        }).client,
      );

      const promise =
        operation === "create"
          ? repository.createQuickCapture({
              type: "idea",
              title: "Capture",
              description: "",
              projectRef: "plato/dashboard",
              projectVersionId: "33333333-3333-4333-8333-333333333333",
              versionBindingKind: "optional",
              assignedAgentId: "plato",
              state: "inbox",
              idempotencyKey: "capture-generic-error",
            })
          : repository.updateWorkItem({
              workItemId: "item-1",
              expectedVersion: 1,
              type: "idea",
              title: "Update",
              description: "",
              acceptanceCriteria: "",
              priority: null,
              ownerId: null,
              assignedAgentId: "plato",
              projectRef: "plato/dashboard",
              projectVersionId: "33333333-3333-4333-8333-333333333333",
              versionBindingKind: "optional",
              milestoneRef: null,
              projectKey: null,
              planRevision: null,
              stageId: null,
              workPackageId: null,
            });

      await expect(promise).rejects.toMatchObject({
        code:
          operation === "create"
            ? "WORK_ITEM_CREATE_FAILED"
            : "WORK_ITEM_UPDATE_FAILED",
      });
    },
  );

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
        projectRef: "plato/dashboard",
        projectVersionId: "33333333-3333-4333-8333-333333333333",
        versionBindingKind: "optional",
        assignedAgentId: "plato",
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

  it("reads board items and a detail timeline through admin-readable tables", async () => {
    const item = {
      id: "11111111-1111-4111-8111-111111111111",
      state: "triage",
      title: "Triage the board",
    };
    const event = {
      id: "event-1",
      work_item_id: item.id,
      event_type: "created",
    };
    const evidence = {
      id: "evidence-1",
      work_item_id: item.id,
      removed_at: null,
    };
    const claim = {
      id: "claim-1",
      work_item_id: item.id,
      agent_id: "codex-runner",
      status: "expired",
      claim_version: 2,
    };
    const boundary = workTrackerClient({
      observatory_work_items: [item],
      observatory_work_item_events: [event],
      observatory_work_item_evidence: [evidence],
      observatory_work_item_claims: [claim],
    });
    const repository = createObservatoryRepository(boundary.client);

    await expect(repository.listWorkItems()).resolves.toEqual([item]);
    await expect(repository.getWorkItem(item.id)).resolves.toEqual(item);
    await expect(repository.listWorkItemEvents(item.id)).resolves.toEqual([
      event,
    ]);
    await expect(repository.listWorkItemEvidence(item.id)).resolves.toEqual([
      evidence,
    ]);
    await expect(repository.listWorkItemClaims(item.id)).resolves.toEqual([
      claim,
    ]);
    await expect(repository.listActiveWorkItemClaims()).resolves.toEqual([
      claim,
    ]);
    expect(boundary.from).toHaveBeenCalledWith("observatory_work_items");
    expect(boundary.from).toHaveBeenCalledWith(
      "observatory_work_item_events",
    );
    expect(boundary.from).toHaveBeenCalledWith(
      "observatory_work_item_evidence",
    );
    expect(boundary.from).toHaveBeenCalledWith(
      "observatory_work_item_claims",
    );
    expect(
      boundary.queries.observatory_work_item_evidence.is,
    ).toHaveBeenCalledWith("removed_at", null);
    expect(
      boundary.queries.observatory_work_item_claims.eq,
    ).toHaveBeenCalledWith("status", "active");
  });

  it("configures policy and cancels claims only through audited admin RPCs", async () => {
    const boundary = repositoryClient({
      rpcData: { id: "item-1", version: 5 },
    });
    const repository = createObservatoryRepository(boundary.client);

    await repository.configureAgentClaimPolicy({
      workItemId: "11111111-1111-4111-8111-111111111111",
      expectedVersion: 4,
      riskLevel: "low",
      enabled: true,
      authorizedPaths: ["components/observatory", "tests"],
      allowedActionClasses: ["code_edit", "test"],
    });
    await repository.cancelAgentClaim({
      claimId: "22222222-2222-4222-8222-222222222222",
      expectedClaimVersion: 2,
      expectedWorkItemVersion: 5,
    });

    expect(boundary.rpc.mock.calls).toEqual([
      [
        "configure_observatory_agent_claim_policy",
        {
          p_work_item_id: "11111111-1111-4111-8111-111111111111",
          p_expected_version: 4,
          p_risk_level: "low",
          p_enabled: true,
          p_authorized_paths: ["components/observatory", "tests"],
          p_allowed_action_classes: ["code_edit", "test"],
        },
      ],
      [
        "cancel_observatory_work_item_claim",
        {
          p_claim_id: "22222222-2222-4222-8222-222222222222",
          p_expected_claim_version: 2,
          p_expected_work_item_version: 5,
        },
      ],
    ]);
  });

  it.each([
    ["OBSERVATORY_CLAIM_ACTIVE", "CLAIM_ACTIVE"],
    ["OBSERVATORY_CLAIM_POLICY_INVALID", "CLAIM_POLICY_INVALID"],
    ["OBSERVATORY_CLAIM_VERSION_CONFLICT", "CLAIM_VERSION_CONFLICT"],
  ] as const)("maps %s to %s", async (message, code) => {
    const repository = createObservatoryRepository(
      repositoryClient({
        rpcError: { code: "22023", message },
      }).client,
    );

    await expect(
      repository.configureAgentClaimPolicy({
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 4,
        riskLevel: "low",
        enabled: true,
        authorizedPaths: ["components/observatory"],
        allowedActionClasses: ["code_edit"],
      }),
    ).rejects.toMatchObject({ code });
  });

  it.each([
    {
      method: "transitionWorkItem",
      functionName: "transition_observatory_work_item",
      input: {
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 2,
        targetState: "ready",
      },
      arguments: {
        p_work_item_id: "11111111-1111-4111-8111-111111111111",
        p_expected_version: 2,
        p_target_state: "ready",
      },
    },
    {
      method: "addWorkItemEvidence",
      functionName: "add_observatory_work_item_evidence",
      input: {
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 2,
        label: "Gate evidence",
        url: "https://402v.com/dashboard",
      },
      arguments: {
        p_work_item_id: "11111111-1111-4111-8111-111111111111",
        p_expected_version: 2,
        p_label: "Gate evidence",
        p_url: "https://402v.com/dashboard",
      },
    },
    {
      method: "removeWorkItemEvidence",
      functionName: "remove_observatory_work_item_evidence",
      input: {
        workItemId: "11111111-1111-4111-8111-111111111111",
        evidenceId: "33333333-3333-4333-8333-333333333333",
        expectedVersion: 2,
      },
      arguments: {
        p_work_item_id: "11111111-1111-4111-8111-111111111111",
        p_evidence_id: "33333333-3333-4333-8333-333333333333",
        p_expected_version: 2,
      },
    },
  ])("calls $functionName atomically", async (scenario) => {
    const boundary = repositoryClient({
      rpcData: { id: scenario.input.workItemId, version: 3 },
    });
    const repository = createObservatoryRepository(boundary.client);

    await expect(
      (
        repository[
          scenario.method as
            | "transitionWorkItem"
            | "addWorkItemEvidence"
            | "removeWorkItemEvidence"
        ] as (input: typeof scenario.input) => Promise<unknown>
      )(scenario.input),
    ).resolves.toMatchObject({ version: 3 });
    expect(boundary.rpc).toHaveBeenCalledWith(
      scenario.functionName,
      scenario.arguments,
    );
  });

  it.each([
    {
      error: {
        code: "22023",
        message: "OBSERVATORY_INVALID_TRANSITION",
      },
      code: "INVALID_TRANSITION",
    },
    {
      error: {
        code: "23514",
        message: "OBSERVATORY_READY_GATE_FAILED",
      },
      code: "READY_GATE_FAILED",
    },
    {
      error: {
        code: "P0002",
        message: "OBSERVATORY_EVIDENCE_NOT_FOUND",
      },
      code: "EVIDENCE_NOT_FOUND",
    },
  ])("maps $code without leaking database details", async ({ error, code }) => {
    const repository = createObservatoryRepository(
      repositoryClient({ rpcError: error }).client,
    );

    await expect(
      repository.transitionWorkItem({
        workItemId: "11111111-1111-4111-8111-111111111111",
        expectedVersion: 2,
        targetState: "done",
      }),
    ).rejects.toMatchObject({ code });
  });
});
