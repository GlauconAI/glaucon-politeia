import type {
  CronOccurrence,
  CronOperationsModel,
  CronRiskGroup,
} from "@/lib/observatory/cron-operations";

function minuteGroups(occurrences: CronOccurrence[]): CronOccurrence[][] {
  const groups = new Map<string, CronOccurrence[]>();
  for (const occurrence of occurrences) {
    const values = groups.get(occurrence.minuteKey) ?? [];
    values.push(occurrence);
    groups.set(occurrence.minuteKey, values);
  }
  return [...groups.values()];
}

function hardRisk(
  groups: CronRiskGroup[],
  minuteKey: string,
): CronRiskGroup | undefined {
  return groups.find((group) => group.startsAt === minuteKey);
}

function crowdedRisk(
  groups: CronRiskGroup[],
  occurrences: CronOccurrence[],
): CronRiskGroup | undefined {
  const ids = new Set(occurrences.map((occurrence) => occurrence.occurrenceId));
  return groups.find((group) =>
    group.occurrences.some((occurrence) => ids.has(occurrence.occurrenceId)),
  );
}

const issueLabels: Record<
  CronOperationsModel["issues"][number]["reason"],
  string
> = {
  "missing-anchor": "Missing next-run anchor",
  "invalid-expression": "Invalid calendar expression",
  "invalid-interval": "Invalid fixed interval",
  "invalid-timezone": "Invalid timezone",
  "occurrence-cap": "Projection occurrence cap reached",
};

export function CronTimeView({ model }: { model: CronOperationsModel }) {
  if (!model.recurringJobs.length) {
    return (
      <p className="empty-text">
        No enabled recurring jobs match the current filters.
      </p>
    );
  }

  return (
    <section className="cron-time-view" aria-labelledby="cron-time-view-heading">
      <div className="cron-view-heading">
        <div>
          <p className="eyebrow">America/Vancouver · next 7 days</p>
          <h3 id="cron-time-view-heading">Recurring schedule by time</h3>
        </div>
        <p>
          Red marks the same start minute. Amber marks starts within a 15-minute
          crowded window.
        </p>
      </div>

      {model.dayGroups.length ? (
        <div className="cron-day-list">
          {model.dayGroups.map((day) => (
            <section className="cron-day" key={day.dayKey}>
              <header>
                <h4>{day.dayLabel}</h4>
                <span>{day.occurrences.length} occurrences</span>
              </header>
              <ol>
                {minuteGroups(day.occurrences).map((occurrences) => {
                  const first = occurrences[0]!;
                  const hard = hardRisk(model.hardConflicts, first.minuteKey);
                  const crowded = crowdedRisk(model.crowdedWindows, occurrences);
                  const level = hard ? "hard" : crowded ? "crowded" : "clear";
                  return (
                    <li
                      className="cron-time-row"
                      data-risk={level}
                      key={first.minuteKey}
                    >
                      <time dateTime={first.startsAt}>{first.localTimeLabel}</time>
                      <div className="cron-time-jobs">
                        {hard ? (
                          <strong className="cron-risk-label">
                            Hard conflict · {hard.jobCount} jobs · {hard.agentCount} Agents
                          </strong>
                        ) : crowded ? (
                          <strong className="cron-risk-label">
                            Crowded window · {crowded.jobCount} jobs · {crowded.agentCount} Agents
                          </strong>
                        ) : (
                          <span className="cron-risk-label">Clear minute</span>
                        )}
                        <ul>
                          {occurrences.map((occurrence) => (
                            <li key={occurrence.occurrenceId}>
                              <span>{occurrence.job.owner}</span>
                              <strong>{occurrence.job.name}</strong>
                              <small>{occurrence.job.scheduleSummary}</small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-text">
          Recurring jobs exist, but no occurrence could be projected in the next
          seven days.
        </p>
      )}

      {model.crowdedWindows.length ? (
        <section className="cron-crowded-summary" aria-labelledby="cron-crowded-heading">
          <h4 id="cron-crowded-heading">Crowded windows</h4>
          <ul>
            {model.crowdedWindows.map((group) => (
              <li key={group.id}>
                <strong>Crowded window</strong>
                <span>
                  {group.occurrences[0]?.localDayLabel} · {group.occurrences[0]?.localTimeLabel}
                  {" → "}
                  {group.occurrences.at(-1)?.localTimeLabel}
                </span>
                <small>{group.jobCount} jobs across {group.agentCount} Agents</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {model.issues.length ? (
        <section className="cron-projection-issues" aria-labelledby="cron-issues-heading">
          <h4 id="cron-issues-heading">Unable to calculate</h4>
          <ul>
            {model.issues.map((projectionIssue) => (
              <li key={projectionIssue.assetId}>
                <strong>{projectionIssue.name}</strong>
                <span>{issueLabels[projectionIssue.reason]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
