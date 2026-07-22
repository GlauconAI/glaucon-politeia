import type { ObservatorySourceHealth } from "@/lib/observatory/asset-schema";

function label(domain: ObservatorySourceHealth["domain"]): string {
  return domain.replaceAll("_", " & ");
}

export function FreshnessSummary({
  sources,
}: {
  sources: ObservatorySourceHealth[];
}) {
  const healthy = sources.filter((source) => source.health === "healthy").length;
  const degraded = sources.filter((source) => source.health === "degraded").length;
  const failed = sources.filter((source) => source.health === "failed").length;

  return (
    <section className="observatory-source-health" aria-label="Source health">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Age-derived freshness</p>
          <h2>Source health</h2>
        </div>
        <div className="observatory-health-counts" aria-label="Health totals">
          <span>{healthy} healthy</span>
          <span>{degraded} degraded</span>
          <span>{failed} failed</span>
        </div>
      </div>
      <ul className="observatory-source-health-list">
        {sources.map((source) => (
          <li key={source.domain} data-health={source.health}>
            <div>
              <strong>{label(source.domain)}</strong>
              <span>{source.asset_count} assets</span>
            </div>
            <div>
              <span>{source.status}</span>
              {source.error_code ? <code>{source.error_code}</code> : null}
            </div>
            <small>
              Last success: {source.last_success_at ? (
                <time dateTime={source.last_success_at}>{source.last_success_at}</time>
              ) : (
                "none recorded"
              )}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
