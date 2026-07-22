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

export async function captureObservatoryWorkItemAction(
  previousState: ObservatoryQuickCaptureActionState,
  formData: FormData,
): Promise<ObservatoryQuickCaptureActionState> {
  void previousState;
  const currentAdmin = await getCurrentObservatoryAdmin();

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

  try {
    const supabase = await createSupabaseServerClient();
    const repository = createObservatoryRepository(
      supabase as unknown as ObservatoryRepositoryClient,
    );
    const workItem = await repository.createQuickCapture(validation.data);
    revalidatePath("/observatory");
    return { status: "success", workItemId: workItem.id };
  } catch (error) {
    return { status: "error", formError: formError(error) };
  }
}
