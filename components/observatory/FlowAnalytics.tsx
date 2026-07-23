import {
  deriveDeliveryAnalytics,
  type DeliveryMetric,
} from "@/lib/observatory/delivery-analytics";
import type { DeliveryGovernance } from "@/lib/observatory/governance-schema";

function metricValue(metric: DeliveryMetric): string {
  if (metric.value === null) return "Not recorded";
  const value = Number.isInteger(metric.value)
    ? String(metric.value)
    : metric.value.toFixed(1);
  return `${value} ${metric.unit}`;
}

function MetricCard({
  label,
  metric,
}: {
  label: string;
  metric: DeliveryMetric;
}) {
  return (
    <article className="flow-metric-card">
      <h3>{label}</h3>
      <strong>{metricValue(metric)}</strong>
      <p>{metric.sample_size} evidence sample(s)</p>
      {metric.reason ? <small>{metric.reason}</small> : null}
    </article>
  );
}

export function FlowAnalytics({
  governance,
}: {
  governance: DeliveryGovernance;
}) {
  const analytics = deriveDeliveryAnalytics(governance);
  const metrics = [
    ["WIP", analytics.wip],
    ["Throughput · 30 days", analytics.throughput_30d],
    ["Age", analytics.age_days],
    ["Cycle Time", analytics.cycle_time_hours],
    ["SLE · P85", analytics.sle_hours],
    ["Blocked Time", analytics.blocked_time_hours],
    ["Waiting Time", analytics.waiting_time_hours],
    ["Rework", analytics.rework_runs],
    ["Prediction Error", analytics.prediction_error_days],
    ["Baseline Variance", analytics.baseline_variance_days],
  ] as const;
  const evidenceRefs = [
    ...new Set([
      ...metrics.flatMap(([, metric]) => metric.evidence_refs),
      ...analytics.forecast.evidence_refs,
    ]),
  ].sort();

  return (
    <section className="flow-analytics" aria-label="Flow Analytics and Forecast">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Delivery Governance</p>
          <h2>Flow Analytics / Forecast</h2>
        </div>
        <span className="observatory-status-badge">
          {analytics.forecast.status === "available"
            ? `${analytics.forecast.confidence} confidence`
            : "Evidence limited"}
        </span>
      </div>

      <div className="flow-metric-grid">
        {metrics.map(([label, metric]) => (
          <MetricCard key={label} label={label} metric={metric} />
        ))}
      </div>

      <section className="flow-forecast" aria-labelledby="completion-forecast-heading">
        <h3 id="completion-forecast-heading">Completion forecast</h3>
        {analytics.forecast.status === "available" ? (
          <>
            <p>
              Point forecast: <strong>{analytics.forecast.point_finish}</strong>
            </p>
            <p>
              Forecast interval:{" "}
              <strong>
                {analytics.forecast.interval_start} – {analytics.forecast.interval_end}
              </strong>
            </p>
            <p>
              {analytics.forecast.confidence} confidence · Remaining Tasks:{" "}
              {analytics.forecast.remaining_tasks}
            </p>
          </>
        ) : (
          <p>{analytics.forecast.reason}</p>
        )}
      </section>

      <div className="flow-throughput-table">
        <table aria-label="Daily throughput evidence">
          <thead>
            <tr>
              <th scope="col">Completion date</th>
              <th scope="col">Completed Tasks</th>
            </tr>
          </thead>
          <tbody>
            {analytics.daily_throughput.length ? (
              analytics.daily_throughput.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{day.date}</th>
                  <td>{day.count}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No dated Task completion evidence.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="flow-provenance" aria-labelledby="metric-provenance-heading">
        <h3 id="metric-provenance-heading">Metric provenance</h3>
        {evidenceRefs.length ? (
          <ul>
            {evidenceRefs.map((reference) => (
              <li key={reference}>{reference}</li>
            ))}
          </ul>
        ) : (
          <p className="empty-text">No metric source records available.</p>
        )}
        <p>
          Snapshot <code>{analytics.source_digest.slice(0, 12)}</code> ·{" "}
          <time dateTime={analytics.collected_at}>{analytics.collected_at}</time>
        </p>
      </section>
    </section>
  );
}
