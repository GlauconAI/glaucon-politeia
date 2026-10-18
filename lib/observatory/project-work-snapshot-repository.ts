import "server-only";

import {
  validateProjectWorkSnapshot,
  type ProjectWorkSnapshot,
} from "@/lib/observatory/project-work-snapshot";

export interface ProjectWorkSnapshotClient {
  rpc(
    name: "read_observatory_project_work_snapshot",
    args: { p_project_key: string },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export function createProjectWorkSnapshotRepository(
  client: ProjectWorkSnapshotClient,
) {
  return {
    async read(projectKey: string): Promise<ProjectWorkSnapshot> {
      const { data, error } = await client.rpc(
        "read_observatory_project_work_snapshot",
        { p_project_key: projectKey },
      );
      if (error || data === null) {
        throw new Error("Authoritative Project Work snapshot unavailable");
      }
      return validateProjectWorkSnapshot(data, projectKey);
    },
  };
}
