import type { ObservatoryCollectionEnvelope } from "@/lib/observatory/collection-schema";

type SourceStatusProps =
  | {
      status: "ready";
      snapshot: ObservatoryCollectionEnvelope;
    }
  | { status: "empty" }
  | { status: "error"; message: string };

function formatUtcTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function SourceStatus(props: SourceStatusProps) {
  if (props.status === "empty") {
    return (
      <section
        className="observatory-source observatory-source-missing"
        aria-label="Snapshot source"
        data-status="missing"
      >
        <div className="observatory-panel-heading">
          <div>
            <p className="eyebrow">Source status</p>
            <h2>No system snapshot</h2>
          </div>
          <span className="observatory-status-badge">Missing</span>
        </div>
        <p role="alert">
          No snapshot has been published yet. Run the local collection and
          publication workflow when source access is available.
        </p>
        <p className="observatory-state-hint">
          Work Tracker remains available at /work-tracker while observation
          data is missing.
        </p>
      </section>
    );
  }

  if (props.status === "error") {
    return (
      <section
        className="observatory-source observatory-source-failed"
        aria-label="Snapshot source"
        data-status="failed"
      >
        <div className="observatory-panel-heading">
          <div>
            <p className="eyebrow">Source status</p>
            <h2>Snapshot unavailable</h2>
          </div>
          <span className="observatory-status-badge">Failed</span>
        </div>
        <p role="alert">{props.message}</p>
        <p className="observatory-state-hint">
          Work Tracker remains available at /work-tracker while observation
          data is unavailable.
        </p>
      </section>
    );
  }

  const { snapshot } = props;
  const { source } = snapshot.registry;
  const status = source.freshness;
  const statusLabel = status[0].toUpperCase() + status.slice(1);
  const announcement =
    status === "fresh"
      ? "The latest validated source snapshot is fresh."
      : status === "stale"
        ? "The latest validated source snapshot is stale. Treat system state as historical."
        : "Source freshness is unknown. Verify the collection workflow before relying on this state.";

  return (
    <section
      className={`observatory-source observatory-source-${status}`}
      aria-label="Snapshot source"
      data-status={status}
    >
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Canonical provenance</p>
          <h2>Snapshot source</h2>
        </div>
        <span className="observatory-status-badge">{statusLabel}</span>
      </div>

      <p role={status === "fresh" ? "status" : "alert"}>{announcement}</p>

      <dl className="observatory-provenance">
        <div>
          <dt>Owner</dt>
          <dd>{source.owner}</dd>
        </div>
        <div>
          <dt>Registry</dt>
          <dd>{snapshot.registry.registry_version}</dd>
        </div>
        <div>
          <dt>Collected</dt>
          <dd>
            <time dateTime={source.collected_at}>
              {formatUtcTimestamp(source.collected_at)} UTC
            </time>
          </dd>
        </div>
        <div>
          <dt>Generated</dt>
          <dd>
            <time dateTime={snapshot.generated_at}>
              {formatUtcTimestamp(snapshot.generated_at)} UTC
            </time>
          </dd>
        </div>
        <div className="observatory-provenance-wide">
          <dt>Logical reference</dt>
          <dd>{source.logical_reference}</dd>
        </div>
        <div>
          <dt>Digest</dt>
          <dd>
            <code title={snapshot.source_digest}>
              {snapshot.source_digest.slice(0, 12)}…
            </code>
          </dd>
        </div>
      </dl>
    </section>
  );
}
