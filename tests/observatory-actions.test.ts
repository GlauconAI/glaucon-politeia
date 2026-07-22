import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentAdmin: { user_id: "admin-1" } as { user_id: string } | null,
  createQuickCapture: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/observatory/admin-auth", () => ({
  getCurrentObservatoryAdmin: async () => mocks.currentAdmin,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: vi.fn(), rpc: vi.fn() }),
}));

vi.mock("@/lib/observatory/repository", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/lib/observatory/repository")
  >();
  return {
    ...original,
    createObservatoryRepository: () => ({
      createQuickCapture: mocks.createQuickCapture,
    }),
  };
});

import {
  captureObservatoryWorkItemAction,
  type ObservatoryQuickCaptureActionState,
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

  it("creates a normalized Quick Capture and revalidates Observatory", async () => {
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
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/observatory");
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
