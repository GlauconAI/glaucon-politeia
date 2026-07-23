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
  revalidatePath: vi.fn(),
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
    }),
  };
});

import {
  addObservatoryWorkItemEvidenceAction,
  captureObservatoryWorkItemAction,
  removeObservatoryWorkItemEvidenceAction,
  cancelObservatoryAgentClaimAction,
  configureObservatoryAgentClaimPolicyAction,
  transitionObservatoryWorkItemAction,
  type ObservatoryQuickCaptureActionState,
  updateObservatoryWorkItemAction,
} from "@/app/observatory/actions";
import { ObservatoryRepositoryError } from "@/lib/observatory/repository";

const initialState: ObservatoryQuickCaptureActionState = { status: "idle" };

function validFormData() {
  const formData = new FormData();
  formData.set("type", "feature");
  formData.set("title", "  Show stale sources  ");
  formData.set("description", "  Make freshness explicit.  ");
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
    mocks.revalidatePath.mockReset();
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
        formError: "Dashboard is temporarily unavailable. Try again.",
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
      state: "inbox",
      idempotencyKey: "capture-20260721-1",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(result).toEqual({ status: "success", workItemId: "item-1" });
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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
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
    formData.set("projectRef", "  dashboard  ");
    formData.set("milestoneRef", "");

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
      projectRef: "dashboard",
      milestoneRef: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/dashboard/work-items/${workItemId}`,
    );
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
