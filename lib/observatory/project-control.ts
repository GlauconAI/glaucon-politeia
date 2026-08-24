import type {
  ProjectControlProject,
  ProjectControlSnapshot,
  ProjectControlStage,
} from "@/lib/observatory/project-control-schema";

export interface ProjectControlBinding {
  projectKey: string;
  planRevision: number;
  stageId: string;
  workPackageId: string;
}

export type ProjectControlBindingStatus =
  | "matched"
  | "stale_revision"
  | "unknown_project"
  | "unknown_stage"
  | "unknown_work_package"
  | "control_source_unavailable";

export function findProjectControlProject(
  snapshot: ProjectControlSnapshot | null,
  slug: string,
): ProjectControlProject | null {
  return (
    snapshot?.projects.find(
      (project) => project.project.project_slug === slug,
    ) ?? null
  );
}

export function topologicallyOrderProjectStages(
  project: ProjectControlProject,
): ProjectControlStage[] {
  const original = new Map(
    project.stages.map((stage, index) => [stage.stage_id, index]),
  );
  const byId = new Map(
    project.stages.map((stage) => [stage.stage_id, stage]),
  );
  const indegree = new Map(
    project.stages.map((stage) => [stage.stage_id, stage.dependency_ids.length]),
  );
  const children = new Map<string, string[]>();
  for (const stage of project.stages) {
    for (const dependency of stage.dependency_ids) {
      children.set(dependency, [
        ...(children.get(dependency) ?? []),
        stage.stage_id,
      ]);
    }
  }
  const ready = project.stages
    .filter((stage) => indegree.get(stage.stage_id) === 0)
    .map((stage) => stage.stage_id);
  const ordered: ProjectControlStage[] = [];
  while (ready.length > 0) {
    ready.sort(
      (left, right) => (original.get(left) ?? 0) - (original.get(right) ?? 0),
    );
    const id = ready.shift()!;
    ordered.push(byId.get(id)!);
    for (const child of children.get(id) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) ready.push(child);
    }
  }
  return ordered;
}

const decisionOrder = {
  evidence_blocked: 0,
  pending: 1,
  ready: 2,
  recorded: 3,
} as const;

export function listProjectControlDecisions(snapshot: ProjectControlSnapshot) {
  return snapshot.projects
    .flatMap((project) =>
      project.user_decisions.map((decision) => ({
        ...decision,
        projectTitle: project.project.title,
        projectSlug: project.project.project_slug,
        stageTitle:
          project.stages.find((stage) => stage.stage_id === decision.stage_id)
            ?.title ?? null,
        ownerAgentId:
          project.stages.find((stage) => stage.stage_id === decision.stage_id)
            ?.accountable_owner_agent_id ??
          project.project.accountable_owner_agent_id,
        gateTitle:
          project.gates.find((gate) => gate.gate_id === decision.gate_id)
            ?.title ?? null,
      })),
    )
    .sort(
      (left, right) =>
        decisionOrder[left.status] - decisionOrder[right.status] ||
        left.title.localeCompare(right.title),
    );
}

export function classifyProjectControlBinding(
  binding: ProjectControlBinding,
  snapshot: ProjectControlSnapshot | null,
): {
  status: ProjectControlBindingStatus;
  projectTitle: string | null;
  stageTitle: string | null;
  workPackageTitle: string | null;
} {
  const fallback = {
    projectTitle: null,
    stageTitle: null,
    workPackageTitle: null,
  };
  if (!snapshot) {
    return { status: "control_source_unavailable", ...fallback };
  }
  const project = snapshot.projects.find(
    (candidate) => candidate.project.project_key === binding.projectKey,
  );
  if (!project) return { status: "unknown_project", ...fallback };
  if (project.project.approved_plan_revision !== binding.planRevision) {
    return {
      status: "stale_revision",
      projectTitle: project.project.title,
      stageTitle: null,
      workPackageTitle: null,
    };
  }
  const stage = project.stages.find(
    (candidate) => candidate.stage_id === binding.stageId,
  );
  if (!stage) {
    return {
      status: "unknown_stage",
      projectTitle: project.project.title,
      stageTitle: null,
      workPackageTitle: null,
    };
  }
  const workPackage = project.work_packages.find(
    (candidate) =>
      candidate.work_package_id === binding.workPackageId &&
      candidate.stage_id === stage.stage_id,
  );
  if (!workPackage) {
    return {
      status: "unknown_work_package",
      projectTitle: project.project.title,
      stageTitle: stage.title,
      workPackageTitle: null,
    };
  }
  return {
    status: "matched",
    projectTitle: project.project.title,
    stageTitle: stage.title,
    workPackageTitle: workPackage.title,
  };
}
