import { z } from "zod";

import { ObservatoryRegistrySnapshotSchema } from "#observatory-schema";

export const OBSERVATORY_COLLECTION_SCHEMA_VERSION = "1.0.0" as const;
export const OBSERVATORY_COLLECTOR_VERSION = "1.0.0" as const;
export const OBSERVATORY_AGENT_MAX_COUNT = 256;
export const OBSERVATORY_AGENT_MAX_TEXT_LENGTH = 512;

const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 digest.");
const AgentTextSchema = z.string().max(OBSERVATORY_AGENT_MAX_TEXT_LENGTH);

export const ObservatoryAgentSchema = z.strictObject({
  id: AgentTextSchema.min(1),
  display_name: AgentTextSchema,
  emoji: AgentTextSchema,
  model_label: AgentTextSchema,
  workspace_label: AgentTextSchema.min(1),
  binding_count: z.number().int().nonnegative(),
  default: z.boolean(),
});

export const ObservatoryRuntimeTaskTotalsSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  queued: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const ObservatoryRuntimeSchema = z.strictObject({
  runtime_version: AgentTextSchema.min(1),
  gateway_running: z.boolean(),
  gateway_reachable: z.boolean(),
  configured_agent_count: z.number().int().nonnegative(),
  task_totals: ObservatoryRuntimeTaskTotalsSchema,
});

export const ObservatoryCollectionSummarySchema = z.strictObject({
  freshness: z.enum(["fresh", "stale", "unknown"]),
  project_count: z.number().int().nonnegative(),
  primary_scene_count: z.number().int().nonnegative(),
  secondary_scene_count: z.number().int().nonnegative(),
  execution_flow_count: z.number().int().nonnegative(),
  agent_count: z.number().int().nonnegative(),
  binding_count: z.number().int().nonnegative(),
  configured_agent_count: z.number().int().nonnegative(),
  gateway_running: z.boolean(),
  gateway_reachable: z.boolean(),
  task_totals: ObservatoryRuntimeTaskTotalsSchema,
});

export const ObservatoryCollectionEnvelopeSchema = z
  .strictObject({
    schema_version: z.literal(OBSERVATORY_COLLECTION_SCHEMA_VERSION),
    status: z.literal("success"),
    generated_at: IsoTimestampSchema,
    source_digest: Sha256Schema,
    collector_version: z.literal(OBSERVATORY_COLLECTOR_VERSION),
    registry: ObservatoryRegistrySnapshotSchema,
    agents: z.array(ObservatoryAgentSchema).max(OBSERVATORY_AGENT_MAX_COUNT),
    runtime: ObservatoryRuntimeSchema,
    summary: ObservatoryCollectionSummarySchema,
  })
  .superRefine((snapshot, context) => {
    const expected = {
      freshness: snapshot.registry.source.freshness,
      ...snapshot.registry.summary,
      agent_count: snapshot.agents.length,
      binding_count: snapshot.agents.reduce(
        (count, agent) => count + agent.binding_count,
        0,
      ),
      configured_agent_count: snapshot.runtime.configured_agent_count,
      gateway_running: snapshot.runtime.gateway_running,
      gateway_reachable: snapshot.runtime.gateway_reachable,
      task_totals: snapshot.runtime.task_totals,
    };
    for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
      if (JSON.stringify(snapshot.summary[key]) !== JSON.stringify(expected[key])) {
        context.addIssue({
          code: "custom",
          path: ["summary", key],
          message: `Expected the safe ${key} projection from the validated payload.`,
        });
      }
    }
  });

export type ObservatoryCollectionEnvelope = z.infer<
  typeof ObservatoryCollectionEnvelopeSchema
>;
export type ObservatoryAgent = z.infer<typeof ObservatoryAgentSchema>;
export type ObservatoryRuntime = z.infer<typeof ObservatoryRuntimeSchema>;
