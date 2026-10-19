import { createSupabaseServerClient } from "@/lib/supabase/server";
import { summarizeProjectWork } from "@/lib/observatory/project-work-portfolio";

// Server-only, behind the Projects page's existing admin authorization.
// Live Concerto work facts are separate from Plan approval and execution-line exports.
export async function ProjectWorkPortfolio() {
  let counts: ReturnType<typeof summarizeProjectWork> | null = null;
  try {
    const client = await createSupabaseServerClient();
    const rows: Array<{ project_key: string | null; project_ref: string | null; state: string }> = [];
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const { data, error } = await client.from("observatory_work_items").select("project_key,project_ref,state").order("id").range(offset, offset + 999);
      if (error || !data) throw new Error("Unavailable");
      rows.push(...data);
      if (data.length < 1000) { counts = summarizeProjectWork(rows); break; }
    }
  } catch { /* Display unknown, never a fabricated zero. */ }
  return <section className="observatory-panel" aria-label="Live Project Work">
    <h2>Live Project Work — Concerto</h2>
    <p>Read directly on page load. Work Item states do not imply Plan approval or execution-line coverage.</p>
    {counts === null ? <p role="alert">Project Work unavailable. Counts are unknown.</p> : counts.length === 0 ? <p>No project-bound Work Items were returned by Concerto. This does not mean that no Projects have work elsewhere.</p> : <ul>{counts.map(group => <li key={group.projectKey}><strong>{group.projectKey}</strong>: {group.total} Work Items · {Object.entries(group.states).map(([state, count]) => `${state}: ${count}`).join(" · ")}</li>)}</ul>}
  </section>;
}
