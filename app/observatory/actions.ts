"use server";

import { revalidatePath } from "next/cache";

import { getCurrentObservatoryAdmin } from "@/lib/observatory/admin-auth";
import { loadObservatoryOverviewState } from "@/lib/observatory/dashboard-state";
import {
  AgentClaimCancellationInputSchema,
  AgentClaimPolicyInputSchema,
} from "@/lib/observatory/agent-claims";
import {
  createObservatoryRepository,
  ObservatoryRepositoryError,
  type ObservatoryRepositoryClient,
} from "@/lib/observatory/repository";
import { buildWorkTrackerProjectOptions } from "@/lib/observatory/work-tracker-projects";
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
  | "projectRef"
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
    formError: "Work Tracker is temporarily unavailable. Try again.",
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
        formError: "Work Tracker is temporarily unavailable. Try again.",
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
    case "CLAIM_ACTIVE":
      return "Cancel or wait for the active Agent Claim before changing this item.";
    case "CLAIM_POLICY_INVALID":
      return "Only owner-approved Low-risk Features or Bugs with bounded paths can be claimed.";
    case "CLAIM_VERSION_CONFLICT":
      return "This Agent Claim changed. Refresh before trying again.";
    case "PROJECT_CONTROL_BINDING_INVALID":
      return "Choose one complete Project, Plan, Stage, and Work Package binding.";
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
    "/work-tracker",
    `/work-tracker/items/${workItemId}`,
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
    projectRef: formValue(formData, "projectRef"),
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
        projectRef: fieldErrors.projectRef,
        idempotencyKey: fieldErrors.idempotencyKey,
      },
    };
  }

  let canonicalProjects;
  try {
    const overviewState = await loadObservatoryOverviewState();
    if (overviewState.status !== "ready") return operationalError();
    canonicalProjects = buildWorkTrackerProjectOptions(
      overviewState.snapshot.registry,
    );
  } catch {
    return operationalError();
  }
  if (
    !canonicalProjects.some(
      (project) => project.projectKey === validation.data.projectRef,
    )
  ) {
    return {
      status: "error",
      fieldErrors: {
        projectRef: ["Choose a Project from the canonical registry."],
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
    revalidatePath("/work-tracker");
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
    projectKey: nullableText(formData, "projectKey"),
    planRevision: nullableText(formData, "planRevision") === null
      ? null
      : Number(nullableText(formData, "planRevision")),
    stageId: nullableText(formData, "stageId"),
    workPackageId: nullableText(formData, "workPackageId"),
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

export async function configureObservatoryAgentClaimPolicyAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;

  const rawPaths = formData.get("authorizedPaths");
  const validation = AgentClaimPolicyInputSchema.safeParse({
    workItemId: formData.get("workItemId"),
    expectedVersion: versionValue(formData),
    riskLevel: formData.get("riskLevel"),
    enabled: formData.get("enabled") === "on",
    authorizedPaths:
      typeof rawPaths === "string"
        ? rawPaths
            .split(/\r?\n/u)
            .map((path) => path.trim())
            .filter(Boolean)
        : [],
    allowedActionClasses: formData.getAll("allowedActionClasses"),
  });
  if (!validation.success) {
    return fieldErrorState(validation.error.flatten().fieldErrors);
  }

  try {
    const item = await boundary.repository.configureAgentClaimPolicy(
      validation.data,
    );
    revalidateWorkItem(item.id);
    return { status: "success", version: item.version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function cancelObservatoryAgentClaimAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;

  const validation = AgentClaimCancellationInputSchema.safeParse({
    claimId: formData.get("claimId"),
    expectedClaimVersion: Number(formData.get("expectedClaimVersion")),
    expectedWorkItemVersion: Number(formData.get("expectedWorkItemVersion")),
  });
  const workItemId = formData.get("workItemId");
  if (
    !validation.success ||
    typeof workItemId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      workItemId,
    )
  ) {
    return fieldErrorState(
      validation.success
        ? { workItemId: ["Use a valid work item ID."] }
        : validation.error.flatten().fieldErrors,
    );
  }

  try {
    await boundary.repository.cancelAgentClaim(validation.data);
    revalidateWorkItem(workItemId);
    return {
      status: "success",
      version: validation.data.expectedWorkItemVersion + 1,
    };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}
