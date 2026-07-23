import { z } from "zod";

export const GOVERNANCE_MAX_TEXT_LENGTH = 512;
export const GOVERNANCE_MAX_EVIDENCE_LENGTH = 1_024;
export const GOVERNANCE_SOURCE_FILES = [
  "dashboard/README.md",
  "dashboard/development-baseline.md",
  "dashboard/edad-tracker.md",
  "dashboard/estimate-calibration.md",
] as const;

const Text = z.string().min(1).max(GOVERNANCE_MAX_TEXT_LENGTH);
const OptionalText = z.string().max(GOVERNANCE_MAX_TEXT_LENGTH);
const EvidenceText = z.string().min(1).max(GOVERNANCE_MAX_EVIDENCE_LENGTH);
const Id = z.string().min(1).max(128).regex(/^[A-Z0-9][A-Z0-9.-]*$/i);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const IsoTimestamp = z.iso.datetime({ offset: true });
const DateFact = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true }),
  z.literal("not_recorded"),
]);
const ContractType = z.enum(["GOV-DOC", "IMPLEMENT", "VERIFY", "UX", "OPS"]);
const StatusCategory = z.enum([
  "accepted",
  "done",
  "active",
  "planned",
  "partial",
  "blocked",
  "at_risk",
  "unknown",
]);
const SourceLabel = z.enum(GOVERNANCE_SOURCE_FILES);
const EvidenceRefs = z.array(EvidenceText).max(64);

const StatusShape = {
  status_label: Text,
  status_category: StatusCategory,
};

export const GovernanceProjectSchema = z.strictObject({
  id: Id,
  name: Text,
  accountable_owner: Text,
  phase: Text,
  health: z.enum(["healthy", "at_risk", "blocked", "unknown"]),
  plan_revision: Text,
  baseline_status: z.enum(["candidate", "approved", "unknown"]),
  source: SourceLabel,
});

export const GovernanceMilestoneSchema = z.strictObject({
  id: Id,
  name: Text,
  ...StatusShape,
  forecast: DateFact,
  variance: Text,
  feature_ids: z.array(Id).max(256),
  evidence_refs: EvidenceRefs,
  source: SourceLabel,
});

export const GovernanceFeatureSchema = z.strictObject({
  id: Id.regex(/^OBS-F\d+$/),
  milestone_id: Id,
  name: Text,
  scope: Text,
  ...StatusShape,
  contract_id: Id.regex(/^EC-F\d+$/),
  contract_type: ContractType,
  estimate_hours: z.number().nonnegative().max(10_000),
  confidence: z.enum(["Low", "Medium", "High"]),
  baseline_finish: DateFact,
  forecast_finish: DateFact,
  actual_finish: DateFact,
  gate_requirement: OptionalText,
  source: SourceLabel,
});

export const GovernanceTaskSchema = z.strictObject({
  id: Id.regex(/^OBS-T\d+$/),
  feature_id: Id.regex(/^OBS-F\d+$/),
  name: Text,
  ...StatusShape,
  contract_id: Id.regex(/^EC-T\d+$/),
  contract_type: ContractType,
  estimate_hours: z.number().nonnegative().max(10_000),
  confidence: z.enum(["Low", "Medium", "High"]),
  forecast_finish: DateFact,
  actual_start: DateFact,
  actual_finish: DateFact,
  evidence_refs: EvidenceRefs,
  source: SourceLabel,
});

export const GovernanceExecutorRunSchema = z.strictObject({
  id: Id,
  task_ref: Text,
  functional_role: Text,
  sequence: z.number().int().nonnegative().max(10_000),
  started_at: DateFact,
  finished_at: DateFact,
  active_time: Text,
  artifact: OptionalText,
  evidence_summary: OptionalText.max(GOVERNANCE_MAX_EVIDENCE_LENGTH),
  rework: z.boolean(),
  source: SourceLabel,
});

export const GovernanceGateSchema = z.strictObject({
  id: Id,
  date: DateFact,
  type: Text,
  result: Text,
  status: Text,
  evidence_summary: OptionalText.max(GOVERNANCE_MAX_EVIDENCE_LENGTH),
  reviewer_run_id: z.union([Id, z.literal("not_recorded")]),
  source: SourceLabel,
});

export const GovernanceRiskSchema = z.strictObject({
  id: Id,
  description: Text,
  impact: Text,
  status: Text,
  mitigation: EvidenceText,
  source: SourceLabel,
});

export const GovernanceDependencySchema = z.strictObject({
  id: Id,
  dependency: Text,
  owner: Text,
  needed_by: Text,
  status: Text,
  source: SourceLabel,
});

export const GovernanceSummarySchema = z.strictObject({
  milestone_count: z.number().int().nonnegative(),
  feature_count: z.number().int().nonnegative(),
  task_count: z.number().int().nonnegative(),
  run_count: z.number().int().nonnegative(),
  gate_count: z.number().int().nonnegative(),
  accepted_count: z.number().int().nonnegative(),
  active_count: z.number().int().nonnegative(),
  planned_count: z.number().int().nonnegative(),
  at_risk_count: z.number().int().nonnegative(),
  missing_date_count: z.number().int().nonnegative(),
  open_risk_count: z.number().int().nonnegative(),
  open_dependency_count: z.number().int().nonnegative(),
});

export const GovernanceSourceSchema = z.strictObject({
  collected_at: IsoTimestamp,
  files: z.tuple([
    z.literal(GOVERNANCE_SOURCE_FILES[0]),
    z.literal(GOVERNANCE_SOURCE_FILES[1]),
    z.literal(GOVERNANCE_SOURCE_FILES[2]),
    z.literal(GOVERNANCE_SOURCE_FILES[3]),
  ]),
  source_digest: Sha256,
  health: z.literal("healthy"),
});

function duplicateIds(values: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  return values.flatMap(({ id }) => {
    if (seen.has(id)) return [id];
    seen.add(id);
    return [];
  });
}

function expectedSummary(model: {
  milestones: z.infer<typeof GovernanceMilestoneSchema>[];
  features: z.infer<typeof GovernanceFeatureSchema>[];
  tasks: z.infer<typeof GovernanceTaskSchema>[];
  executor_runs: z.infer<typeof GovernanceExecutorRunSchema>[];
  gates: z.infer<typeof GovernanceGateSchema>[];
  risks: z.infer<typeof GovernanceRiskSchema>[];
  dependencies: z.infer<typeof GovernanceDependencySchema>[];
}) {
  const statuses = [...model.milestones, ...model.features, ...model.tasks];
  const missingDateCount =
    model.milestones.filter((value) => value.forecast === "not_recorded").length +
    model.features.reduce(
      (count, value) =>
        count +
        Number(value.baseline_finish === "not_recorded") +
        Number(value.forecast_finish === "not_recorded") +
        Number(value.actual_finish === "not_recorded"),
      0,
    ) +
    model.tasks.reduce(
      (count, value) =>
        count +
        Number(value.forecast_finish === "not_recorded") +
        Number(value.actual_start === "not_recorded") +
        Number(value.actual_finish === "not_recorded"),
      0,
    );
  return {
    milestone_count: model.milestones.length,
    feature_count: model.features.length,
    task_count: model.tasks.length,
    run_count: model.executor_runs.length,
    gate_count: model.gates.length,
    accepted_count: statuses.filter((value) =>
      ["accepted", "done"].includes(value.status_category),
    ).length,
    active_count: statuses.filter((value) => value.status_category === "active")
      .length,
    planned_count: statuses.filter(
      (value) => value.status_category === "planned",
    ).length,
    at_risk_count: statuses.filter(
      (value) => value.status_category === "at_risk",
    ).length,
    missing_date_count: missingDateCount,
    open_risk_count: model.risks.filter((value) =>
      /open|active|at risk/i.test(value.status),
    ).length,
    open_dependency_count: model.dependencies.filter(
      (value) => !/available|done|closed|met/i.test(value.status),
    ).length,
  };
}

export const DeliveryGovernanceSchema = z
  .strictObject({
    project: GovernanceProjectSchema,
    milestones: z.array(GovernanceMilestoneSchema).max(32),
    features: z.array(GovernanceFeatureSchema).max(256),
    tasks: z.array(GovernanceTaskSchema).max(2_048),
    executor_runs: z.array(GovernanceExecutorRunSchema).max(1_024),
    gates: z.array(GovernanceGateSchema).max(256),
    risks: z.array(GovernanceRiskSchema).max(256),
    dependencies: z.array(GovernanceDependencySchema).max(256),
    summary: GovernanceSummarySchema,
    source: GovernanceSourceSchema,
  })
  .superRefine((model, context) => {
    const collections: Array<
      [string, readonly { id: string }[]]
    > = [
      ["milestones", model.milestones],
      ["features", model.features],
      ["tasks", model.tasks],
      ["executor_runs", model.executor_runs],
      ["gates", model.gates],
      ["risks", model.risks],
      ["dependencies", model.dependencies],
    ];
    collections.forEach(([name, values]) => {
      duplicateIds(values).forEach((id) =>
        context.addIssue({
          code: "custom",
          path: [name],
          message: `Duplicate governance id: ${id}.`,
        }),
      );
    });

    const milestoneIds = new Set(model.milestones.map(({ id }) => id));
    const featureIds = new Set(model.features.map(({ id }) => id));
    model.features.forEach((feature, index) => {
      if (!milestoneIds.has(feature.milestone_id)) {
        context.addIssue({
          code: "custom",
          path: ["features", index, "milestone_id"],
          message: "Feature references an unknown Milestone.",
        });
      }
    });
    model.tasks.forEach((task, index) => {
      if (!featureIds.has(task.feature_id)) {
        context.addIssue({
          code: "custom",
          path: ["tasks", index, "feature_id"],
          message: "Task references an unknown Feature.",
        });
      }
    });
    model.milestones.forEach((milestone, index) => {
      milestone.feature_ids.forEach((id) => {
        if (!featureIds.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["milestones", index, "feature_ids"],
            message: "Milestone lists an unknown Feature.",
          });
        }
      });
    });

    const expected = expectedSummary(model);
    (Object.keys(expected) as Array<keyof typeof expected>).forEach((key) => {
      if (model.summary[key] !== expected[key]) {
        context.addIssue({
          code: "custom",
          path: ["summary", key],
          message: `Expected derived ${key}.`,
        });
      }
    });
  });

export type DeliveryGovernance = z.infer<typeof DeliveryGovernanceSchema>;
export type GovernanceStatusCategory = z.infer<typeof StatusCategory>;

export function summarizeDeliveryGovernance(
  model: Omit<DeliveryGovernance, "summary">,
): DeliveryGovernance["summary"] {
  return expectedSummary(model);
}
