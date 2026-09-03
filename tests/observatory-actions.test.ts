import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentAdmin: { user_id: "admin-1" } as { user_id: string } | null,
  authError: null as Error | null,
  serverClientError: null as Error | null,
  createQuickCapture: vi.fn(),
  updateWorkItem: vi.fn(),
  transitionWorkItem: vi.fn(),
  addWorkItemEvidence: vi.fn(),
  removeWorkItemEvidence: vi.fn(),
  configureAgentClaimPolicy: vi.fn(),
  cancelAgentClaim: vi.fn(),
  getProjectVersion: vi.fn(),
  createProjectVersion: vi.fn(),
  updateProjectVersion: vi.fn(),
  transitionProjectVersion: vi.fn(),
  revalidatePath: vi.fn(),
  loadOverviewState: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: async () => {
    if (mocks.authError) throw mocks.authError;
    return mocks.currentAdmin;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (mocks.serverClientError) throw mocks.serverClientError;
    return { from: vi.fn(), rpc: vi.fn() };
  },
}));

vi.mock("@/lib/observatory/dashboard-state", () => ({
  loadObservatoryOverviewState: mocks.loadOverviewState,
}));

vi.mock("@/lib/observatory/repository", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/observatory/repository")
  >();
  return {
    ...original,
    createObservatoryRepository: () => ({
      createQuickCapture: mocks.createQuickCapture,
      updateWorkItem: mocks.updateWorkItem,
      transitionWorkItem: mocks.transitionWorkItem,
      addWorkItemEvidence: mocks.addWorkItemEvidence,
      removeWorkItemEvidence: mocks.removeWorkItemEvidence,
      configureAgentClaimPolicy: mocks.configureAgentClaimPolicy,
      cancelAgentClaim: mocks.cancelAgentClaim,
      getProjectVersion: mocks.getProjectVersion,
      createProjectVersion: mocks.createProjectVersion,
      updateProjectVersion: mocks.updateProjectVersion,
      transitionProjectVersion: mocks.transitionProjectVersion,
    }),
  };
});

import {
  addObservatoryWorkItemEvidenceAction,
  captureObservatoryWorkItemAction,
  removeObservatoryWorkItemEvidenceAction,
  cancelObservatoryAgentClaimAction,
  configureObservatoryAgentClaimPolicyAction,
  createObservatoryProjectVersionAction,
  transitionObservatoryProjectVersionAction,
  transitionObservatoryWorkItemAction,
  type ObservatoryQuickCaptureActionState,
  updateObservatoryWorkItemAction,
  updateObservatoryProjectVersionAction,
} from "@/app/observatory/actions";
import { ObservatoryRepositoryError } from "@/lib/observatory/repository";

const initialState: ObservatoryQuickCaptureActionState = { status: "idle" };
const projectVersionId = "33333333-3333-4333-8333-333333333333";

function validFormData() {
  const formData = new FormData();
  formData.set("type", "feature");
  formData.set("title", "  Show stale sources  ");
  formData.set("description", "  Make freshness explicit.  ");
  formData.set("projectRef", "plato/dashboard");
  formData.set("projectVersionId", projectVersionId);
  formData.set("versionBindingKind", "required");
  formData.set("assignedAgentId", "plato");
  formData.set("idempotencyKey", "capture-20260721-1");
  return formData;
}

describe("captureObservatoryWorkItemAction", () => {
  beforeEach(() => {
    mocks.currentAdmin = { user_id: "admin-1" };
    mocks.authError = null;
    mocks.serverClientError = null;
    mocks.createQuickCapture.mockReset();
    mocks.createQuickCapture.mockResolvedValue({ id: "item-1" });
    mocks.getProjectVersion.mockReset();
    mocks.getProjectVersion.mockResolvedValue({
      id: projectVersionId,
      project_key: "plato/dashboard",
      status: "active",
    });
    mocks.revalidatePath.mockReset();
    mocks.loadOverviewState.mockReset();
    mocks.loadOverviewState.mockResolvedValue({
      status: "ready",
      snapshot: {
        agents: [{ id: "plato" }, { id: "aristotle" }],
        registry: {
          project_groups: [
            {
              owner: "plato",
              focus: "Product delivery",
              projects: [
                {
                  project_key: "plato/dashboard",
                  name: "dashboard",
                  title: "Dashboard",
                  status: "active",
                  description: "Operational system view.",
                  scene_ids: ["S13"],
                },
              ],
            },
          ],
        },
      },
    });
  });

  it("rejects unauthorized callers before validation or mutation", async () => {
    mocks.currentAdmin = null;

    await expect(
      captureObservatoryWorkItemAction(initialState, new FormData()),
    ).resolves.toEqual({
      status: "error",
      formError: "Administrator access is required.",
    });
    expect(mocks.createQuickCapture).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["authorization", "server client"] as const)(
    "returns a structured operational error when the %s dependency fails",
    async (dependency) => {
      if (dependency === "authorization") {
        mocks.authError = new Error("private auth outage detail");
      } else {
        mocks.serverClientError = new Error("private client outage detail");
      }

      await expect(
        captureObservatoryWorkItemAction(initialState, validFormData()),
      ).resolves.toEqual({
        status: "error",
        formError: "Work Tracker is temporarily unavailable. Try again.",
      });
      expect(mocks.createQuickCapture).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("returns structured field errors for untrusted form data", async () => {
    const formData = validFormData();
    formData.set("type", "task");
    formData.set("title", "   ");
    formData.set("idempotencyKey", "contains whitespace");

    const result = await captureObservatoryWorkItemAction(
      initialState,
      formData,
    );

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      throw new Error("Expected a validation error action state.");
    }
    expect(result.fieldErrors).toMatchObject({
      type: expect.any(Array),
      title: expect.any(Array),
      idempotencyKey: expect.any(Array),
    });
    expect(mocks.createQuickCapture).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("creates a normalized Quick Capture and revalidates Dashboard", async () => {
    const result = await captureObservatoryWorkItemAction(
      initialState,
      validFormData(),
    );

    expect(mocks.createQuickCapture).toHaveBeenCalledWith({
      type: "feature",
      title: "Show stale sources",
      description: "Make freshness explicit.",
      projectRef: "plato/dashboard",
      projectVersionId,
      versionBindingKind: "required",
      assignedAgentId: "plato",
      state: "inbox",
      idempotencyKey: "capture-20260721-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/work-tracker");
    expect(result).toEqual({ status: "success", workItemId: "item-1" });
  });

  it("rejects Projects that are not in the canonical registry", async () => {
    const formData = validFormData();
    formData.set("projectRef", "unknown/project");

    await expect(
      captureObservatoryWorkItemAction(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: {
        projectRef: ["Choose a Project from the canonical registry."],
      },
    });
    expect(mocks.createQuickCapture).not.toHaveBeenCalled();
  });

  it("rejects Assigned Agents that are not in the runtime Agent registry", async () => {
    const formData = validFormData();
    formData.set("assignedAgentId", "shared");

    await expect(
      captureObservatoryWorkItemAction(initialState, formData),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: {
        assignedAgentId: ["Choose an Agent from the runtime registry."],
      },
    });
    expect(mocks.createQuickCapture).not.toHaveBeenCalled();
  });

  it("rejects a version from another Project", async () => {
    mocks.getProjectVersion.mockResolvedValueOnce({
      id: projectVersionId,
      project_key: "amou/wenya-ai",
      status: "active",
    });

    await expect(
      captureObservatoryWorkItemAction(initialState, validFormData()),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: {
        projectVersionId: ["Choose a version from the selected Project."],
      },
    });
    expect(mocks.createQuickCapture).not.toHaveBeenCalled();
  });

  it.each(["released", "archived", "cancelled"])(
    "rejects a %s version during capture",
    async (status) => {
      mocks.getProjectVersion.mockResolvedValueOnce({
        id: projectVersionId,
        project_key: "plato/dashboard",
        status,
      });

      await expect(
        captureObservatoryWorkItemAction(initialState, validFormData()),
      ).resolves.toEqual({
        status: "error",
        fieldErrors: {
          projectVersionId: ["Choose an available Project Version."],
        },
      });
      expect(mocks.createQuickCapture).not.toHaveBeenCalled();
    },
  );

  it("fails closed when the canonical Project registry is unavailable", async () => {
    mocks.loadOverviewState.mockResolvedValue({ status: "empty" });

    await expect(
      captureObservatoryWorkItemAction(initialState, validFormData()),
    ).resolves.toEqual({
      status: "error",
      formError: "Work Tracker is temporarily unavailable. Try again.",
    });
    expect(mocks.createQuickCapture).not.toHaveBeenCalled();
  });

  it("defaults an omitted optional description", async () => {
    const formData = validFormData();
    formData.delete("description");

    await expect(
      captureObservatoryWorkItemAction(initialState, formData),
    ).resolves.toEqual({ status: "success", workItemId: "item-1" });
    expect(mocks.createQuickCapture).toHaveBeenCalledWith(
      expect.objectContaining({ description: "" }),
    );
  });

  it("keeps a committed capture successful when revalidation fails", async () => {
    mocks.revalidatePath.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    await expect(
      captureObservatoryWorkItemAction(initialState, validFormData()),
    ).resolves.toEqual({ status: "success", workItemId: "item-1" });
    expect(mocks.createQuickCapture).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/work-tracker");
  });

  it("returns a stable form error for duplicate idempotency conflicts", async () => {
    mocks.createQuickCapture.mockRejectedValue(
      new ObservatoryRepositoryError(
        "IDEMPOTENCY_CONFLICT",
        "The idempotency key was already used for different content.",
      ),
    );

    await expect(
      captureObservatoryWorkItemAction(initialState, validFormData()),
    ).resolves.toEqual({
      status: "error",
      formError:
        "This capture key was already used for different content. Refresh and try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("reports when a Project Version is archived during capture", async () => {
    mocks.createQuickCapture.mockRejectedValue(
      new ObservatoryRepositoryError(
        "PROJECT_VERSION_ARCHIVED",
        "The selected Project Version is archived.",
      ),
    );

    await expect(
      captureObservatoryWorkItemAction(initialState, validFormData()),
    ).resolves.toEqual({
      status: "error",
      formError: "That Project Version was archived. Refresh and choose another version.",
    });
  });

  it.each([
    {
      code: "PROJECT_VERSION_BINDING_CLOSED" as const,
      expected: "That Project Version no longer accepts Work Item bindings. Refresh and choose another version.",
    },
    {
      code: "VERSION_BINDING_KIND_INVALID" as const,
      expected: "Choose whether the Product Version binding is required or optional.",
    },
  ])("returns a stable capture error for $code", async ({ code, expected }) => {
    mocks.createQuickCapture.mockRejectedValue(
      new ObservatoryRepositoryError(code, "private database detail"),
    );

    await expect(
      captureObservatoryWorkItemAction(initialState, validFormData()),
    ).resolves.toEqual({ status: "error", formError: expected });
  });
});

describe("Project Version actions", () => {
  beforeEach(() => {
    mocks.currentAdmin = { user_id: "admin-1" };
    mocks.createProjectVersion.mockReset();
    mocks.updateProjectVersion.mockReset();
    mocks.transitionProjectVersion.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.loadOverviewState.mockReset();
    mocks.loadOverviewState.mockResolvedValue({
      status: "ready",
      snapshot: {
        agents: [{ id: "plato" }],
        registry: {
          project_groups: [{
            owner: "plato",
            focus: "Product delivery",
            projects: [{
              project_key: "plato/dashboard",
              name: "dashboard",
              title: "Dashboard",
              status: "active",
              description: "Operational system view.",
              scene_ids: ["S13"],
            }],
          }],
        },
      },
    });
  });

  it("rejects a version for a Project outside the canonical registry", async () => {
    const formData = new FormData();
    formData.set("projectKey", "plato/unknown");
    formData.set("versionLabel", "1.0.0");
    formData.set("title", "Unknown release");
    formData.set("description", "");
    formData.set("targetDate", "");

    await expect(
      createObservatoryProjectVersionAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: {
        projectKey: ["Choose a Project from the canonical registry."],
      },
    });
    expect(mocks.createProjectVersion).not.toHaveBeenCalled();
  });

  it("creates a normalized planned version", async () => {
    mocks.createProjectVersion.mockResolvedValue({ row_version: 1 });
    const formData = new FormData();
    formData.set("projectKey", " plato/dashboard ");
    formData.set("versionLabel", " 1.0.0 ");
    formData.set("title", " First release ");
    formData.set("description", " Stable versioning. ");
    formData.set("targetDate", "2026-09-30");
    formData.set("isReleaseTarget", "on");
    formData.set("milestoneRef", " OBS-M1 ");
    formData.set("roadmapRef", " docs/product-version-roadmap.md ");
    formData.set("approvedPlanRef", " plans/revision-3.md ");
    formData.set("acceptanceSummary", " Release contract accepted. ");
    formData.set("dependenciesSummary", " Database contract v1. ");
    formData.set("dependenciesSatisfied", "on");
    formData.set("artifactsAccepted", "on");
    formData.set("verificationComplete", "on");
    formData.set("roadmapReconciled", "on");
    formData.set("userGateDecisionRef", " decision:user-gate-1 ");

    await expect(
      createObservatoryProjectVersionAction({ status: "idle" }, formData),
    ).resolves.toEqual({ status: "success", version: 1 });
    expect(mocks.createProjectVersion).toHaveBeenCalledWith({
      projectKey: "plato/dashboard",
      versionLabel: "1.0.0",
      title: "First release",
      description: "Stable versioning.",
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
    });
  });

  it("updates and transitions using optimistic row versions", async () => {
    mocks.updateProjectVersion.mockResolvedValue({ row_version: 3 });
    mocks.transitionProjectVersion.mockResolvedValue({ row_version: 4 });
    const updateData = new FormData();
    updateData.set("projectVersionId", projectVersionId);
    updateData.set("expectedVersion", "2");
    updateData.set("versionLabel", "v1.0");
    updateData.set("semver", "1.0.0");
    updateData.set("title", "Release");
    updateData.set("description", "");
    updateData.set("targetDate", "");
    await expect(
      updateObservatoryProjectVersionAction({ status: "idle" }, updateData),
    ).resolves.toEqual({ status: "success", version: 3 });

    const transitionData = new FormData();
    transitionData.set("projectVersionId", projectVersionId);
    transitionData.set("expectedVersion", "3");
    transitionData.set("targetStatus", "released");
    await expect(
      transitionObservatoryProjectVersionAction({ status: "idle" }, transitionData),
    ).resolves.toEqual({ status: "success", version: 4 });
  });

  it.each([
    {
      code: "PROJECT_VERSION_EXECUTION_CONFLICT" as const,
      expected: "This Project already has an active or gate-ready version.",
    },
    {
      code: "PROJECT_VERSION_RELEASE_GATE_INCOMPLETE" as const,
      expected: "Complete required Work Items and every release Gate check before release.",
    },
    {
      code: "PROJECT_VERSION_IMMUTABLE" as const,
      expected: "Released and archived Project Versions cannot be edited.",
    },
  ])("returns a stable version action error for $code", async ({ code, expected }) => {
    mocks.transitionProjectVersion.mockRejectedValue(
      new ObservatoryRepositoryError(code, "private database detail"),
    );
    const formData = new FormData();
    formData.set("projectVersionId", projectVersionId);
    formData.set("expectedVersion", "3");
    formData.set("targetStatus", "released");

    await expect(
      transitionObservatoryProjectVersionAction({ status: "idle" }, formData),
    ).resolves.toEqual({ status: "error", formError: expected });
  });

  it("reports a committed version mutation as successful when cache revalidation fails", async () => {
    mocks.createProjectVersion.mockResolvedValue({ row_version: 1 });
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error("cache unavailable");
    });
    const formData = new FormData();
    formData.set("projectKey", "plato/dashboard");
    formData.set("versionLabel", "1.1.0");
    formData.set("title", "Second release");
    formData.set("description", "");
    formData.set("targetDate", "");

    await expect(
      createObservatoryProjectVersionAction({ status: "idle" }, formData),
    ).resolves.toEqual({ status: "success", version: 1 });
    expect(mocks.createProjectVersion).toHaveBeenCalledTimes(1);
  });
});

describe("Work Tracker mutation actions", () => {
  const workItemId = "11111111-1111-4111-8111-111111111111";
  const ownerId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    mocks.currentAdmin = { user_id: ownerId };
    mocks.authError = null;
    mocks.serverClientError = null;
    mocks.updateWorkItem.mockReset();
    mocks.transitionWorkItem.mockReset();
    mocks.addWorkItemEvidence.mockReset();
    mocks.removeWorkItemEvidence.mockReset();
    mocks.configureAgentClaimPolicy.mockReset();
    mocks.cancelAgentClaim.mockReset();
    mocks.getProjectVersion.mockReset();
    mocks.getProjectVersion.mockResolvedValue({
      id: projectVersionId,
      project_key: "plato/dashboard",
      status: "active",
    });
    for (const mutation of [
      mocks.updateWorkItem,
      mocks.transitionWorkItem,
      mocks.addWorkItemEvidence,
      mocks.removeWorkItemEvidence,
      mocks.configureAgentClaimPolicy,
      mocks.cancelAgentClaim,
    ]) {
      mutation.mockResolvedValue({ id: workItemId, version: 4 });
    }
    mocks.revalidatePath.mockReset();
    mocks.loadOverviewState.mockReset();
    mocks.loadOverviewState.mockResolvedValue({
      status: "ready",
      snapshot: {
        agents: [{ id: "plato" }, { id: "aristotle" }],
        registry: {
          project_groups: [
            {
              owner: "plato",
              focus: "Product delivery",
              projects: [
                {
                  project_key: "plato/dashboard",
                  name: "dashboard",
                  title: "Dashboard",
                  status: "active",
                  description: "Operational system view.",
                  scene_ids: ["S13"],
                },
              ],
            },
          ],
        },
      },
    });
  });

  it("rejects a transition before parsing when the caller is unauthorized", async () => {
    mocks.currentAdmin = null;

    await expect(
      transitionObservatoryWorkItemAction(
        { status: "idle" },
        new FormData(),
      ),
    ).resolves.toEqual({
      status: "error",
      formError: "Administrator access is required.",
    });
    expect(mocks.transitionWorkItem).not.toHaveBeenCalled();
  });

  it("updates normalized fields with the expected version", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("type", "feature");
    formData.set("title", "  Manual board  ");
    formData.set("description", "  Admin only.  ");
    formData.set("acceptanceCriteria", "  Reaches Done.  ");
    formData.set("priority", "high");
    formData.set("ownerId", ownerId);
    formData.set("assignedAgentId", "  plato  ");
    formData.set("projectRef", "  plato/dashboard  ");
    formData.set("projectVersionId", projectVersionId);
    formData.set("versionBindingKind", "required");
    formData.set("milestoneRef", "");
    formData.set("projectKey", "plato/dashboard");
    formData.set("planRevision", "3");
    formData.set("stageId", "stage-05b");
    formData.set("workPackageId", "wp-05b-coordinate-slice");

    await expect(
      updateObservatoryWorkItemAction({ status: "idle" }, formData),
    ).resolves.toEqual({ status: "success", version: 4 });
    expect(mocks.updateWorkItem).toHaveBeenCalledWith({
      workItemId,
      expectedVersion: 3,
      type: "feature",
      title: "Manual board",
      description: "Admin only.",
      acceptanceCriteria: "Reaches Done.",
      priority: "high",
      ownerId,
      assignedAgentId: "plato",
      projectRef: "plato/dashboard",
      projectVersionId,
      versionBindingKind: "required",
      milestoneRef: null,
      projectKey: "plato/dashboard",
      planRevision: 3,
      stageId: "stage-05b",
      workPackageId: "wp-05b-coordinate-slice",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/work-tracker");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/work-tracker/items/${workItemId}`,
    );
  });

  it("rejects a detail edit with a non-canonical Project", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("type", "feature");
    formData.set("title", "手册看板");
    formData.set("description", "仅管理员可用。");
    formData.set("acceptanceCriteria", "事项可以进入 Done。");
    formData.set("priority", "high");
    formData.set("ownerId", ownerId);
    formData.set("assignedAgentId", "plato");
    formData.set("projectRef", "unknown/project");
    formData.set("projectVersionId", projectVersionId);
    formData.set("milestoneRef", "OBS-M3");
    formData.set("projectKey", "");
    formData.set("planRevision", "");
    formData.set("stageId", "");
    formData.set("workPackageId", "");

    await expect(
      updateObservatoryWorkItemAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: {
        projectRef: ["Choose a Project from the canonical registry."],
      },
    });
    expect(mocks.updateWorkItem).not.toHaveBeenCalled();
  });

  it("rejects a detail edit assigned outside the runtime Agent registry", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("type", "feature");
    formData.set("title", "手册看板");
    formData.set("description", "仅管理员可用。");
    formData.set("acceptanceCriteria", "事项可以进入 Done。");
    formData.set("priority", "high");
    formData.set("ownerId", ownerId);
    formData.set("assignedAgentId", "unknown-agent");
    formData.set("projectRef", "plato/dashboard");
    formData.set("projectVersionId", projectVersionId);
    formData.set("milestoneRef", "");
    formData.set("projectKey", "");
    formData.set("planRevision", "");
    formData.set("stageId", "");
    formData.set("workPackageId", "");

    await expect(
      updateObservatoryWorkItemAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: {
        assignedAgentId: ["Choose an Agent from the runtime registry."],
      },
    });
    expect(mocks.updateWorkItem).not.toHaveBeenCalled();
  });

  it("moves a work item and returns a stable Ready Gate error", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("targetState", "ready");
    mocks.transitionWorkItem.mockRejectedValue(
      new ObservatoryRepositoryError(
        "READY_GATE_FAILED",
        "private database detail",
      ),
    );

    await expect(
      transitionObservatoryWorkItemAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      formError: "Add acceptance criteria, priority, and owner before Ready.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("adds and removes evidence through separate audited mutations", async () => {
    const addData = new FormData();
    addData.set("workItemId", workItemId);
    addData.set("expectedVersion", "3");
    addData.set("label", "  Production gate  ");
    addData.set("url", "https://402v.com/dashboard");

    await expect(
      addObservatoryWorkItemEvidenceAction({ status: "idle" }, addData),
    ).resolves.toEqual({ status: "success", version: 4 });
    expect(mocks.addWorkItemEvidence).toHaveBeenCalledWith({
      workItemId,
      expectedVersion: 3,
      label: "Production gate",
      url: "https://402v.com/dashboard",
    });

    const removeData = new FormData();
    removeData.set("workItemId", workItemId);
    removeData.set("evidenceId", "33333333-3333-4333-8333-333333333333");
    removeData.set("expectedVersion", "4");

    await expect(
      removeObservatoryWorkItemEvidenceAction(
        { status: "idle" },
        removeData,
      ),
    ).resolves.toEqual({ status: "success", version: 4 });
    expect(mocks.removeWorkItemEvidence).toHaveBeenCalledWith({
      workItemId,
      evidenceId: "33333333-3333-4333-8333-333333333333",
      expectedVersion: 4,
    });
  });

  it("returns a stable conflict message", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("targetState", "triage");
    mocks.transitionWorkItem.mockRejectedValue(
      new ObservatoryRepositoryError(
        "VERSION_CONFLICT",
        "private database detail",
      ),
    );

    await expect(
      transitionObservatoryWorkItemAction({ status: "idle" }, formData),
    ).resolves.toEqual({
      status: "error",
      formError: "This item changed. Refresh before trying again.",
    });
  });

  it("normalizes and applies an administrator-approved low-risk policy", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("riskLevel", "low");
    formData.set("enabled", "on");
    formData.set(
      "authorizedPaths",
      " components/observatory/WorkTrackerBoard.tsx \n tests/observatory-work-tracker-board.test.tsx ",
    );
    formData.append("allowedActionClasses", "code_edit");
    formData.append("allowedActionClasses", "test");

    await expect(
      configureObservatoryAgentClaimPolicyAction(
        { status: "idle" },
        formData,
      ),
    ).resolves.toEqual({ status: "success", version: 4 });
    expect(mocks.configureAgentClaimPolicy).toHaveBeenCalledWith({
      workItemId,
      expectedVersion: 3,
      riskLevel: "low",
      enabled: true,
      authorizedPaths: [
        "components/observatory/WorkTrackerBoard.tsx",
        "tests/observatory-work-tracker-board.test.tsx",
      ],
      allowedActionClasses: ["code_edit", "test"],
    });
  });

  it("rejects an enabled high-risk policy before calling the RPC", async () => {
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("expectedVersion", "3");
    formData.set("riskLevel", "high");
    formData.set("enabled", "on");
    formData.set("authorizedPaths", "components/observatory");
    formData.append("allowedActionClasses", "code_edit");

    const result = await configureObservatoryAgentClaimPolicyAction(
      { status: "idle" },
      formData,
    );
    expect(result.status).toBe("error");
    expect(mocks.configureAgentClaimPolicy).not.toHaveBeenCalled();
  });

  it("cancels an active claim with both expected versions", async () => {
    mocks.cancelAgentClaim.mockResolvedValueOnce({
      work_item: { id: workItemId, version: 5 },
    });
    const formData = new FormData();
    formData.set("workItemId", workItemId);
    formData.set("claimId", "33333333-3333-4333-8333-333333333333");
    formData.set("expectedClaimVersion", "2");
    formData.set("expectedWorkItemVersion", "4");

    await expect(
      cancelObservatoryAgentClaimAction({ status: "idle" }, formData),
    ).resolves.toEqual({ status: "success", version: 5 });
    expect(mocks.cancelAgentClaim).toHaveBeenCalledWith({
      claimId: "33333333-3333-4333-8333-333333333333",
      expectedClaimVersion: 2,
      expectedWorkItemVersion: 4,
    });
  });
});
