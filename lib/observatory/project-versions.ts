import { z } from "zod";
import { DERIVED_PROJECT_KEY_PATTERN } from "@/lib/observatory/schema";

export const PROJECT_VERSION_STATUSES = [
  "planned",
  "active",
  "gate_ready",
  "released",
  "archived",
  "cancelled",
] as const;

export type ProjectVersionStatus = (typeof PROJECT_VERSION_STATUSES)[number];

const transitions = {
  planned: ["active", "cancelled"],
  active: ["gate_ready", "cancelled"],
  gate_ready: ["active", "released"],
  released: ["archived"],
  archived: [],
  cancelled: [],
} as const satisfies Record<ProjectVersionStatus, readonly ProjectVersionStatus[]>;

export const PROJECT_VERSION_STATUS_LABELS: Record<ProjectVersionStatus, string> = {
  planned: "计划中",
  active: "进行中",
  gate_ready: "待发布验收",
  released: "已发布",
  archived: "已归档",
  cancelled: "已取消",
};

export function compactProjectVersionLabel(input: {
  isBacklog: boolean;
  versionLabel: string;
}): string {
  if (input.isBacklog) return "待";

  const label = input.versionLabel.trim();
  const numericVersion = /^v?(\d+(?:\.\d+)*)$/iu.exec(label);
  if (!numericVersion) return label;

  const parts = numericVersion[1].split(".");
  while (parts.length > 1 && parts.at(-1) === "0") parts.pop();
  return `V${parts.join(".")}`;
}

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
const FormalSemVerSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);
const NullableReferenceSchema = z
  .union([z.string().trim().max(160), z.null()])
  .transform((value) => value || null);
const NullableVersionIdSchema = z
  .union([z.uuid(), z.literal(""), z.null()])
  .transform((value) => value || null);
const SummarySchema = z.string().trim().max(4_000);
const TargetDateSchema = z
  .union([z.iso.date(), z.literal(""), z.null()])
  .transform((value) => value || null);
const operationalFields = {
  semver: FormalSemVerSchema,
  isReleaseTarget: z.boolean(),
  milestoneRef: NullableReferenceSchema,
  predecessorVersionId: NullableVersionIdSchema,
  roadmapRef: NullableReferenceSchema,
  approvedPlanRef: NullableReferenceSchema,
  acceptanceSummary: SummarySchema,
  actualDate: TargetDateSchema,
  dependenciesSummary: SummarySchema,
  dependenciesSatisfied: z.boolean(),
  artifactsAccepted: z.boolean(),
  verificationComplete: z.boolean(),
  roadmapReconciled: z.boolean(),
  userGateDecisionRef: NullableReferenceSchema,
};

export const ProjectVersionCreateInputSchema = z.strictObject({
  projectKey: ProjectKeySchema,
  versionLabel: VersionLabelSchema,
  title: VersionTitleSchema,
  description: VersionDescriptionSchema.default(""),
  targetDate: TargetDateSchema.default(null),
  ...operationalFields,
});

export const ProjectVersionUpdateInputSchema = z.strictObject({
  projectVersionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  versionLabel: VersionLabelSchema,
  title: VersionTitleSchema,
  description: VersionDescriptionSchema.default(""),
  targetDate: TargetDateSchema.default(null),
  ...operationalFields,
});

export const ProjectVersionTransitionInputSchema = z.strictObject({
  projectVersionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  targetStatus: z.enum(PROJECT_VERSION_STATUSES),
});

export type ProjectVersionCreateInput = z.infer<typeof ProjectVersionCreateInputSchema>;
export type ProjectVersionUpdateInput = z.infer<typeof ProjectVersionUpdateInputSchema>;
export type ProjectVersionTransitionInput = z.infer<typeof ProjectVersionTransitionInputSchema>;
