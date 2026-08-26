import type { ObservatoryWorkItemRow } from "@/lib/observatory/repository";
import type { ObservatoryRegistrySnapshot } from "@/lib/observatory/schema";

export type WorkTrackerProjectOption = {
  projectKey: string;
  title: string;
  owner: string;
  status: string;
};

export function buildWorkTrackerProjectOptions(
  registry: ObservatoryRegistrySnapshot,
): WorkTrackerProjectOption[] {
  return registry.project_groups
    .flatMap((group) =>
      group.projects.map((project) => ({
        projectKey: project.project_key,
        title: project.title ?? project.name,
        owner: group.owner,
        status: project.status,
      })),
    )
    .sort(
      (left, right) =>
        left.title.localeCompare(right.title, "en") ||
        left.projectKey.localeCompare(right.projectKey, "en"),
    );
}

export function resolveWorkItemProject(
  item: Pick<ObservatoryWorkItemRow, "project_ref" | "project_key">,
  projects: WorkTrackerProjectOption[],
): WorkTrackerProjectOption | null {
  const reference = item.project_key ?? item.project_ref?.trim() ?? "";
  if (!reference) return null;

  return (
    projects.find((project) => project.projectKey === reference) ??
    projects.find((project) => project.title === reference) ??
    null
  );
}

export function matchesWorkTrackerProject(
  project: WorkTrackerProjectOption,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [project.title, project.projectKey, project.owner, project.status]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}
