"use server";

import { revalidatePath } from "next/cache";

import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import {
  createObservatoryRepository,
  ObservatoryRepositoryError,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import {
  ObservatoryEvidenceInputSchema,
  ObservatoryEvidenceRemovalInputSchema,
  ObservatoryQuickCaptureInputSchema,
  ObservatoryWorkItemTransitionInputSchema,
  ObservatoryWorkItemUpdateInputSchema,
} from "@/lib/observatory/work-items";
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

export type ObservatoryWorkItemMutationActionState =
  | { status: "idle" }
  | {
      status: "error";
      fieldErrors?: Partial<Record<string, string[] | undefined>>;
      formError?: string;
    }
  | { status: "success"; version: number };

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
    formError: "Dashboard is temporarily unavailable. Try again.",
  };
}

async function authorizedRepository(): Promise<
  | {
      ok: true;
      repository: ReturnType<typeof createObservatoryRepository>;
    }
  | {
      ok: false;
      error: ObservatoryWorkItemMutationActionState;
    }
> {
  try {
    const currentAdmin = await getCurrentObservatoryAdmin();
    if (!currentAdmin) {
      return {
        ok: false,
        error: {
          status: "error",
          formError: "Administrator access is required.",
        } satisfies ObservatoryWorkItemMutationActionState,
      };
    }
    const supabase = await createSupabaseServerClient();
    return {
      ok: true,
      repository: createObservatoryRepository(
        supabase as unknown as ObservatoryRepositoryClient,
      ),
    };
  } catch {
    return {
      ok: false,
      error: {
        status: "error",
        formError: "Dashboard is temporarily unavailable. Try again.",
      } satisfies ObservatoryWorkItemMutationActionState,
    };
  }
}

function mutationFormError(error: unknown): string {
  if (!(error instanceof ObservatoryRepositoryError)) {
    return "The work item could not be changed. Try again.";
  }
  switch (error.code) {
    case "FORBIDDEN":
      return "Administrator access is required.";
    case "VERSION_CONFLICT":
      return "This item changed. Refresh before trying again.";
    case "WORK_ITEM_NOT_FOUND":
      return "This work item no longer exists.";
    case "INVALID_TRANSITION":
      return "That state transition is not allowed.";
    case "READY_GATE_FAILED":
      return "Add acceptance criteria, priority, and owner before Ready.";
    case "EVIDENCE_NOT_FOUND":
      return "That evidence link is no longer active. Refresh and try again.";
    default:
      return "The work item could not be changed. Try again.";
  }
}

function versionValue(formData: FormData) {
  const raw = formData.get("expectedVersion");
  return typeof raw === "string" ? Number(raw) : Number.NaN;
}

function nullableText(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function fieldErrorState(
  fieldErrors: Record<string, string[] | undefined>,
): ObservatoryWorkItemMutationActionState {
  return { status: "error", fieldErrors };
}

function revalidateWorkItem(workItemId: string) {
  for (const path of [
    "/dashboard",
    `/dashboard/work-items/${workItemId}`,
  ]) {
    try {
      revalidatePath(path);
    } catch {
      // The RPC already committed; cache invalidation remains best-effort.
    }
  }
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
    revalidatePath("/dashboard");
  } catch {
    // The RPC already committed. Cache invalidation is best-effort here.
  }

  return { status: "success", workItemId: workItem.id };
}

export async function updateObservatoryWorkItemAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;

  const validation = ObservatoryWorkItemUpdateInputSchema.safeParse({
    workItemId: formData.get("workItemId"),
    expectedVersion: versionValue(formData),
    type: formData.get("type"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    acceptanceCriteria: formData.get("acceptanceCriteria") ?? "",
    priority: nullableText(formData, "priority"),
    ownerId: nullableText(formData, "ownerId"),
    projectRef: nullableText(formData, "projectRef"),
    milestoneRef: nullableText(formData, "milestoneRef"),
  });
  if (!validation.success) {
    return fieldErrorState(validation.error.flatten().fieldErrors);
  }

  try {
    const item = await boundary.repository.updateWorkItem(validation.data);
    revalidateWorkItem(item.id);
    return { status: "success", version: item.version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function transitionObservatoryWorkItemAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;

  const validation = ObservatoryWorkItemTransitionInputSchema.safeParse({
    workItemId: formData.get("workItemId"),
    expectedVersion: versionValue(formData),
    targetState: formData.get("targetState"),
  });
  if (!validation.success) {
    return fieldErrorState(validation.error.flatten().fieldErrors);
  }

  try {
    const item = await boundary.repository.transitionWorkItem(validation.data);
    revalidateWorkItem(item.id);
    return { status: "success", version: item.version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function addObservatoryWorkItemEvidenceAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;

  const validation = ObservatoryEvidenceInputSchema.safeParse({
    workItemId: formData.get("workItemId"),
    expectedVersion: versionValue(formData),
    label: formData.get("label"),
    url: formData.get("url"),
  });
  if (!validation.success) {
    return fieldErrorState(validation.error.flatten().fieldErrors);
  }

  try {
    const item = await boundary.repository.addWorkItemEvidence(validation.data);
    revalidateWorkItem(item.id);
    return { status: "success", version: item.version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function removeObservatoryWorkItemEvidenceAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;

  const validation = ObservatoryEvidenceRemovalInputSchema.safeParse({
    workItemId: formData.get("workItemId"),
    evidenceId: formData.get("evidenceId"),
    expectedVersion: versionValue(formData),
  });
  if (!validation.success) {
    return fieldErrorState(validation.error.flatten().fieldErrors);
  }

  try {
    const item = await boundary.repository.removeWorkItemEvidence(
      validation.data,
    );
    revalidateWorkItem(item.id);
    return { status: "success", version: item.version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}
