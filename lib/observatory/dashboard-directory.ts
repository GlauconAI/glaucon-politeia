import type { ObservatoryAsset } from "@/lib/observatory/asset-schema";
import type { ObservatoryRegistrySnapshot } from "@/lib/observatory/schema";
import type { ObservatorySourceRepository } from "@/lib/observatory/source-repository-schema";

export type DashboardProjectEntry = {
  projectKey: string;
  name: string;
  title: string;
  owner: string;
  focus: string;
  status: string;
  description: string;
  sceneIds: string[];
  repositories: string[];
  lastActivityAt: string | null;
};

export type DashboardSkillInstance = {
  id: string;
  owner: string;
  health: ObservatoryAsset["health"];
  source: string;
  version: string | null;
  summary: string;
};

export type DashboardSkillEntry = {
  key: string;
  name: string;
  description: string;
  health: ObservatoryAsset["health"];
  owners: string[];
  sources: string[];
  versions: string[];
  agentCount: number;
  instanceCount: number;
  scope: "shared" | "private";
  instances: DashboardSkillInstance[];
};

function latestTimestamp(values: Array<string | null>): string | null {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export function buildProjectDirectory(
  registry: ObservatoryRegistrySnapshot,
  repositories: ObservatorySourceRepository[] = [],
): DashboardProjectEntry[] {
  const repositoriesByProject = new Map<
    string,
    ObservatorySourceRepository[]
  >();

  for (const repository of repositories) {
    for (const projectKey of repository.registry_project_keys) {
      repositoriesByProject.set(projectKey, [
        ...(repositoriesByProject.get(projectKey) ?? []),
        repository,
      ]);
    }
  }

  return registry.project_groups.flatMap((group) =>
    group.projects.map((project) => {
      const matchingRepositories =
        repositoriesByProject.get(project.project_key) ?? [];
      return {
        projectKey: project.project_key,
        name: project.name,
        title: project.title ?? project.name,
        owner: group.owner,
        focus: group.focus,
        status: project.status,
        description: project.description,
        sceneIds: [...project.scene_ids],
        repositories: matchingRepositories
          .map((repository) => repository.name)
          .sort((left, right) => left.localeCompare(right)),
        lastActivityAt: latestTimestamp(
          matchingRepositories.map(
            (repository) => repository.last_commit_at,
          ),
        ),
      };
    }),
  );
}

function labelValue(
  asset: ObservatoryAsset,
  key: string,
): string | undefined {
  return asset.labels.find((label) => label.key === key)?.value;
}

const healthPriority: Record<ObservatoryAsset["health"], number> = {
  failed: 5,
  degraded: 4,
  unknown: 3,
  disabled: 2,
  healthy: 1,
};

function aggregateHealth(
  assets: ObservatoryAsset[],
): ObservatoryAsset["health"] {
  return assets.reduce<ObservatoryAsset["health"]>(
    (current, asset) =>
      healthPriority[asset.health] > healthPriority[current]
        ? asset.health
        : current,
    "healthy",
  );
}

export function buildSkillDirectory(
  assets: ObservatoryAsset[],
): DashboardSkillEntry[] {
  const groups = new Map<string, ObservatoryAsset[]>();

  for (const asset of assets) {
    if (asset.kind !== "skill") continue;
    const key = asset.name.normalize("NFKC").trim().toLocaleLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), asset]);
  }

  return [...groups.entries()]
    .map(([key, instances]) => {
      const displayName = instances[0]?.name ?? key;
      const sortedInstances = [...instances].sort((left, right) =>
        left.owner.localeCompare(right.owner),
      );
      const owners = [
        ...new Set(sortedInstances.map((instance) => instance.owner)),
      ].sort((left, right) => left.localeCompare(right));
      const sources = [
        ...new Set(
          sortedInstances.map(
            (instance) =>
              labelValue(instance, "install_source") ?? instance.source,
          ),
        ),
      ].sort((left, right) => left.localeCompare(right));
      const versions = [
        ...new Set(
          sortedInstances
            .map((instance) => labelValue(instance, "version"))
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((left, right) => left.localeCompare(right));
      const description =
        sortedInstances
          .map((instance) => labelValue(instance, "description"))
          .find(Boolean) ??
        sortedInstances.find((instance) => instance.summary !== "Ready")
          ?.summary ??
        sortedInstances[0]?.summary ??
        "No description reported.";

      return {
        key,
        name: displayName,
        description,
        health: aggregateHealth(sortedInstances),
        owners,
        sources,
        versions,
        agentCount: owners.length,
        instanceCount: sortedInstances.length,
        scope: owners.length > 1 ? "shared" : "private",
        instances: sortedInstances.map((instance) => ({
          id: instance.id,
          owner: instance.owner,
          health: instance.health,
          source:
            labelValue(instance, "install_source") ?? instance.source,
          version: labelValue(instance, "version") ?? null,
          summary: instance.summary,
        })),
      } satisfies DashboardSkillEntry;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
