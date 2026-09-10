import { z } from "zod";

export const OBSERVATORY_AGENT_ACTIVITY_MAX_AGENTS = 256;
export const OBSERVATORY_AGENT_ACTIVITY_MAX_GROUPS = 128;
export const OBSERVATORY_AGENT_ACTIVITY_MAX_TEXT_LENGTH = 256;

const ActivityTextSchema = z
  .string()
  .max(OBSERVATORY_AGENT_ACTIVITY_MAX_TEXT_LENGTH);
const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected a SHA-256 digest.");

export const ObservatoryActivityValueSourceSchema = z.enum([
  "configured",
  "override",
  "inherited",
  "unknown",
]);

export const ObservatoryAgentActivityRowSchema = z.strictObject({
  identity: Sha256Schema,
  label: ActivityTextSchema.min(1),
  model_label: ActivityTextSchema.min(1),
  model_source: ObservatoryActivityValueSourceSchema,
  thinking_level: ActivityTextSchema.min(1),
  thinking_source: ObservatoryActivityValueSourceSchema,
  run_state: z.enum(["running", "queued", "done", "failed", "unknown"]),
  active: z.boolean(),
  updated_at: IsoTimestampSchema,
});

export const ObservatoryAgentActivityEntrySchema = z.strictObject({
  agent_id: ActivityTextSchema.min(1),
  default_thinking_level: ActivityTextSchema.nullable(),
  latest_direct: ObservatoryAgentActivityRowSchema.nullable(),
  telegram_groups: z
    .array(ObservatoryAgentActivityRowSchema)
    .max(OBSERVATORY_AGENT_ACTIVITY_MAX_GROUPS),
});

export const ObservatoryAgentActivitySnapshotSchema = z.strictObject({
  status: z.enum(["ready", "partial", "unavailable"]),
  collected_at: IsoTimestampSchema,
  agents: z
    .array(ObservatoryAgentActivityEntrySchema)
    .max(OBSERVATORY_AGENT_ACTIVITY_MAX_AGENTS),
});

export type ObservatoryActivityValueSource = z.infer<
  typeof ObservatoryActivityValueSourceSchema
>;
export type ObservatoryAgentActivityRow = z.infer<
  typeof ObservatoryAgentActivityRowSchema
>;
export type ObservatoryAgentActivityEntry = z.infer<
  typeof ObservatoryAgentActivityEntrySchema
>;
export type ObservatoryAgentActivitySnapshot = z.infer<
  typeof ObservatoryAgentActivitySnapshotSchema
>;
