import { createHash } from "node:crypto";
import { join } from "node:path";

import {
  extractOrchestrationRegistryPayload,
  parseOrchestrationRegistryHtml,
} from "#observatory-registry";
import type { ObservatoryRegistrySnapshot } from "#observatory-schema";
import {
  PROJECT_CATALOG_AUDIT_SCHEMA_VERSION,
  ProjectCatalogAuditSchema,
  type ProjectCatalogAudit,
} from "#observatory-project-catalog-audit-schema";

export interface ProjectCatalogAuditDependencies {
  readTextFile(path: string): Promise<string>;
  listDirectories(path: string): Promise<readonly string[]>;
  listFiles(path: string): Promise<readonly string[]>;
  now(): Date;
}

export interface ProjectCatalogAuditInput {
  registryHtml: string;
  registrySnapshot: ObservatoryRegistrySnapshot;
  projectionDirectory?: string;
  mirrorPath?: string;
}

export const PROJECT_CATALOG_PROJECTION_FILES = [
  "agent-endpoints.yaml",
  "execution-flows.yaml",
  "functional-roles.yaml",
  "orchestration-policy.yaml",
  "project-registry.yaml",
  "scene-registry.yaml",
] as const;

interface CanonicalProjectAuditRecord {
  name: string;
  mapping_incomplete?: boolean;
}

interface CanonicalProjectGroupAuditRecord {
  owner: string;
  root: string;
  projects: CanonicalProjectAuditRecord[];
}

interface CanonicalRegistryAuditRecord {
  project_groups: CanonicalProjectGroupAuditRecord[];
  [key: string]: unknown;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function parseCanonicalRegistryAuditRecord(
  registryHtml: string,
): CanonicalRegistryAuditRecord {
  const candidate = JSON.parse(
    extractOrchestrationRegistryPayload(registryHtml),
  ) as Partial<CanonicalRegistryAuditRecord>;
  if (!Array.isArray(candidate.project_groups)) {
    throw new Error("Missing project groups.");
  }
  for (const group of candidate.project_groups) {
    if (
      !group ||
      typeof group.owner !== "string" ||
      typeof group.root !== "string" ||
      !Array.isArray(group.projects) ||
      group.projects.some(
        (project) => !project || typeof project.name !== "string",
      )
    ) {
      throw new Error("Invalid project group audit mapping.");
    }
  }
  return candidate as CanonicalRegistryAuditRecord;
}

export function computeCanonicalRegistrySourceHash(registryHtml: string): string {
  const registry = parseCanonicalRegistryAuditRecord(registryHtml);
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(registry)))
    .digest("hex");
}

function registryContract(snapshot: ObservatoryRegistrySnapshot): unknown {
  return canonicalize({
    registry_schema_version: snapshot.registry_schema_version,
    registry_version: snapshot.registry_version,
    summary: snapshot.summary,
    project_groups: snapshot.project_groups,
    scenes: snapshot.scenes,
    execution_flows: snapshot.execution_flows,
  });
}

function failedAudit(
  collectedAt: string,
  errorCode:
    | "AUDIT_INPUT_UNAVAILABLE"
    | "AUDIT_INPUT_INVALID"
    | "AUDIT_READ_FAILED",
): ProjectCatalogAudit {
  return ProjectCatalogAuditSchema.parse({
    schema_version: PROJECT_CATALOG_AUDIT_SCHEMA_VERSION,
    collected_at: collectedAt,
    status: "failed",
    unregistered_surfaces: [],
    registered_paths_missing: [],
    mapping_incomplete: [],
    projection_drift: false,
    mirror_drift: false,
    snapshot_drift: false,
    error_code: errorCode,
  });
}

export async function collectProjectCatalogAudit(
  input: ProjectCatalogAuditInput,
  dependencies: ProjectCatalogAuditDependencies,
): Promise<ProjectCatalogAudit> {
  const collectedAt = dependencies.now().toISOString();
  if (!input.projectionDirectory || !input.mirrorPath) {
    return failedAudit(collectedAt, "AUDIT_INPUT_UNAVAILABLE");
  }
  const projectionDirectory = input.projectionDirectory;
  const mirrorPath = input.mirrorPath;
  let registry: CanonicalRegistryAuditRecord;
  let sourceHash: string;
  let expectedSnapshot: ObservatoryRegistrySnapshot;
  try {
    registry = parseCanonicalRegistryAuditRecord(input.registryHtml);
    sourceHash = computeCanonicalRegistrySourceHash(input.registryHtml);
    expectedSnapshot = parseOrchestrationRegistryHtml(input.registryHtml, {
      collected_at: input.registrySnapshot.source.collected_at,
      digest: input.registrySnapshot.source.digest,
    });
  } catch {
    return failedAudit(collectedAt, "AUDIT_INPUT_INVALID");
  }

  try {
    const groupDirectories = await Promise.all(
      registry.project_groups.map(async (group) => ({
        group,
        actual: [...(await dependencies.listDirectories(group.root))]
          .filter((name) => !name.startsWith(".") && name !== "README.md")
          .sort(),
      })),
    );
    const availableProjectionFiles = new Set(
      await dependencies.listFiles(projectionDirectory),
    );
    const projectionFiles = PROJECT_CATALOG_PROJECTION_FILES.filter((name) =>
      availableProjectionFiles.has(name),
    );
    const [mirror, ...projectionContents] = await Promise.all([
      dependencies.readTextFile(mirrorPath),
      ...projectionFiles.map((name) =>
        dependencies.readTextFile(join(projectionDirectory, name)),
      ),
    ]);

    const unregisteredSurfaces: string[] = [];
    const registeredPathsMissing: string[] = [];
    const mappingIncomplete: string[] = [];
    for (const { group, actual } of groupDirectories) {
      const registered = new Set(group.projects.map((project) => project.name));
      for (const name of actual) {
        if (!registered.has(name)) {
          unregisteredSurfaces.push(`${group.owner}/${name}`);
        }
      }
      for (const project of group.projects) {
        if (!actual.includes(project.name)) {
          registeredPathsMissing.push(`${group.owner}/${project.name}`);
        }
        if (project.mapping_incomplete === true) {
          mappingIncomplete.push(`${group.owner}/${project.name}`);
        }
      }
    }

    const projectionDrift =
      projectionContents.length !== PROJECT_CATALOG_PROJECTION_FILES.length ||
      projectionContents.some((content) => {
        const match = content.match(
          /^source_hash:\s*["']?([a-f0-9]{64})["']?\s*$/mu,
        );
        return !match || match[1] !== sourceHash;
      });
    const mirrorDrift = mirror !== input.registryHtml;
    const snapshotDrift =
      JSON.stringify(registryContract(expectedSnapshot)) !==
      JSON.stringify(registryContract(input.registrySnapshot));
    const sorted = (values: string[]) => values.sort((left, right) =>
      left.localeCompare(right),
    );
    const drift =
      unregisteredSurfaces.length > 0 ||
      registeredPathsMissing.length > 0 ||
      mappingIncomplete.length > 0 ||
      projectionDrift ||
      mirrorDrift ||
      snapshotDrift;

    return ProjectCatalogAuditSchema.parse({
      schema_version: PROJECT_CATALOG_AUDIT_SCHEMA_VERSION,
      collected_at: collectedAt,
      status: drift ? "drift" : "clean",
      unregistered_surfaces: sorted(unregisteredSurfaces),
      registered_paths_missing: sorted(registeredPathsMissing),
      mapping_incomplete: sorted(mappingIncomplete),
      projection_drift: projectionDrift,
      mirror_drift: mirrorDrift,
      snapshot_drift: snapshotDrift,
      error_code: null,
    });
  } catch {
    return failedAudit(collectedAt, "AUDIT_READ_FAILED");
  }
}
