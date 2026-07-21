import { z } from "zod";

export const OBSERVATORY_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;
export const ORCHESTRATION_REGISTRY_SCHEMA_VERSION = "2.0.0" as const;
export const ORCHESTRATION_REGISTRY_LOGICAL_REFERENCE =
  "shared/projects/openclaw-orchestration-control/orchestration-system-design.html#orchestration-registry" as const;
export const DERIVED_PROJECT_KEY_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\/(?!\.{1,2}$)(?!\s*$)[^/\\\p{C}]+$/u;

const IsoTimestampSchema = z.iso.datetime({ offset: true });

export const ObservatorySourceSchema = z.strictObject({
  logical_reference: z.literal(ORCHESTRATION_REGISTRY_LOGICAL_REFERENCE),
  authority: z.literal("canonical"),
  owner: z.literal("Socrates"),
  collected_at: IsoTimestampSchema,
  freshness: z.enum(["fresh", "stale", "failed", "unknown"]),
  digest: z.string().regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 digest."),
});

export const ObservatoryProjectSchema = z.strictObject({
  project_key: z
    .string()
    .regex(
      DERIVED_PROJECT_KEY_PATTERN,
      "Expected a normalized-owner/original-project-name derived key.",
    )
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
  secondary_scene_count: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Source-derived count. The M1 whitelist has no secondary-scene detail array, so this count is not cross-validated by the snapshot schema.",
    ),
  execution_flow_count: z.number().int().nonnegative(),
});

export const ObservatoryRegistrySnapshotSchema = z
  .strictObject({
    schema_version: z.literal(OBSERVATORY_SNAPSHOT_SCHEMA_VERSION),
    registry_schema_version: z.literal(ORCHESTRATION_REGISTRY_SCHEMA_VERSION),
    registry_version: z.string().min(1),
    source: ObservatorySourceSchema,
    summary: ObservatoryRegistrySummarySchema,
    project_groups: z.array(ObservatoryProjectGroupSchema),
    scenes: z.array(ObservatorySceneSchema),
    execution_flows: z.array(ObservatoryExecutionFlowSchema),
  })
  .superRefine((snapshot, context) => {
    const projectCount = snapshot.project_groups.reduce(
      (count, group) => count + group.projects.length,
      0,
    );
    if (snapshot.summary.project_count !== projectCount) {
      context.addIssue({
        code: "custom",
        path: ["summary", "project_count"],
        message: `Expected ${projectCount} projects from project_groups.`,
      });
    }
    if (snapshot.summary.primary_scene_count !== snapshot.scenes.length) {
      context.addIssue({
        code: "custom",
        path: ["summary", "primary_scene_count"],
        message: `Expected ${snapshot.scenes.length} primary scenes from scenes.`,
      });
    }
    if (
      snapshot.summary.execution_flow_count !== snapshot.execution_flows.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["summary", "execution_flow_count"],
        message: `Expected ${snapshot.execution_flows.length} execution flows from execution_flows.`,
      });
    }

    const sceneIds = new Set<string>();
    snapshot.scenes.forEach((scene, index) => {
      if (sceneIds.has(scene.id)) {
        context.addIssue({
          code: "custom",
          path: ["scenes", index, "id"],
          message: `Duplicate canonical scene ID "${scene.id}".`,
        });
      }
      sceneIds.add(scene.id);
    });

    const flowIds = new Set<string>();
    snapshot.execution_flows.forEach((flow, index) => {
      if (flowIds.has(flow.id)) {
        context.addIssue({
          code: "custom",
          path: ["execution_flows", index, "id"],
          message: `Duplicate canonical execution-flow ID "${flow.id}".`,
        });
      }
      flowIds.add(flow.id);
    });

    const projectKeys = new Set<string>();
    snapshot.project_groups.forEach((group, groupIndex) => {
      group.projects.forEach((project, projectIndex) => {
        if (projectKeys.has(project.project_key)) {
          context.addIssue({
            code: "custom",
            path: [
              "project_groups",
              groupIndex,
              "projects",
              projectIndex,
              "project_key",
            ],
            message: `Duplicate derived project key "${project.project_key}".`,
          });
        }
        projectKeys.add(project.project_key);
      });
    });
  });

export type ObservatorySource = z.infer<typeof ObservatorySourceSchema>;
export type ObservatoryRegistrySnapshot = z.infer<
  typeof ObservatoryRegistrySnapshotSchema
>;
