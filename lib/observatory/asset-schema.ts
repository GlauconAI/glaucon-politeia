import { z } from "zod";

export const OBSERVATORY_ASSET_KINDS = [
  "skill",
  "tool",
  "profile",
  "rule",
  "config",
  "knowledge",
  "agenda",
  "cron",
  "gateway",
  "runtime",
  "repository",
] as const;

export const OBSERVATORY_SOURCE_DOMAINS = [
  "core",
  "skills",
  "tools_profiles",
  "rules_config",
  "knowledge_agenda",
  "operations",
  "source_repositories",
  "project_executions",
] as const;

export const OBSERVATORY_ASSET_MAX_ITEMS = 5_000;
export const OBSERVATORY_RELATIONSHIP_MAX_ITEMS = 10_000;
export const OBSERVATORY_ASSET_MAX_TEXT_LENGTH = 512;

const SafeTextSchema = z
  .string()
  .max(OBSERVATORY_ASSET_MAX_TEXT_LENGTH)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Control characters are not allowed.",
  });
const LogicalIdSchema = z
  .string()
  .min(1)
  .max(OBSERVATORY_ASSET_MAX_TEXT_LENGTH)
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/u, "Expected a logical identifier.");
const LogicalSourceSchema = z
  .string()
  .min(1)
  .max(OBSERVATORY_ASSET_MAX_TEXT_LENGTH)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !/^[a-z]:[\\/]/iu.test(value) &&
      !value.includes("\\") &&
      !value.split("/").includes("..") &&
      /^[a-z0-9][a-z0-9._:/-]*$/iu.test(value),
    { message: "Expected a safe logical source reference." },
  );
const IsoTimestampSchema = z.iso.datetime({ offset: true });

export const ObservatoryAssetLabelSchema = z.strictObject({
  key: SafeTextSchema.min(1),
  value: SafeTextSchema,
});

export const ObservatoryAssetSchema = z.strictObject({
  id: LogicalIdSchema,
  kind: z.enum(OBSERVATORY_ASSET_KINDS),
  name: SafeTextSchema.min(1),
  owner: SafeTextSchema.min(1),
  authority: z.enum(["canonical", "declared", "observed", "derived"]),
  source: LogicalSourceSchema,
  collected_at: IsoTimestampSchema,
  freshness: z.enum(["fresh", "stale", "failed", "unknown"]),
  health: z.enum(["healthy", "degraded", "failed", "unknown", "disabled"]),
  summary: SafeTextSchema,
  labels: z.array(ObservatoryAssetLabelSchema).max(16),
});

export const ObservatoryRelationshipSchema = z.strictObject({
  from: LogicalIdSchema,
  to: LogicalIdSchema,
  kind: SafeTextSchema.min(1),
  authority: z.enum(["canonical", "declared", "observed", "derived"]),
  source: LogicalSourceSchema,
});

export const ObservatorySourceHealthSchema = z.strictObject({
  domain: z.enum(OBSERVATORY_SOURCE_DOMAINS),
  status: z.enum(["fresh", "stale", "failed", "unknown"]),
  health: z.enum(["healthy", "degraded", "failed", "unknown", "disabled"]),
  collected_at: IsoTimestampSchema,
  last_success_at: IsoTimestampSchema.nullable(),
  asset_count: z.number().int().nonnegative(),
  error_code: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/u, "Expected a stable diagnostic code.")
    .optional(),
});

export const ObservatoryAssetInventorySchema = z
  .strictObject({
    assets: z.array(ObservatoryAssetSchema).max(OBSERVATORY_ASSET_MAX_ITEMS),
    core_endpoint_ids: z
      .array(LogicalIdSchema)
      .max(OBSERVATORY_ASSET_MAX_ITEMS),
    relationships: z
      .array(ObservatoryRelationshipSchema)
      .max(OBSERVATORY_RELATIONSHIP_MAX_ITEMS),
    source_health: z
      .array(ObservatorySourceHealthSchema)
      .max(OBSERVATORY_SOURCE_DOMAINS.length),
  })
  .superRefine((inventory, context) => {
    const endpoints = new Set<string>();
    inventory.core_endpoint_ids.forEach((id, index) => {
      if (endpoints.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["core_endpoint_ids", index],
          message: `Duplicate core endpoint ID "${id}".`,
        });
      }
      endpoints.add(id);
    });
    inventory.assets.forEach((asset, index) => {
      if (endpoints.has(asset.id)) {
        context.addIssue({
          code: "custom",
          path: ["assets", index, "id"],
          message: `Duplicate asset ID "${asset.id}".`,
        });
      }
      endpoints.add(asset.id);
    });
    inventory.relationships.forEach((relationship, index) => {
      if (!endpoints.has(relationship.from)) {
        context.addIssue({
          code: "custom",
          path: ["relationships", index, "from"],
          message: `Unknown relationship endpoint "${relationship.from}".`,
        });
      }
      if (!endpoints.has(relationship.to)) {
        context.addIssue({
          code: "custom",
          path: ["relationships", index, "to"],
          message: `Unknown relationship endpoint "${relationship.to}".`,
        });
      }
    });
    const domains = new Set<string>();
    inventory.source_health.forEach((source, index) => {
      if (domains.has(source.domain)) {
        context.addIssue({
          code: "custom",
          path: ["source_health", index, "domain"],
          message: `Duplicate source health domain "${source.domain}".`,
        });
      }
      domains.add(source.domain);
    });
  });

export type ObservatoryAsset = z.infer<typeof ObservatoryAssetSchema>;
export type ObservatoryRelationship = z.infer<
  typeof ObservatoryRelationshipSchema
>;
export type ObservatorySourceHealth = z.infer<
  typeof ObservatorySourceHealthSchema
>;
export type ObservatoryAssetInventory = z.infer<
  typeof ObservatoryAssetInventorySchema
>;
export type ObservatorySourceDomain =
  (typeof OBSERVATORY_SOURCE_DOMAINS)[number];
