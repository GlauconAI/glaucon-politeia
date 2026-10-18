import { z } from "zod";

const WorkItem = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
  state: z.string().min(1),
  project_key: z.string().min(1),
  project_version_id: z.uuid().nullable(),
  version_binding_kind: z.string().nullable(),
  plan_revision: z.number().int().nullable(),
  stage_id: z.string().nullable(),
  work_package_id: z.string().nullable(),
  assigned_agent_id: z.string().nullable(),
  owner_id: z.uuid().nullable(),
  updated_at: z.string().min(1),
});

const Snapshot = z.strictObject({
  schema_version: z.literal("concerto-project-work-snapshot-v1"),
  project_key: z.string().min(1),
  snapshot_revision: z.string().regex(/^[a-f0-9]{32}$/u),
  snapshot_as_of: z.string().min(1),
  total_count: z.number().int().nonnegative(),
  page_count: z.literal(1),
  complete: z.literal(true),
  next_cursor: z.null(),
  items: z.array(WorkItem),
});

export type ProjectWorkSnapshot = z.infer<typeof Snapshot>;

export function validateProjectWorkSnapshot(
  value: unknown,
  projectKey: string,
): ProjectWorkSnapshot {
  const snapshot = Snapshot.parse(value);
  const ids = new Set<string>();
  if (
    snapshot.project_key !== projectKey ||
    snapshot.total_count !== snapshot.items.length
  ) {
    throw new Error("Project Work snapshot scope or total is inconsistent");
  }
  for (const item of snapshot.items) {
    if (item.project_key !== projectKey || ids.has(item.id)) {
      throw new Error("Project Work snapshot has foreign or duplicate Item");
    }
    ids.add(item.id);
  }
  return snapshot;
}
