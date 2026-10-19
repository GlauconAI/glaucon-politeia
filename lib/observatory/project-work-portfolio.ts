export type ProjectWorkCount = { projectKey: string; total: number; states: Record<string, number> };
export function summarizeProjectWork(rows: Array<{ project_key: string | null; project_ref?: string | null; state: string }>): ProjectWorkCount[] {
  const groups = new Map<string, ProjectWorkCount>();
  for (const row of rows) {
    const key = row.project_key ?? row.project_ref;
    if (!key) continue;
    const group = groups.get(key) ?? { projectKey: key, total: 0, states: {} };
    group.total++;
    group.states[row.state] = (group.states[row.state] ?? 0) + 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.projectKey.localeCompare(b.projectKey));
}
