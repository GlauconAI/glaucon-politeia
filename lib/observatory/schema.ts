import { z } from "zod";

export const OBSERVATORY_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;
export const ORCHESTRATION_REGISTRY_SCHEMA_VERSION = "2.0.0" as const;

const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "Expected an ISO 8601 timestamp with a timezone.",
  );

export const ObservatorySourceSchema = z.strictObject({
  logical_reference: z.string().min(1),
  authority: z.literal("canonical"),
  owner: z.literal("Socrates"),
  collected_at: IsoTimestampSchema,
  freshness: z.enum(["fresh", "stale", "failed", "unknown"]),
  digest: z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 digest."),
});

export const ObservatoryProjectSchema = z.strictObject({
  project_key: z
    .string()
    .min(3)
    .describe(
      "Derived identifier: normalize(project group owner) + '/' + the original canonical project name. It is not a canonical source ID.",
    ),
  name: z.string().min(1),
  title: z.string().min(1).optional(),
  status: z.string().min(1),
  description: z.string(),
  scene_ids: z.array(
    z
      .string()
      .min(1)
      .describe("Canonical scene ID copied from the project's explicit scenes list."),
  ),
});

export const ObservatoryProjectGroupSchema = z.strictObject({
  owner: z.string().min(1),
  focus: z.string(),
  projects: z.array(ObservatoryProjectSchema),
});

export const ObservatorySceneSchema = z.strictObject({
  id: z.string().min(1).describe("Canonical scene ID."),
  name: z.string().min(1),
  flow: z.string().min(1),
  description: z.string(),
  recommended_stage_owner: z.string().min(1).nullable(),
  stage_model: z.string().min(1).optional(),
});

export const ObservatoryExecutionFlowSchema = z.strictObject({
  id: z.string().min(1).describe("Canonical execution-flow ID."),
  name: z.string().min(1),
  tier_label: z.string(),
  use_when: z.string(),
  controller: z.string(),
  subagent_structure: z.string(),
  core_output: z.string(),
  topology: z.string().min(1),
  team_allowed: z.boolean(),
  completion_requirements: z.array(z.string().min(1)),
});

export const ObservatoryRegistrySummarySchema = z.strictObject({
  project_count: z.number().int().nonnegative(),
  primary_scene_count: z.number().int().nonnegative(),
  secondary_scene_count: z.number().int().nonnegative(),
  execution_flow_count: z.number().int().nonnegative(),
});

export const ObservatoryRegistrySnapshotSchema = z.strictObject({
  schema_version: z.literal(OBSERVATORY_SNAPSHOT_SCHEMA_VERSION),
  registry_schema_version: z.literal(ORCHESTRATION_REGISTRY_SCHEMA_VERSION),
  registry_version: z.string().min(1),
  source: ObservatorySourceSchema,
  summary: ObservatoryRegistrySummarySchema,
  project_groups: z.array(ObservatoryProjectGroupSchema),
  scenes: z.array(ObservatorySceneSchema),
  execution_flows: z.array(ObservatoryExecutionFlowSchema),
});

export type ObservatorySource = z.infer<typeof ObservatorySourceSchema>;
export type ObservatoryRegistrySnapshot = z.infer<
  typeof ObservatoryRegistrySnapshotSchema
>;
