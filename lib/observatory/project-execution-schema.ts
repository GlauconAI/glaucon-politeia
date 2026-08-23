import { createHash } from "node:crypto";
import path from "node:path";

import { z } from "zod";

export const PROJECT_EXECUTION_SCHEMA_VERSION = "1.0.0" as const;
export const PROJECT_EXECUTION_MAX_PROJECTS = 512;
export const PROJECT_EXECUTION_MAX_LINES_PER_PROJECT = 512;
export const PROJECT_EXECUTION_MAX_TEXT_LENGTH = 512;
export const PROJECT_EXECUTION_MAX_SUMMARY_LENGTH = 1024;

const IsoTimestampSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "Expected a SHA-256 digest.");
const SafeTextSchema = z
  .string()
  .min(1)
  .max(PROJECT_EXECUTION_MAX_TEXT_LENGTH)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Control characters are not allowed.",
  });
const SafeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/iu, "Expected a safe logical ID.");
const ProjectKeySchema = z
  .string()
  .min(1)
  .max(256)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*\/(?!\.{1,2}$)[^/\\\p{C}]+$/u,
    "Expected a stable Project key.",
  );
const ForbiddenReference =
  /(?:^|[^a-z])work_[a-f0-9]{24}(?:$|[^a-z])|telegram:direct|owner_session_key|operation_id/iu;
const LogicalReferenceSchema = z
  .string()
  .min(1)
  .max(PROJECT_EXECUTION_MAX_SUMMARY_LENGTH)
  .refine(
    (value) =>
      !path.isAbsolute(value) &&
      !/^[a-z]:[\\/]/iu.test(value) &&
      !ForbiddenReference.test(value),
    { message: "Expected a privacy-safe logical reference." },
  )
  .nullable();
const SafeSummarySchema = z
  .string()
  .max(PROJECT_EXECUTION_MAX_SUMMARY_LENGTH)
  .refine(
    (value) =>
      !/[\u0000-\u001f\u007f]/u.test(value) &&
      !ForbiddenReference.test(value) &&
      !/(?:^|\s)\/(?:Users|home|private|var|etc)\//u.test(value) &&
      !/[a-z]:[\\/]/iu.test(value),
    { message: "Expected a privacy-safe Verification summary." },
  );

export const ProjectExecutorStatusSchema = z.enum([
  "planned",
  "ready",
  "dispatched",
  "active",
  "waiting_input",
  "verifying",
  "completed",
  "blocked",
  "cancelled",
]);

export const IndependentOwnerStatusSchema = z.enum([
  "planned",
  "ready",
  "handed_off",
  "transferred",
  "returned",
  "cancelled",
]);

const TimestampOrNullSchema = IsoTimestampSchema.nullable();

export const ProjectExecutionLineSchema = z
  .strictObject({
    line_id: SafeIdSchema,
    stage_id: SafeIdSchema,
    run_id: SafeIdSchema,
    title: SafeTextSchema,
    owner_agent_id: SafeIdSchema,
    transfer_mode: z.enum(["project_executor", "independent_owner_line"]),
    status: z.union([ProjectExecutorStatusSchema, IndependentOwnerStatusSchema]),
    dependencies: z.array(SafeIdSchema).max(PROJECT_EXECUTION_MAX_LINES_PER_PROJECT),
    return_trigger: z.enum(["terminal_signal", "explicit_user_return"]),
    execution_line_returns_to_originating_agent: z.boolean(),
    artifact_ref: LogicalReferenceSchema,
    verification_summary: SafeSummarySchema.nullable(),
    started_at: TimestampOrNullSchema,
    handed_off_at: TimestampOrNullSchema,
    updated_at: IsoTimestampSchema,
    completed_at: TimestampOrNullSchema,
    user_returned_at: TimestampOrNullSchema,
    canonical_result_ref: LogicalReferenceSchema,
  })
  .superRefine((line, context) => {
    if (line.transfer_mode === "project_executor") {
      if (
        !ProjectExecutorStatusSchema.safeParse(line.status).success ||
        line.return_trigger !== "terminal_signal" ||
        !line.execution_line_returns_to_originating_agent
      ) {
        context.addIssue({
          code: "custom",
          message: "Project executor control semantics are invalid.",
        });
      }
      if (line.status === "completed" && !line.completed_at) {
        context.addIssue({
          code: "custom",
          path: ["completed_at"],
          message: "Completed Project executor requires completed_at.",
        });
      }
      if (line.user_returned_at || line.canonical_result_ref) {
        context.addIssue({
          code: "custom",
          message: "Project executor cannot carry an explicit User return.",
        });
      }
      return;
    }

    if (
      !IndependentOwnerStatusSchema.safeParse(line.status).success ||
      line.return_trigger !== "explicit_user_return" ||
      line.execution_line_returns_to_originating_agent
    ) {
      context.addIssue({
        code: "custom",
        message: "Independent owner line control semantics are invalid.",
      });
    }
    if (
      ["handed_off", "transferred", "returned"].includes(line.status) &&
      !line.handed_off_at
    ) {
      context.addIssue({
        code: "custom",
        path: ["handed_off_at"],
        message: "Independent owner handoff state requires handed_off_at.",
      });
    }
    if (
      line.status === "returned" &&
      (!line.user_returned_at || !line.canonical_result_ref)
    ) {
      context.addIssue({
        code: "custom",
        message: "Returned owner line requires explicit User return facts.",
      });
    }
    if (
      line.status !== "returned" &&
      (line.user_returned_at || line.canonical_result_ref)
    ) {
      context.addIssue({
        code: "custom",
        message: "User return facts require returned status.",
      });
    }
  });

export const ProjectExecutionSummarySchema = z.strictObject({
  execution_line_count: z.number().int().nonnegative(),
  active_count: z.number().int().nonnegative(),
  waiting_count: z.number().int().nonnegative(),
  blocked_count: z.number().int().nonnegative(),
  completed_count: z.number().int().nonnegative(),
  independent_owner_line_count: z.number().int().nonnegative(),
});

const ProjectExecutionProjectSchema = z
  .strictObject({
    project: z.strictObject({
      project_key: ProjectKeySchema,
      title: SafeTextSchema,
      owner_agent_id: SafeIdSchema,
      status: SafeTextSchema,
      current_stage: SafeTextSchema.nullable(),
      current_gate: SafeTextSchema.nullable(),
      updated_at: IsoTimestampSchema,
      source_revision: z.number().int().nonnegative(),
      freshness: z.enum(["fresh", "stale"]),
    }),
    execution_lines: z
      .array(ProjectExecutionLineSchema)
      .max(PROJECT_EXECUTION_MAX_LINES_PER_PROJECT),
    summary: ProjectExecutionSummarySchema,
    collected_at: IsoTimestampSchema,
  })
  .superRefine((project, context) => {
    const ids = new Set<string>();
    project.execution_lines.forEach((line, index) => {
      if (ids.has(line.line_id)) {
        context.addIssue({
          code: "custom",
          path: ["execution_lines", index, "line_id"],
          message: `Duplicate execution line ${line.line_id}.`,
        });
      }
      ids.add(line.line_id);
    });
    project.execution_lines.forEach((line, lineIndex) => {
      const dependencies = new Set<string>();
      line.dependencies.forEach((dependency, dependencyIndex) => {
        if (!ids.has(dependency) || dependencies.has(dependency)) {
          context.addIssue({
            code: "custom",
            path: ["execution_lines", lineIndex, "dependencies", dependencyIndex],
            message: `Invalid execution line dependency ${dependency}.`,
          });
        }
        dependencies.add(dependency);
      });
    });

    const byId = new Map(
      project.execution_lines.map((line) => [line.line_id, line]),
    );
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function visit(lineId: string): boolean {
      if (visiting.has(lineId)) return false;
      if (visited.has(lineId)) return true;
      const line = byId.get(lineId);
      if (!line) return true;
      visiting.add(lineId);
      const acyclic = line.dependencies.every(visit);
      visiting.delete(lineId);
      visited.add(lineId);
      return acyclic;
    }
    if (project.execution_lines.some((line) => !visit(line.line_id))) {
      context.addIssue({
        code: "custom",
        path: ["execution_lines"],
        message: "Execution line dependencies must be acyclic.",
      });
    }

    const activeStates = new Set([
      "dispatched",
      "active",
      "waiting_input",
      "verifying",
    ]);
    const expected = {
      execution_line_count: project.execution_lines.length,
      active_count: project.execution_lines.filter((line) =>
        activeStates.has(line.status),
      ).length,
      waiting_count: project.execution_lines.filter(
        (line) => line.status === "waiting_input",
      ).length,
      blocked_count: project.execution_lines.filter(
        (line) => line.status === "blocked",
      ).length,
      completed_count: project.execution_lines.filter(
        (line) => line.status === "completed",
      ).length,
      independent_owner_line_count: project.execution_lines.filter(
        (line) => line.transfer_mode === "independent_owner_line",
      ).length,
    };
    Object.entries(expected).forEach(([key, value]) => {
      if (project.summary[key as keyof typeof expected] !== value) {
        context.addIssue({
          code: "custom",
          path: ["summary", key],
          message: `Expected derived ${key}.`,
        });
      }
    });
  });

export const ProjectExecutionSnapshotSchema = z
  .strictObject({
    schema_version: z.literal(PROJECT_EXECUTION_SCHEMA_VERSION),
    collected_at: IsoTimestampSchema,
    summary: z.strictObject({
      project_count: z.number().int().nonnegative(),
      ...ProjectExecutionSummarySchema.shape,
    }),
    projects: z
      .array(ProjectExecutionProjectSchema)
      .max(PROJECT_EXECUTION_MAX_PROJECTS),
    digest: Sha256Schema,
  })
  .superRefine((snapshot, context) => {
    const projectKeys = new Set<string>();
    snapshot.projects.forEach((project, index) => {
      if (projectKeys.has(project.project.project_key)) {
        context.addIssue({
          code: "custom",
          path: ["projects", index, "project", "project_key"],
          message: `Duplicate Project key ${project.project.project_key}.`,
        });
      }
      projectKeys.add(project.project.project_key);
    });
    const expected = {
      project_count: snapshot.projects.length,
      execution_line_count: snapshot.projects.reduce(
        (total, project) => total + project.summary.execution_line_count,
        0,
      ),
      active_count: snapshot.projects.reduce(
        (total, project) => total + project.summary.active_count,
        0,
      ),
      waiting_count: snapshot.projects.reduce(
        (total, project) => total + project.summary.waiting_count,
        0,
      ),
      blocked_count: snapshot.projects.reduce(
        (total, project) => total + project.summary.blocked_count,
        0,
      ),
      completed_count: snapshot.projects.reduce(
        (total, project) => total + project.summary.completed_count,
        0,
      ),
      independent_owner_line_count: snapshot.projects.reduce(
        (total, project) =>
          total + project.summary.independent_owner_line_count,
        0,
      ),
    };
    Object.entries(expected).forEach(([key, value]) => {
      if (snapshot.summary[key as keyof typeof expected] !== value) {
        context.addIssue({
          code: "custom",
          path: ["summary", key],
          message: `Expected derived ${key}.`,
        });
      }
    });
    snapshot.projects.forEach((project, index) => {
      if (project.collected_at !== snapshot.collected_at) {
        context.addIssue({
          code: "custom",
          path: ["projects", index, "collected_at"],
          message: "Project collection time must match its envelope.",
        });
      }
    });
  });

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function computeProjectExecutionDigest(
  snapshot: z.infer<typeof ProjectExecutionSnapshotSchema>,
): string {
  const { digest: _digest, ...payload } = snapshot;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

export type ProjectExecutionSnapshot = z.infer<
  typeof ProjectExecutionSnapshotSchema
>;
export type ProjectExecutionProject = z.infer<
  typeof ProjectExecutionProjectSchema
>;
export type ProjectExecutionLine = z.infer<typeof ProjectExecutionLineSchema>;
