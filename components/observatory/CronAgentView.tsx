import type { DashboardCronEntry } from "@/lib/observatory/dashboard-directory";
import type { CronOperationsModel } from "@/lib/observatory/cron-operations";

function displayTimestamp(value: string | null): string {
  if (!value) return "Not projected";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not projected";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Vancouver",
  }).format(date);
}

function nextOccurrence(
  model: CronOperationsModel,
  job: DashboardCronEntry,
): string | null {
  return (
    model.occurrences.find(
      (occurrence) => occurrence.job.assetId === job.assetId,
    )?.startsAt ?? job.nextRunAt
  );
}

export function CronAgentView({ model }: { model: CronOperationsModel }) {
  return (
    <section className="cron-agent-view" aria-labelledby="cron-agent-view-heading">
      <div className="cron-view-heading">
        <div>
          <p className="eyebrow">Recurring load by owner</p>
          <h3 id="cron-agent-view-heading">Agent recurring load</h3>
        </div>
        <p>Jobs are ordered by their next projected execution.</p>
      </div>

      {model.agentSummaries.length ? (
        <div className="cron-agent-list">
          {model.agentSummaries.map((summary) => (
            <section key={summary.owner}>
              <header>
                <div>
                  <h3>{summary.owner}</h3>
                  <p>Next run: {displayTimestamp(summary.nextRunAt)}</p>
                </div>
                <dl>
                  <div><dt>Recurring</dt><dd>{summary.jobs.length}</dd></div>
                  <div><dt>Hard conflicts</dt><dd>{summary.hardConflictCount}</dd></div>
                  <div><dt>Crowded windows</dt><dd>{summary.crowdedWindowCount}</dd></div>
                  <div><dt>Attention</dt><dd>{summary.attentionCount}</dd></div>
                </dl>
              </header>
              <ol>
                {summary.jobs.map((job) => (
                  <li key={job.assetId} data-health={job.health}>
                    <div>
                      <h4>{job.name}</h4>
                      <span>{job.scheduleSummary}</span>
                    </div>
                    <time dateTime={nextOccurrence(model, job) ?? undefined}>
                      {displayTimestamp(nextOccurrence(model, job))}
                    </time>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-text">
          No enabled recurring jobs match the current filters.
        </p>
      )}
    </section>
  );
}
