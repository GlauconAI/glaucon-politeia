export const WORK_TRACKER_PROJECT_STORAGE_KEY = "work-tracker:last-project";

export type WorkTrackerView = "active" | "completed";

export function resolveRememberedProject(input: {
  urlProject?: string;
  storedProject?: string | null;
  validProjectKeys: readonly string[];
}) {
  if (input.urlProject && input.validProjectKeys.includes(input.urlProject)) {
    return input.urlProject;
  }
  if (!input.urlProject && input.storedProject && input.validProjectKeys.includes(input.storedProject)) {
    return input.storedProject;
  }
  return "all";
}

export function readRememberedProject(storage: Pick<Storage, "getItem">): string | null {
  try {
    return storage.getItem(WORK_TRACKER_PROJECT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberProject(storage: Pick<Storage, "setItem" | "removeItem">, projectKey: string) {
  try {
    if (projectKey === "all") storage.removeItem(WORK_TRACKER_PROJECT_STORAGE_KEY);
    else storage.setItem(WORK_TRACKER_PROJECT_STORAGE_KEY, projectKey);
  } catch {
    // Storage may be unavailable in hardened or private browser contexts.
  }
}

export function buildWorkTrackerHref(input: {
  projectKey?: string;
  projectVersionId?: string;
  view?: WorkTrackerView;
}) {
  const search = new URLSearchParams();
  if (input.projectKey && input.projectKey !== "all") search.set("project", input.projectKey);
  if (input.projectVersionId && input.projectVersionId !== "all") search.set("version", input.projectVersionId);
  if (input.view === "completed") search.set("view", "completed");
  const query = search.toString();
  return `/work-tracker${query ? `?${query}` : ""}`;
}

export function buildWorkItemDetailHref(itemId: string, input: {
  projectKey?: string;
  projectVersionId?: string;
  view?: WorkTrackerView;
}) {
  const listHref = buildWorkTrackerHref(input);
  const query = listHref.split("?")[1];
  return `/work-tracker/items/${itemId}${query ? `?${query}` : ""}`;
}
