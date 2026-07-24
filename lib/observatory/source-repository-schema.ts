import { z } from "zod";

export const OBSERVATORY_SOURCE_REPOSITORY_MAX_ITEMS = 1_000;
export const OBSERVATORY_SOURCE_REPOSITORY_MAX_TEXT_LENGTH = 512;

const SafeTextSchema = z
  .string()
  .max(OBSERVATORY_SOURCE_REPOSITORY_MAX_TEXT_LENGTH)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), {
    message: "Control characters are not allowed.",
  });
const LogicalTokenSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u, "Expected a logical token.");
const LogicalSourceSchema = z
  .string()
  .min(1)
  .max(OBSERVATORY_SOURCE_REPOSITORY_MAX_TEXT_LENGTH)
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

export const ObservatoryGitHubRepositorySchema = z.strictObject({
  owner: z
    .string()
    .min(1)
    .max(39)
    .regex(
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u,
      "Expected a GitHub owner.",
    ),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/u, "Expected a GitHub repository name."),
  url: z
    .url()
    .regex(
      /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/u,
      "Expected a canonical credential-free GitHub URL.",
    ),
});

export const ObservatorySourceRepositorySchema = z.strictObject({
  id: z
    .string()
    .regex(
      /^repository:[a-f0-9]{16,64}$/u,
      "Expected a stable repository identifier.",
    ),
  name: SafeTextSchema.min(1),
  scope: z.enum(["workspace", "vault"]),
  local_ref: LogicalSourceSchema,
  maintainer_agent_id: LogicalTokenSchema.nullable(),
  knowledge_area: SafeTextSchema.min(1).nullable(),
  github: ObservatoryGitHubRepositorySchema.nullable(),
  current_branch: SafeTextSchema.min(1).nullable(),
  detached: z.boolean(),
  head: z
    .string()
    .regex(
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u,
      "Expected a Git object identifier.",
    )
    .nullable(),
  default_branch: SafeTextSchema.min(1).nullable(),
  last_commit_at: IsoTimestampSchema.nullable(),
  working_tree: z.enum(["clean", "dirty", "unknown"]),
  activity: z.enum(["active", "stale", "unknown"]),
  archive_state: z.enum(["active", "archived", "unknown"]),
  registry_project_keys: z.array(SafeTextSchema.min(1)).max(32),
  authority: z.literal("observed"),
  source: z.enum(["local-git/workspace", "local-git/vault"]),
  collected_at: IsoTimestampSchema,
  health: z.enum(["healthy", "degraded", "failed", "unknown"]),
});

export const ObservatorySourceRepositoryHealthSchema = z.strictObject({
  status: z.enum(["fresh", "stale", "failed", "unknown"]),
  health: z.enum(["healthy", "degraded", "failed", "unknown"]),
  collected_at: IsoTimestampSchema,
  last_success_at: IsoTimestampSchema.nullable(),
  repository_count: z
    .number()
    .int()
    .nonnegative()
    .max(OBSERVATORY_SOURCE_REPOSITORY_MAX_ITEMS),
  omitted_count: z.number().int().nonnegative(),
  error_code: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{0,63}$/u, "Expected a stable diagnostic code.")
    .optional(),
});

export const ObservatorySourceRepositoryInventorySchema = z
  .strictObject({
    repositories: z
      .array(ObservatorySourceRepositorySchema)
      .max(OBSERVATORY_SOURCE_REPOSITORY_MAX_ITEMS),
    source_health: ObservatorySourceRepositoryHealthSchema,
  })
  .superRefine((inventory, context) => {
    const ids = new Set<string>();
    inventory.repositories.forEach((repository, index) => {
      if (ids.has(repository.id)) {
        context.addIssue({
          code: "custom",
          path: ["repositories", index, "id"],
          message: `Duplicate repository ID "${repository.id}".`,
        });
      }
      ids.add(repository.id);
    });
    if (
      inventory.source_health.repository_count !== inventory.repositories.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_health", "repository_count"],
        message: `Expected ${inventory.repositories.length} repositories from repositories.`,
      });
    }
  });

export type ObservatoryGitHubRepository = z.infer<
  typeof ObservatoryGitHubRepositorySchema
>;
export type ObservatorySourceRepository = z.infer<
  typeof ObservatorySourceRepositorySchema
>;
export type ObservatorySourceRepositoryHealth = z.infer<
  typeof ObservatorySourceRepositoryHealthSchema
>;
export type ObservatorySourceRepositoryInventory = z.infer<
  typeof ObservatorySourceRepositoryInventorySchema
>;
