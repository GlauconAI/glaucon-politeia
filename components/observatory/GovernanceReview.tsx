import type { DeliveryGovernance } from "@/lib/observatory/governance-schema";
import {
  deriveGovernanceReport,
  serializeGovernanceReport,
  type PeriodReport,
  type ReviewStatus,
} from "@/lib/observatory/governance-reports";

function statusLabel(status: ReviewStatus): string {
  return {
    on_track: "On track",
    at_risk: "At risk",
    off_track: "Off track",
  }[status];
}

function PeriodCard({
  title,
  report,
}: {
  title: string;
  report: PeriodReport;
}) {
  return (
    <article className="governance-period-card">
      <h3>{title}</h3>
      <p>{report.period_start} – {report.period_end}</p>
      <strong>{report.summary}</strong>
      <small>{report.id}</small>
    </article>
  );
}

export function GovernanceReview({
  governance,
}: {
  governance: DeliveryGovernance;
}) {
  const report = deriveGovernanceReport(governance);
  const exportJson = serializeGovernanceReport(report);
  const exportHref = `data:application/json;charset=utf-8,${encodeURIComponent(exportJson)}`;
  const exportDate = report.review.generated_at.slice(0, 10);

  return (
    <section
      className="governance-review"
      aria-label="Governance Reports and Review"
    >
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Delivery Governance</p>
          <h2>Governance Reports / Review</h2>
        </div>
        <a
          className="operator-link"
          href={exportHref}
          download={`governance-report-${exportDate}.json`}
        >
          Export governance report
        </a>
      </div>

      <section className="governance-formal-review" aria-labelledby="formal-review-heading">
        <div>
          <h3 id="formal-review-heading">Formal Governance Review</h3>
          <p>{report.review.summary}</p>
        </div>
        <strong className={`governance-review-status review-${report.review.status}`}>
          {statusLabel(report.review.status)}
        </strong>
        <p>
          Snapshot <code>{report.review.source_digest.slice(0, 12)}</code> ·{" "}
          <time dateTime={report.review.generated_at}>
            {report.review.generated_at}
          </time>
        </p>
      </section>

      <div className="governance-period-grid">
        <PeriodCard title="Weekly report" report={report.weekly} />
        <PeriodCard title="Monthly report" report={report.monthly} />
      </div>

      <div className="governance-issues-table">
        <table aria-label="Governance issues">
          <thead>
            <tr>
              <th scope="col">Issue</th>
              <th scope="col">Owner</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {report.issues.length ? (
              report.issues.map((issue) => (
                <tr key={issue.id}>
                  <th scope="row">
                    <span>{issue.category}</span>
                    {issue.summary}
                  </th>
                  <td>{issue.owner}</td>
                  <td>{issue.status}</td>
                  <td>{issue.evidence_refs.join(", ")}</td>
                  <td>{issue.source}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>No open governance issues.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="governance-attribution" aria-label="Delay attribution">
        <h3>Delay attribution</h3>
        {report.delay_attribution.length ? (
          <ul>
            {report.delay_attribution.map((item) => (
              <li key={item.category}>
                <strong>{item.category}</strong>
                <span>{item.evidence_refs.join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-text">No explicit delay attribution evidence.</p>
        )}
      </section>

      <section className="governance-quality" aria-labelledby="data-quality-heading">
        <h3 id="data-quality-heading">Data quality</h3>
        {report.data_quality.length ? (
          <ul>
            {report.data_quality.map((finding) => (
              <li key={finding.id}>
                <strong>{finding.id}</strong>
                <span>{finding.summary}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-text">No data-quality exception reported.</p>
        )}
      </section>

      <div className="governance-history-grid">
        <section aria-labelledby="revision-history-heading">
          <h3 id="revision-history-heading">Plan revision history</h3>
          {report.plan_revisions.length ? (
            <ol>
              {report.plan_revisions.map((revision) => (
                <li key={revision.id}>
                  <strong>{revision.id}</strong> · {revision.date} ·{" "}
                  {revision.summary} · {revision.approval}
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-text">No plan revisions reported.</p>
          )}
        </section>
        <section aria-labelledby="gate-history-heading">
          <h3 id="gate-history-heading">Gate history</h3>
          {report.gates.length ? (
            <ol>
              {report.gates.map((gate) => (
                <li key={gate.id}>
                  <strong>{gate.id}</strong> · {gate.date} · {gate.status} ·{" "}
                  {gate.evidence_summary || "Not recorded"}
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-text">No Gate decisions reported.</p>
          )}
        </section>
      </div>
    </section>
  );
}
