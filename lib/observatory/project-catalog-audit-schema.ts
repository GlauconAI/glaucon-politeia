import { z } from "zod";

export const PROJECT_CATALOG_AUDIT_SCHEMA_VERSION = "1.0.0" as const;
export const PROJECT_CATALOG_AUDIT_MAX_FINDINGS = 512;
export const PROJECT_CATALOG_AUDIT_MAX_TEXT_LENGTH = 512;

const FindingSchema = z
  .string()
  .min(1)
  .max(PROJECT_CATALOG_AUDIT_MAX_TEXT_LENGTH)
  .regex(/^[^\\\r\n]+$/u, "Audit findings must be safe logical labels.");

export const ProjectCatalogAuditSchema = z.strictObject({
  schema_version: z.literal(PROJECT_CATALOG_AUDIT_SCHEMA_VERSION),
  collected_at: z.iso.datetime({ offset: true }),
  status: z.enum(["clean", "drift", "failed"]),
  unregistered_surfaces: z.array(FindingSchema).max(PROJECT_CATALOG_AUDIT_MAX_FINDINGS),
  registered_paths_missing: z.array(FindingSchema).max(PROJECT_CATALOG_AUDIT_MAX_FINDINGS),
  mapping_incomplete: z.array(FindingSchema).max(PROJECT_CATALOG_AUDIT_MAX_FINDINGS),
  projection_drift: z.boolean(),
  mirror_drift: z.boolean(),
  snapshot_drift: z.boolean(),
  error_code: z
    .enum([
      "AUDIT_INPUT_UNAVAILABLE",
      "AUDIT_INPUT_INVALID",
      "AUDIT_READ_FAILED",
    ])
    .nullable(),
});

export type ProjectCatalogAudit = z.infer<typeof ProjectCatalogAuditSchema>;
