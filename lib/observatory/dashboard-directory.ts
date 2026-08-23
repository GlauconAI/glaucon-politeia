import type { ObservatoryAsset } from "@/lib/observatory/asset-schema";
import type { ObservatoryRegistrySnapshot } from "@/lib/observatory/schema";
import type { ObservatorySourceRepository } from "@/lib/observatory/source-repository-schema";
import type {
  ProjectExecutionLine,
  ProjectExecutionSnapshot,
} from "@/lib/observatory/project-execution-schema";

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

export type DashboardProjectExecutionEntry = {
  projectKey: string;
  title: string;
  owner: string;
  status: string;
  currentStage: string | null;
  currentGate: string | null;
  updatedAt: string | null;
  collectedAt: string | null;
  freshness: "fresh" | "stale" | "unknown";
  match: "matched" | "catalog_only" | "runtime_only";
  executionLines: ProjectExecutionLine[];
  summary: {
    executionLineCount: number;
    activeCount: number;
    waitingCount: number;
    blockedCount: number;
    completedCount: number;
    independentOwnerLineCount: number;
  };
};

const emptyExecutionSummary = {
  executionLineCount: 0,
  activeCount: 0,
  waitingCount: 0,
  blockedCount: 0,
  completedCount: 0,
  independentOwnerLineCount: 0,
};

function executionSummary(
  summary: ProjectExecutionSnapshot["projects"][number]["summary"],
): DashboardProjectExecutionEntry["summary"] {
  return {
    executionLineCount: summary.execution_line_count,
    activeCount: summary.active_count,
    waitingCount: summary.waiting_count,
    blockedCount: summary.blocked_count,
    completedCount: summary.completed_count,
    independentOwnerLineCount: summary.independent_owner_line_count,
  };
}

export function buildProjectExecutionDirectory(
  registry: ObservatoryRegistrySnapshot,
  snapshot: ProjectExecutionSnapshot | null,
): DashboardProjectExecutionEntry[] {
  const runtimeByKey = new Map(
    (snapshot?.projects ?? []).map((project) => [
      project.project.project_key,
      project,
    ]),
  );
  const catalogKeys = new Set<string>();
  const catalogEntries = registry.project_groups.flatMap((group) =>
    group.projects.map((project) => {
      catalogKeys.add(project.project_key);
      const runtime = runtimeByKey.get(project.project_key);
      if (!runtime) {
        return {
          projectKey: project.project_key,
          title: project.title ?? project.name,
          owner: group.owner,
          status: project.status,
          currentStage: null,
          currentGate: null,
          updatedAt: null,
          collectedAt: snapshot?.collected_at ?? null,
          freshness: "unknown" as const,
          match: "catalog_only" as const,
          executionLines: [],
          summary: { ...emptyExecutionSummary },
        };
      }
      return {
        projectKey: project.project_key,
        title: project.title ?? runtime.project.title,
        owner: runtime.project.owner_agent_id,
        status: runtime.project.status,
        currentStage: runtime.project.current_stage,
        currentGate: runtime.project.current_gate,
        updatedAt: runtime.project.updated_at,
        collectedAt: runtime.collected_at,
        freshness: runtime.project.freshness,
        match: "matched" as const,
        executionLines: runtime.execution_lines,
        summary: executionSummary(runtime.summary),
      };
    }),
  );
  const runtimeOnlyEntries = (snapshot?.projects ?? [])
    .filter((runtime) => !catalogKeys.has(runtime.project.project_key))
    .map((runtime) => ({
      projectKey: runtime.project.project_key,
      title: runtime.project.title,
      owner: runtime.project.owner_agent_id,
      status: runtime.project.status,
      currentStage: runtime.project.current_stage,
      currentGate: runtime.project.current_gate,
      updatedAt: runtime.project.updated_at,
      collectedAt: runtime.collected_at,
      freshness: runtime.project.freshness,
      match: "runtime_only" as const,
      executionLines: runtime.execution_lines,
      summary: executionSummary(runtime.summary),
    }));
  return [...catalogEntries, ...runtimeOnlyEntries];
}

export type DashboardSkillInstance = {
  id: string;
  owner: string;
  health: ObservatoryAsset["health"];
  source: string;
  version: string | null;
  summary: string;
};

export const dashboardSkillCategories = [
  "openclaw-built-in",
  "system-web",
  "shared-custom",
  "agent-scoped-custom",
] as const;

export type DashboardSkillCategory =
  (typeof dashboardSkillCategories)[number];

export const dashboardSkillCategoryLabels: Record<
  DashboardSkillCategory,
  string
> = {
  "openclaw-built-in": "OpenClaw built-in",
  "system-web": "System Web Skill",
  "shared-custom": "Shared custom",
  "agent-scoped-custom": "Agent-scoped custom",
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
  category: DashboardSkillCategory;
  hasAgentOverride: boolean;
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

const originSources = new Set([
  "openclaw-bundled",
  "agents-skills-personal",
]);

function classifySkill(
  sources: string[],
  agentCount: number,
  representedAgentCount: number,
): Pick<DashboardSkillEntry, "category" | "hasAgentOverride"> {
  const hasBundled = sources.includes("openclaw-bundled");
  const hasSystemWeb = sources.includes("agents-skills-personal");
  const hasCustom = sources.some((source) => !originSources.has(source));

  if (hasBundled) {
    return {
      category: "openclaw-built-in",
      hasAgentOverride: hasCustom,
    };
  }
  if (hasSystemWeb) {
    return {
      category: "system-web",
      hasAgentOverride: hasCustom,
    };
  }
  return {
    category:
      representedAgentCount > 0 && agentCount === representedAgentCount
        ? "shared-custom"
        : "agent-scoped-custom",
    hasAgentOverride: false,
  };
}

export function buildSkillDirectory(
  assets: ObservatoryAsset[],
): DashboardSkillEntry[] {
  const groups = new Map<string, ObservatoryAsset[]>();
  const representedAgentCount = new Set(
    assets
      .filter((asset) => asset.kind === "skill")
      .map((asset) => asset.owner),
  ).size;

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
        ...classifySkill(
          sources,
          owners.length,
          representedAgentCount,
        ),
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
