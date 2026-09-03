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
const VersionTitleSchema = z.string().trim().min(1).max(200);
const VersionDescriptionSchema = z.string().trim().max(4_000);
const FormalSemVerSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);
const ProjectVersionCreateLabelSchema = FormalSemVerSchema;
const ProjectVersionUpdateLabelSchema = z.string().trim().min(1).max(64);
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
const operationalFieldDefaults = {
  isReleaseTarget: z.boolean().default(false),
  milestoneRef: NullableReferenceSchema.default(null),
  predecessorVersionId: NullableVersionIdSchema.default(null),
  roadmapRef: NullableReferenceSchema.default(null),
  approvedPlanRef: NullableReferenceSchema.default(null),
  acceptanceSummary: SummarySchema.default(""),
  actualDate: TargetDateSchema.default(null),
  dependenciesSummary: SummarySchema.default(""),
  dependenciesSatisfied: z.boolean().default(false),
  artifactsAccepted: z.boolean().default(false),
  verificationComplete: z.boolean().default(false),
  roadmapReconciled: z.boolean().default(false),
  userGateDecisionRef: NullableReferenceSchema.default(null),
};

export const ProjectVersionCreateInputSchema = z
  .strictObject({
    projectKey: ProjectKeySchema,
    versionLabel: ProjectVersionCreateLabelSchema,
    title: VersionTitleSchema,
    description: VersionDescriptionSchema.default(""),
    targetDate: TargetDateSchema.default(null),
    semver: FormalSemVerSchema.optional(),
    ...operationalFieldDefaults,
  })
  .superRefine((value, context) => {
    if (value.semver === undefined || value.semver === value.versionLabel) return;
    context.addIssue({
      code: "custom",
      message: "SemVer must match the version label.",
      path: ["semver"],
    });
  })
  .transform((value) => ({
    ...value,
    semver: value.semver ?? value.versionLabel,
  }));

export const ProjectVersionUpdateInputSchema = z.strictObject({
  projectVersionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  versionLabel: ProjectVersionUpdateLabelSchema,
  title: VersionTitleSchema,
  description: VersionDescriptionSchema.default(""),
  targetDate: TargetDateSchema.default(null),
  semver: FormalSemVerSchema.nullable().default(null),
  ...operationalFieldDefaults,
});

export const ProjectVersionTransitionInputSchema = z.strictObject({
  projectVersionId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  targetStatus: z.enum(PROJECT_VERSION_STATUSES),
});

export type ProjectVersionCreateInput = z.input<typeof ProjectVersionCreateInputSchema>;
export type ProjectVersionUpdateInput = z.input<typeof ProjectVersionUpdateInputSchema>;
export type ProjectVersionTransitionInput = z.infer<typeof ProjectVersionTransitionInputSchema>;
