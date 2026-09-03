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
import {
  ProjectVersionCreateInputSchema,
  ProjectVersionTransitionInputSchema,
  ProjectVersionUpdateInputSchema,
} from "@/lib/observatory/project-versions";
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
  | "projectVersionId"
  | "versionBindingKind"
  | "assignedAgentId"
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
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
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
    case "PROJECT_VERSION_ARCHIVED":
      return "That Project Version was archived. Refresh and choose another version.";
    case "PROJECT_VERSION_BINDING_CLOSED":
      return "That Project Version no longer accepts Work Item bindings. Refresh and choose another version.";
    case "VERSION_BINDING_KIND_INVALID":
      return "Choose whether the Product Version binding is required or optional.";
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

async function loadCanonicalWorkTrackerContext() {
  const overviewState = await loadObservatoryOverviewState();
  return overviewState.status === "ready"
    ? {
        projects: buildWorkTrackerProjectOptions(overviewState.snapshot.registry),
        agentIds: overviewState.snapshot.agents?.map((agent) => agent.id) ?? [],
      }
    : null;
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
    case "PROJECT_VERSION_DUPLICATE":
      return "This Project already has that version label.";
    case "PROJECT_VERSION_CONFLICT":
      return "This Project Version changed. Refresh before trying again.";
    case "PROJECT_VERSION_NOT_FOUND":
      return "This Project Version no longer exists.";
    case "PROJECT_VERSION_TRANSITION_INVALID":
      return "That Project Version status transition is not allowed.";
    case "PROJECT_VERSION_MISMATCH":
      return "Choose a version from the selected Project.";
    case "PROJECT_VERSION_REQUIRED":
      return "Choose a Project Version.";
    case "PROJECT_VERSION_ARCHIVED":
      return "Choose a Project Version that is not archived.";
    case "PROJECT_VERSION_BACKLOG_IMMUTABLE":
      return "The system Backlog version cannot be edited or transitioned.";
    case "PROJECT_VERSION_SEMVER_INVALID":
      return "Use a valid MAJOR.MINOR.PATCH version.";
    case "PROJECT_VERSION_EXECUTION_CONFLICT":
      return "This Project already has an active or gate-ready version.";
    case "PROJECT_VERSION_RELEASE_TARGET_CONFLICT":
      return "This Project already has a release target.";
    case "PROJECT_VERSION_IMMUTABLE":
      return "Released and archived Project Versions cannot be edited.";
    case "PROJECT_VERSION_RELEASE_GATE_INCOMPLETE":
      return "Complete required Work Items and every release Gate check before release.";
    case "PROJECT_VERSION_PREDECESSOR_INVALID":
      return "Choose an earlier version from the same Project as predecessor.";
    case "PROJECT_VERSION_BINDING_CLOSED":
      return "Released, archived, and cancelled versions reject new Work Item bindings.";
    case "VERSION_BINDING_KIND_INVALID":
      return "Choose whether the Product Version binding is required or optional.";
    case "WORK_ITEM_VERSION_SCOPE_IMMUTABLE":
      return "The Product Version binding cannot be changed after work starts.";
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

function projectVersionRejectsBindings(status: string) {
  return ["released", "archived", "cancelled"].includes(status);
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
    projectVersionId: formValue(formData, "projectVersionId"),
    versionBindingKind: formValue(formData, "versionBindingKind"),
    assignedAgentId: formValue(formData, "assignedAgentId"),
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
        projectVersionId: fieldErrors.projectVersionId,
        versionBindingKind: fieldErrors.versionBindingKind,
        assignedAgentId: fieldErrors.assignedAgentId,
        idempotencyKey: fieldErrors.idempotencyKey,
      },
    };
  }

  let canonicalContext;
  try {
    canonicalContext = await loadCanonicalWorkTrackerContext();
    if (!canonicalContext) return operationalError();
  } catch {
    return operationalError();
  }
  if (
    !canonicalContext.projects.some(
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
  if (!canonicalContext.agentIds.includes(validation.data.assignedAgentId)) {
    return {
      status: "error",
      fieldErrors: {
        assignedAgentId: ["Choose an Agent from the runtime registry."],
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

  let selectedVersion;
  try {
    selectedVersion = await repository.getProjectVersion(validation.data.projectVersionId);
  } catch {
    return operationalError();
  }
  if (!selectedVersion || projectVersionRejectsBindings(selectedVersion.status)) {
    return {
      status: "error",
      fieldErrors: { projectVersionId: ["Choose an available Project Version."] },
    };
  }
  if (selectedVersion.project_key !== validation.data.projectRef) {
    return {
      status: "error",
      fieldErrors: { projectVersionId: ["Choose a version from the selected Project."] },
    };
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
    assignedAgentId: nullableText(formData, "assignedAgentId"),
    projectRef: nullableText(formData, "projectRef"),
    projectVersionId: formData.get("projectVersionId"),
    versionBindingKind: formValue(formData, "versionBindingKind"),
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

  let canonicalContext;
  try {
    canonicalContext = await loadCanonicalWorkTrackerContext();
  } catch {
    return {
      status: "error",
      formError: "Work Tracker is temporarily unavailable. Try again.",
    };
  }
  if (!canonicalContext) {
    return {
      status: "error",
      formError: "Work Tracker is temporarily unavailable. Try again.",
    };
  }
  if (
    !canonicalContext.projects.some(
      (project) => project.projectKey === validation.data.projectRef,
    )
  ) {
    return fieldErrorState({
      projectRef: ["Choose a Project from the canonical registry."],
    });
  }
  if (!canonicalContext.agentIds.includes(validation.data.assignedAgentId)) {
    return fieldErrorState({
      assignedAgentId: ["Choose an Agent from the runtime registry."],
    });
  }

  let selectedVersion;
  try {
    selectedVersion = await boundary.repository.getProjectVersion(validation.data.projectVersionId);
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
  if (!selectedVersion || projectVersionRejectsBindings(selectedVersion.status)) {
    return fieldErrorState({ projectVersionId: ["Choose an available Project Version."] });
  }
  if (selectedVersion.project_key !== validation.data.projectRef) {
    return fieldErrorState({ projectVersionId: ["Choose a version from the selected Project."] });
  }

  try {
    const item = await boundary.repository.updateWorkItem(validation.data);
    revalidateWorkItem(item.id);
    return { status: "success", version: item.version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function createObservatoryProjectVersionAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;
  const validation = ProjectVersionCreateInputSchema.safeParse({
    projectKey: formData.get("projectKey"),
    versionLabel: formData.get("versionLabel"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    targetDate: formData.get("targetDate") ?? null,
    semver: nullableText(formData, "semver") ?? undefined,
    isReleaseTarget: formData.get("isReleaseTarget") === "on",
    milestoneRef: nullableText(formData, "milestoneRef"),
    predecessorVersionId: nullableText(formData, "predecessorVersionId"),
    roadmapRef: nullableText(formData, "roadmapRef"),
    approvedPlanRef: nullableText(formData, "approvedPlanRef"),
    acceptanceSummary: formData.get("acceptanceSummary") ?? "",
    actualDate: nullableText(formData, "actualDate"),
    dependenciesSummary: formData.get("dependenciesSummary") ?? "",
    dependenciesSatisfied: formData.get("dependenciesSatisfied") === "on",
    artifactsAccepted: formData.get("artifactsAccepted") === "on",
    verificationComplete: formData.get("verificationComplete") === "on",
    roadmapReconciled: formData.get("roadmapReconciled") === "on",
    userGateDecisionRef: nullableText(formData, "userGateDecisionRef"),
  });
  if (!validation.success) return fieldErrorState(validation.error.flatten().fieldErrors);

  let canonicalContext;
  try {
    canonicalContext = await loadCanonicalWorkTrackerContext();
  } catch {
    return {
      status: "error",
      formError: "Work Tracker is temporarily unavailable. Try again.",
    };
  }
  if (
    !canonicalContext?.projects.some(
      (project) => project.projectKey === validation.data.projectKey,
    )
  ) {
    return fieldErrorState({
      projectKey: ["Choose a Project from the canonical registry."],
    });
  }

  try {
    const version = await boundary.repository.createProjectVersion(validation.data);
    try {
      revalidatePath("/work-tracker");
    } catch {
      // The RPC already committed; cache invalidation remains best-effort.
    }
    return { status: "success", version: version.row_version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function updateObservatoryProjectVersionAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;
  const validation = ProjectVersionUpdateInputSchema.safeParse({
    projectVersionId: formData.get("projectVersionId"),
    expectedVersion: versionValue(formData),
    versionLabel: formData.get("versionLabel"),
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    targetDate: formData.get("targetDate") ?? null,
    semver: nullableText(formData, "semver"),
    isReleaseTarget: formData.get("isReleaseTarget") === "on",
    milestoneRef: nullableText(formData, "milestoneRef"),
    predecessorVersionId: nullableText(formData, "predecessorVersionId"),
    roadmapRef: nullableText(formData, "roadmapRef"),
    approvedPlanRef: nullableText(formData, "approvedPlanRef"),
    acceptanceSummary: formData.get("acceptanceSummary") ?? "",
    actualDate: nullableText(formData, "actualDate"),
    dependenciesSummary: formData.get("dependenciesSummary") ?? "",
    dependenciesSatisfied: formData.get("dependenciesSatisfied") === "on",
    artifactsAccepted: formData.get("artifactsAccepted") === "on",
    verificationComplete: formData.get("verificationComplete") === "on",
    roadmapReconciled: formData.get("roadmapReconciled") === "on",
    userGateDecisionRef: nullableText(formData, "userGateDecisionRef"),
  });
  if (!validation.success) return fieldErrorState(validation.error.flatten().fieldErrors);

  try {
    const version = await boundary.repository.updateProjectVersion(validation.data);
    try {
      revalidatePath("/work-tracker");
    } catch {
      // The RPC already committed; cache invalidation remains best-effort.
    }
    return { status: "success", version: version.row_version };
  } catch (error) {
    return { status: "error", formError: mutationFormError(error) };
  }
}

export async function transitionObservatoryProjectVersionAction(
  previousState: ObservatoryWorkItemMutationActionState,
  formData: FormData,
): Promise<ObservatoryWorkItemMutationActionState> {
  void previousState;
  const boundary = await authorizedRepository();
  if (!boundary.ok) return boundary.error;
  const validation = ProjectVersionTransitionInputSchema.safeParse({
    projectVersionId: formData.get("projectVersionId"),
    expectedVersion: versionValue(formData),
    targetStatus: formData.get("targetStatus"),
  });
  if (!validation.success) return fieldErrorState(validation.error.flatten().fieldErrors);

  try {
    const version = await boundary.repository.transitionProjectVersion(validation.data);
    try {
      revalidatePath("/work-tracker");
    } catch {
      // The RPC already committed; cache invalidation remains best-effort.
    }
    return { status: "success", version: version.row_version };
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
