"use server";

import { revalidatePath } from "next/cache";

import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  createObservatoryRepository,
  ObservatoryRepositoryError,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { ObservatoryQuickCaptureInputSchema } from "@/lib/observatory/work-items";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ObservatoryQuickCaptureField =
  | "type"
  | "title"
  | "description"
  | "idempotencyKey";

export type ObservatoryQuickCaptureActionState =
  | { status: "idle" }
  | {
      status: "error";
      fieldErrors?: Partial<
        Record<ObservatoryQuickCaptureField, string[] | undefined>
      >;
      formError?: string;
    }
  | { status: "success"; workItemId: string };

function formValue(formData: FormData, name: ObservatoryQuickCaptureField) {
  return formData.get(name);
}

function formError(error: unknown): string {
  if (!(error instanceof ObservatoryRepositoryError)) {
    return "The work item could not be captured. Try again.";
  }

  switch (error.code) {
    case "FORBIDDEN":
      return "Administrator access is required.";
    case "IDEMPOTENCY_CONFLICT":
      return "This capture key was already used for different content. Refresh and try again.";
    default:
      return "The work item could not be captured. Try again.";
  }
}

function operationalError(): ObservatoryQuickCaptureActionState {
  return {
    status: "error",
    formError: "Observatory is temporarily unavailable. Try again.",
  };
}

export async function captureObservatoryWorkItemAction(
  previousState: ObservatoryQuickCaptureActionState,
  formData: FormData,
): Promise<ObservatoryQuickCaptureActionState> {
  void previousState;
  let currentAdmin;
  try {
    currentAdmin = await getCurrentObservatoryAdmin();
  } catch {
    return operationalError();
  }

  if (!currentAdmin) {
    return {
      status: "error",
      formError: "Administrator access is required.",
    };
  }

  const validation = ObservatoryQuickCaptureInputSchema.safeParse({
    type: formValue(formData, "type"),
    title: formValue(formData, "title"),
    description: formValue(formData, "description") ?? undefined,
    idempotencyKey: formValue(formData, "idempotencyKey"),
  });

  if (!validation.success) {
    const { fieldErrors } = validation.error.flatten();
    return {
      status: "error",
      fieldErrors: {
        type: fieldErrors.type,
        title: fieldErrors.title,
        description: fieldErrors.description,
        idempotencyKey: fieldErrors.idempotencyKey,
      },
    };
  }

  let repository;
  try {
    const supabase = await createSupabaseServerClient();
    repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
  } catch {
    return operationalError();
  }

  let workItem;
  try {
    workItem = await repository.createQuickCapture(validation.data);
  } catch (error) {
    return { status: "error", formError: formError(error) };
  }

  try {
    revalidatePath("/observatory");
  } catch {
    // The RPC already committed. Cache invalidation is best-effort here.
  }

  return { status: "success", workItemId: workItem.id };
}
