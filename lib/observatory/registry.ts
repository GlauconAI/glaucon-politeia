import { z } from "zod";

import {
  OBSERVATORY_SNAPSHOT_SCHEMA_VERSION,
  ORCHESTRATION_REGISTRY_SCHEMA_VERSION,
  ObservatoryRegistrySnapshotSchema,
  ObservatorySourceSchema,
  type ObservatoryRegistrySnapshot,
} from "#observatory-schema";

export const ORCHESTRATION_REGISTRY_SCRIPT_ID =
  "orchestration-registry" as const;
export const ORCHESTRATION_REGISTRY_LOGICAL_REFERENCE =
  "shared/projects/openclaw-orchestration-control/orchestration-system-design.html#orchestration-registry" as const;

export type OrchestrationRegistryErrorCode =
  | "REGISTRY_SCRIPT_MISSING"
  | "REGISTRY_JSON_MALFORMED"
  | "REGISTRY_SCHEMA_UNSUPPORTED"
  | "REGISTRY_SCHEMA_INVALID"
  | "REGISTRY_PROVENANCE_INVALID";

export class OrchestrationRegistryError extends Error {
  readonly code: OrchestrationRegistryErrorCode;

  constructor(code: OrchestrationRegistryErrorCode, message: string) {
    super(message);
    this.name = "OrchestrationRegistryError";
    this.code = code;
  }
}

const CanonicalProjectSchema = z
  .object({
    name: z.string().min(1),
    title: z.string().min(1).optional(),
    status: z.string().min(1),
    description: z.string(),
    scenes: z.array(z.string().min(1)),
  })
  .passthrough();

const CanonicalProjectGroupSchema = z
  .object({
    owner: z.string().min(1),
    focus: z.string(),
    projects: z.array(CanonicalProjectSchema),
  })
  .passthrough();

const CanonicalSceneSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    flow: z.string().min(1),
    description: z.string(),
    recommended_stage_owner: z.string().min(1).nullable(),
    stageModel: z.string().min(1).optional(),
  })
  .passthrough();

const CanonicalSceneGroupSchema = z
  .object({
    owner: z.string().min(1),
    focus: z.string(),
    scenes: z.array(CanonicalSceneSchema),
  })
  .passthrough();

const CanonicalExecutionFlowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    tier_label: z.string(),
    use_when: z.string(),
    controller: z.string(),
    subagent_structure: z.string(),
    core_output: z.string(),
    topology: z.string().min(1),
    team_allowed: z.boolean(),
    completion_requirements: z.array(z.string().min(1)),
  })
  .passthrough();

const CanonicalRegistrySchema = z
  .object({
    schema_version: z.literal(ORCHESTRATION_REGISTRY_SCHEMA_VERSION),
    registry_version: z.string().min(1),
    execution_flows: z.array(CanonicalExecutionFlowSchema),
    scene_groups: z.array(CanonicalSceneGroupSchema),
    product_project_stages: z.array(
      z.object({ id: z.string().min(1) }).passthrough(),
    ),
    project_groups: z.array(CanonicalProjectGroupSchema),
  })
  .passthrough();

const RegistryVersionSchema = z
  .object({ schema_version: z.string().min(1) })
  .passthrough();

const ProvenanceInputSchema = ObservatorySourceSchema.pick({
  collected_at: true,
  digest: true,
});

export type OrchestrationRegistryProvenanceInput = z.infer<
  typeof ProvenanceInputSchema
>;

function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern =
    /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

  for (const match of source.matchAll(attributePattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }

  return attributes;
}

export function extractOrchestrationRegistryPayload(html: string): string {
  const openingScriptPattern = /<script\b([^>]*)>/gi;

  for (const match of html.matchAll(openingScriptPattern)) {
    const attributes = parseAttributes(match[1]);
    if (
      attributes.get("id") !== ORCHESTRATION_REGISTRY_SCRIPT_ID ||
      attributes.get("type") !== "application/json"
    ) {
      continue;
    }

    const payloadStart = (match.index ?? 0) + match[0].length;
    const closingScriptPattern = /<\/script\s*>/gi;
    closingScriptPattern.lastIndex = payloadStart;
    const closingTag = closingScriptPattern.exec(html);
    if (closingTag?.index !== undefined) {
      return html.slice(payloadStart, closingTag.index);
    }
  }

  throw new OrchestrationRegistryError(
    "REGISTRY_SCRIPT_MISSING",
    'Missing <script id="orchestration-registry" type="application/json">.',
  );
}

function normalizeProjectOwner(owner: string): string {
  return owner.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function invalidStructureMessage(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "The canonical registry structure is invalid.";
  }

  const path = firstIssue.path.length > 0 ? firstIssue.path.join(".") : "root";
  return `The canonical registry structure is invalid at ${path}: ${firstIssue.message}`;
}

export function parseOrchestrationRegistryHtml(
  html: string,
  provenanceInput: OrchestrationRegistryProvenanceInput,
): ObservatoryRegistrySnapshot {
  const payload = extractOrchestrationRegistryPayload(html);
  let candidate: unknown;

  try {
    candidate = JSON.parse(payload);
  } catch {
    throw new OrchestrationRegistryError(
      "REGISTRY_JSON_MALFORMED",
      "The orchestration registry script contains malformed JSON.",
    );
  }

  const versionResult = RegistryVersionSchema.safeParse(candidate);
  if (!versionResult.success) {
    throw new OrchestrationRegistryError(
      "REGISTRY_SCHEMA_INVALID",
      invalidStructureMessage(versionResult.error),
    );
  }
  if (
    versionResult.data.schema_version !== ORCHESTRATION_REGISTRY_SCHEMA_VERSION
  ) {
    throw new OrchestrationRegistryError(
      "REGISTRY_SCHEMA_UNSUPPORTED",
      `Unsupported orchestration registry schema version "${versionResult.data.schema_version}"; expected "${ORCHESTRATION_REGISTRY_SCHEMA_VERSION}".`,
    );
  }

  const registryResult = CanonicalRegistrySchema.safeParse(candidate);
  if (!registryResult.success) {
    throw new OrchestrationRegistryError(
      "REGISTRY_SCHEMA_INVALID",
      invalidStructureMessage(registryResult.error),
    );
  }

  const provenanceResult = ProvenanceInputSchema.safeParse(provenanceInput);
  if (!provenanceResult.success) {
    throw new OrchestrationRegistryError(
      "REGISTRY_PROVENANCE_INVALID",
      `The registry provenance is invalid: ${provenanceResult.error.issues[0]?.message ?? "unknown validation error"}`,
    );
  }

  const registry = registryResult.data;
  const projectGroups = registry.project_groups.map((group) => ({
    owner: group.owner,
    focus: group.focus,
    projects: group.projects.map((project) => ({
      project_key: `${normalizeProjectOwner(group.owner)}/${project.name}`,
      name: project.name,
      ...(project.title === undefined ? {} : { title: project.title }),
      status: project.status,
      description: project.description,
      scene_ids: [...project.scenes],
    })),
  }));
  const scenes = registry.scene_groups.flatMap((group) =>
    group.scenes.map((scene) => ({
      id: scene.id,
      name: scene.name,
      flow: scene.flow,
      description: scene.description,
      recommended_stage_owner: scene.recommended_stage_owner,
      ...(scene.stageModel === undefined
        ? {}
        : { stage_model: scene.stageModel }),
    })),
  );
  const executionFlows = registry.execution_flows.map((flow) => ({
    id: flow.id,
    name: flow.name,
    tier_label: flow.tier_label,
    use_when: flow.use_when,
    controller: flow.controller,
    subagent_structure: flow.subagent_structure,
    core_output: flow.core_output,
    topology: flow.topology,
    team_allowed: flow.team_allowed,
    completion_requirements: [...flow.completion_requirements],
  }));

  return ObservatoryRegistrySnapshotSchema.parse({
    schema_version: OBSERVATORY_SNAPSHOT_SCHEMA_VERSION,
    registry_schema_version: registry.schema_version,
    registry_version: registry.registry_version,
    source: {
      logical_reference: ORCHESTRATION_REGISTRY_LOGICAL_REFERENCE,
      authority: "canonical",
      owner: "Socrates",
      collected_at: provenanceResult.data.collected_at,
      freshness: "fresh",
      digest: provenanceResult.data.digest,
    },
    summary: {
      project_count: projectGroups.reduce(
        (count, group) => count + group.projects.length,
        0,
      ),
      primary_scene_count: scenes.length,
      secondary_scene_count: registry.product_project_stages.length,
      execution_flow_count: executionFlows.length,
    },
    project_groups: projectGroups,
    scenes,
    execution_flows: executionFlows,
  });
}
