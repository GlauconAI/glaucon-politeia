import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createProjectWorkSnapshotHandler } from "@/app/api/concerto/project-work-snapshot/route";
import { validateProjectWorkSnapshot } from "@/lib/observatory/project-work-snapshot";
import { createProjectWorkSnapshotRepository } from "@/lib/observatory/project-work-snapshot-repository";

const projectKey = "shared/asgard-archaea";
const token = "snapshot-owner-token";
const keys = JSON.stringify([{
  agentId: "socrates",
  tokenSha256: createHash("sha256").update(token).digest("hex"),
}]);
const item = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 3,
  state: "in_progress",
  project_key: projectKey,
  project_version_id: "22222222-2222-4222-8222-222222222222",
  version_binding_kind: "required",
  plan_revision: 17,
  stage_id: "M3",
  work_package_id: "W",
  assigned_agent_id: "amou",
  owner_id: null,
  updated_at: "2026-10-18T00:00:00Z",
};
const snapshot = {
  schema_version: "concerto-project-work-snapshot-v1",
  project_key: projectKey,
  snapshot_revision: "a".repeat(32),
  snapshot_as_of: "2026-10-18T00:00:00Z",
  total_count: 1,
  page_count: 1,
  complete: true,
  next_cursor: null,
  items: [item],
};

describe("Concerto Project Work snapshot", () => {
  it("rejects truncated, foreign, duplicate, or incomplete snapshot responses", () => {
    expect(validateProjectWorkSnapshot(snapshot, projectKey).items).toHaveLength(1);
    for (const invalid of [
      { ...snapshot, total_count: 2 },
      { ...snapshot, complete: false },
      { ...snapshot, next_cursor: "more" },
      { ...snapshot, items: [item, item], total_count: 2 },
      { ...snapshot, items: [{ ...item, project_key: "shared/other" }] },
    ]) {
      expect(() => validateProjectWorkSnapshot(invalid, projectKey)).toThrow();
    }
  });

  it("reads one authoritative RPC result, not the truncated visible list", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot, error: null });
    const repository = createProjectWorkSnapshotRepository({ rpc });
    await expect(repository.read(projectKey)).resolves.toMatchObject({
      total_count: 1, page_count: 1, complete: true,
    });
    expect(rpc).toHaveBeenCalledWith("read_observatory_project_work_snapshot", {
      p_project_key: projectKey,
    });
  });

  it("allows only the canonical Project Owner and rejects revision drift", async () => {
    const read = vi.fn().mockResolvedValue(snapshot);
    const GET = createProjectWorkSnapshotHandler({
      keyConfiguration: () => keys,
      projects: async () => ({
        projects: [{ projectKey, title: "Asgard", owner: "Socrates", status: "active" }],
        agentIds: ["socrates"],
      }),
      repository: () => ({ read }),
    });
    const request = (revision?: string, bearer = token) => new Request(
      "https://example.test/api/concerto/project-work-snapshot?projectKey=shared%2Fasgard-archaea" +
      (revision ? "&expectedRevision=" + revision : ""),
      { headers: { authorization: "Bearer " + bearer } },
    );
    expect((await GET(request())).status).toBe(200);
    expect((await GET(request("b".repeat(32)))).status).toBe(409);
    expect((await GET(request(undefined, "wrong"))).status).toBe(401);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
