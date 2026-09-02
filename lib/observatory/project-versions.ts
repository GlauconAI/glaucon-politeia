import { z } from "zod";
import { DERIVED_PROJECT_KEY_PATTERN } from "@/lib/observatory/schema";

export const PROJECT_VERSION_STATUSES = [
  "planned",
  "active",
  "released",
  "archived",
] as const;

export type ProjectVersionStatus = (typeof PROJECT_VERSION_STATUSES)[number];

const transitions = {
  planned: ["active", "archived"],
  active: ["released", "archived"],
  released: ["archived"],
  archived: [],
} as const satisfies Record<ProjectVersionStatus, readonly ProjectVersionStatus[]>;

export const PROJECT_VERSION_STATUS_LABELS: Record<ProjectVersionStatus, string> = {
  planned: "计划中",
  active: "进行中",
  released: "已发布",
  archived: "已归档",
};

export function allowedProjectVersionTransitions(
  status: ProjectVersionStatus,
): ProjectVersionStatus[] {
  return [...transitions[status]];
}

const ProjectKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .regex(DERIVED_PROJECT_KEY_PATTERN);
const VersionLabelSchema = z.string().trim().min(1).max(64);
const VersionTitleSchema = z.string().trim().min(1).max(200);
const VersionDescriptionSchema = z.string().trim().max(4_000);
const TargetDateSchema = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .transform((value) => value || null);

export const ProjectVersionCreateInputSchema = z.strictObject({
  projectKey: ProjectKeySchema,
  versionLabel: VersionLabelSchema,
  title: VersionTitleSchema,
  description: VersionDescriptionSchema.default(""),
  targetDate: TargetDateSchema.default(null),
});

export const ProjectVersionUpdateInputSchema = z.strictObject({
  projectVersionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  versionLabel: VersionLabelSchema,
  title: VersionTitleSchema,
  description: VersionDescriptionSchema.default(""),
  targetDate: TargetDateSchema.default(null),
});

export const ProjectVersionTransitionInputSchema = z.strictObject({
  projectVersionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  targetStatus: z.enum(PROJECT_VERSION_STATUSES),
});

export type ProjectVersionCreateInput = z.infer<typeof ProjectVersionCreateInputSchema>;
export type ProjectVersionUpdateInput = z.infer<typeof ProjectVersionUpdateInputSchema>;
export type ProjectVersionTransitionInput = z.infer<typeof ProjectVersionTransitionInputSchema>;
