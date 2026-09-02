import { describe, expect, it, vi } from "vitest";

import {
  WORK_TRACKER_PROJECT_STORAGE_KEY,
  buildWorkItemDetailHref,
  buildWorkTrackerHref,
  readRememberedProject,
  rememberProject,
  resolveRememberedProject,
} from "@/lib/observatory/work-tracker-navigation";

describe("Work Tracker navigation", () => {
  const valid = ["plato/dashboard", "amou/wenya-ai"];

  it("prefers a valid URL Project, then storage, and rejects stale values", () => {
    expect(resolveRememberedProject({ urlProject: "plato/dashboard", storedProject: "amou/wenya-ai", validProjectKeys: valid })).toBe("plato/dashboard");
    expect(resolveRememberedProject({ storedProject: "amou/wenya-ai", validProjectKeys: valid })).toBe("amou/wenya-ai");
    expect(resolveRememberedProject({ urlProject: "unknown/project", storedProject: "amou/wenya-ai", validProjectKeys: valid })).toBe("all");
  });

  it("persists only concrete Projects and tolerates storage failures", () => {
    const storage = { getItem: vi.fn(() => "plato/dashboard"), setItem: vi.fn(), removeItem: vi.fn() };
    expect(readRememberedProject(storage)).toBe("plato/dashboard");
    rememberProject(storage, "plato/dashboard");
    expect(storage.setItem).toHaveBeenCalledWith(WORK_TRACKER_PROJECT_STORAGE_KEY, "plato/dashboard");
    rememberProject(storage, "all");
    expect(storage.removeItem).toHaveBeenCalledWith(WORK_TRACKER_PROJECT_STORAGE_KEY);
    expect(readRememberedProject({ getItem: () => { throw new Error("blocked"); } })).toBeNull();
  });

  it("builds bounded list and detail links from validated state", () => {
    expect(buildWorkTrackerHref({ projectKey: "plato/dashboard", projectVersionId: "33333333-3333-4333-8333-333333333333", view: "completed" })).toBe("/work-tracker?project=plato%2Fdashboard&version=33333333-3333-4333-8333-333333333333&view=completed");
    expect(buildWorkItemDetailHref("item-1", { projectKey: "plato/dashboard", view: "active" })).toBe("/work-tracker/items/item-1?project=plato%2Fdashboard");
  });
});
