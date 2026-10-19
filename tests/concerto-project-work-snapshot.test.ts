import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createProjectWorkSnapshotHandler, defaultSnapshotRouteDependencies } from "@/app/api/concerto/project-work-snapshot/route";
import { validateProjectWorkSnapshot } from "@/lib/observatory/project-work-snapshot";
import { createProjectWorkSnapshotRepository } from "@/lib/observatory/project-work-snapshot-repository";

const { readOverview } = vi.hoisted(() => ({ readOverview: vi.fn() }));
vi.mock("@/lib/observatory/dashboard-state", () => ({
  loadObservatoryOverviewState: readOverview,
}));

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
  it("uses explicit runtime Project Owner rather than Shared grouping or persona alias", async () => {
    readOverview.mockResolvedValue({ status: "ready", snapshot: {
      registry: { project_groups: [{ owner: "Shared", projects: [{
        project_key: projectKey, name: "asgard-archaea", title: "Asgard",
        project_owner: "main", project_owner_source: "explicit", status: "active",
      }] }] }, agents: [],
    } });
    const principals = ["main", "shared", "socrates"];
    const read = vi.fn().mockResolvedValue(snapshot);
    const GET = createProjectWorkSnapshotHandler({
      keyConfiguration: () => JSON.stringify(principals.map((agentId) => ({
        agentId, tokenSha256: createHash("sha256").update("test-" + agentId).digest("hex"),
      }))),
      projects: defaultSnapshotRouteDependencies.projects,
      repository: () => ({ read }),
    });
    for (const agentId of principals) {
      const response = await GET(new Request(
        "https://example.test/api/concerto/project-work-snapshot?projectKey=shared%2Fasgard-archaea",
        { headers: { authorization: "Bearer test-" + agentId } },
      ));
      expect(response.status).toBe(agentId === "main" ? 200 : 403);
    }
    expect(read).toHaveBeenCalledTimes(1);
  });

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
