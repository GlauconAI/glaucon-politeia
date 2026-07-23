import {
  deriveDeliveryRoadmap,
  type BaselineReviewStatus,
  type RoadmapRow,
} from "@/lib/observatory/delivery-roadmap";
import type { DeliveryGovernance } from "@/lib/observatory/governance-schema";

function displayDate(value: string): string {
  return value === "not_recorded" ? "Not recorded" : value;
}

function reviewLabel(status: BaselineReviewStatus): string {
  return {
    on_track: "On track",
    at_risk: "At risk",
    off_track: "Off track",
    unknown: "Unknown",
  }[status];
}

function dateOrdinal(value: string): number | null {
  if (value === "not_recorded") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
    86_400_000;
}

function position(
  value: string,
  domain: { start: string; end: string } | null,
): string | undefined {
  if (!domain) return undefined;
  const point = dateOrdinal(value);
  const start = dateOrdinal(domain.start);
  const end = dateOrdinal(domain.end);
  if (point === null || start === null || end === null) return undefined;
  if (start === end) return "50%";
  const percentage = ((point - start) / (end - start)) * 100;
  return `${Math.max(0, Math.min(100, percentage))}%`;
}

function Track({
  label,
  value,
  kind,
  domain,
}: {
  label: string;
  value: string;
  kind: "baseline" | "plan" | "actual";
  domain: { start: string; end: string } | null;
}) {
  const left = position(value, domain);
  return (
    <div className="roadmap-track">
      <span>{label}</span>
      <div aria-hidden="true">
        {left ? (
          <i className={`roadmap-marker roadmap-marker-${kind}`} style={{ left }} />
        ) : null}
      </div>
      <time dateTime={value === "not_recorded" ? undefined : value}>
        {displayDate(value)}
      </time>
    </div>
  );
}

function RoadmapItem({
  row,
  domain,
}: {
  row: RoadmapRow;
  domain: { start: string; end: string } | null;
}) {
  return (
    <li>
      <div className="roadmap-item-heading">
        <h3>{row.feature_id} · {row.feature_name}</h3>
        <code>{row.review_status}</code>
      </div>
      <Track
        label="Original Baseline"
        value={row.original_baseline}
        kind="baseline"
        domain={domain}
      />
      <Track
        label="Current Approved Plan"
        value={row.current_plan}
        kind="plan"
        domain={domain}
      />
      <Track label="Actual" value={row.actual} kind="actual" domain={domain} />
    </li>
  );
}

export function DeliveryRoadmap({
  governance,
}: {
  governance: DeliveryGovernance;
}) {
  const roadmap = deriveDeliveryRoadmap(governance);

  return (
    <section className="delivery-roadmap" aria-label="Three-track Roadmap">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Delivery Governance</p>
          <h2>Three-track Roadmap</h2>
        </div>
        <span className={`roadmap-review-badge roadmap-review-${roadmap.review.status}`}>
          {reviewLabel(roadmap.review.status)}
        </span>
      </div>

      <section className="roadmap-review" aria-labelledby="baseline-review-heading">
        <h3 id="baseline-review-heading">Baseline Review</h3>
        <p>{roadmap.review.summary}</p>
        <dl>
          <div><dt>On track</dt><dd>{roadmap.review.on_track_count}</dd></div>
          <div><dt>At risk</dt><dd>{roadmap.review.at_risk_count}</dd></div>
          <div><dt>Off track</dt><dd>{roadmap.review.off_track_count}</dd></div>
          <div><dt>Unknown</dt><dd>{roadmap.review.unknown_count}</dd></div>
        </dl>
        <p>
          First slip:{" "}
          <strong>
            {roadmap.first_slip
              ? `${roadmap.first_slip.feature_id} · +${roadmap.first_slip.variance_days} days`
              : "No evidenced slip"}
          </strong>
        </p>
      </section>

      {roadmap.rows.length ? (
        <ol className="roadmap-items">
          {roadmap.rows.map((row) => (
            <RoadmapItem key={row.feature_id} row={row} domain={roadmap.date_domain} />
          ))}
        </ol>
      ) : (
        <p className="empty-text">No roadmap items reported.</p>
      )}

      <div className="roadmap-table-wrap">
        <table aria-label="Roadmap date facts">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Original Baseline</th>
              <th scope="col">Current Approved Plan</th>
              <th scope="col">Actual</th>
              <th scope="col">Variance</th>
            </tr>
          </thead>
          <tbody>
            {roadmap.rows.map((row) => (
              <tr key={row.feature_id}>
                <th scope="row">{row.feature_id}</th>
                <td>{displayDate(row.original_baseline)}</td>
                <td>{displayDate(row.current_plan)}</td>
                <td>{displayDate(row.actual)}</td>
                <td>
                  {row.variance_days === null
                    ? "Not recorded"
                    : `${row.variance_days > 0 ? "+" : ""}${row.variance_days} days`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="roadmap-revisions" aria-labelledby="plan-revisions-heading">
        <h3 id="plan-revisions-heading">Plan revisions</h3>
        {roadmap.plan_revisions.length ? (
          <ol>
            {roadmap.plan_revisions.map((revision) => (
              <li key={revision.id}>
                <strong>{revision.id}</strong> · {displayDate(revision.date)} ·{" "}
                {revision.summary} · {revision.approval}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-text">No plan revisions reported.</p>
        )}
      </section>
    </section>
  );
}
