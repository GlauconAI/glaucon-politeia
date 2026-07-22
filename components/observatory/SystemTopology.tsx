import type {
  ObservatoryAsset,
  ObservatoryRelationship,
} from "@/lib/observatory/asset-schema";

const VISUAL_EDGE_LIMIT = 20;

export function SystemTopology({
  assets,
  coreEndpointLabels,
  relationships,
}: {
  assets: ObservatoryAsset[];
  coreEndpointLabels: Record<string, string>;
  relationships: ObservatoryRelationship[];
}) {
  const labels = new Map(assets.map((asset) => [asset.id, asset.name]));
  Object.entries(coreEndpointLabels).forEach(([id, label]) => labels.set(id, label));

  return (
    <section className="observatory-topology" aria-labelledby="system-topology-heading">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Declared and observed links</p>
          <h2 id="system-topology-heading">System topology</h2>
        </div>
        <span>{relationships.length} relationships</span>
      </div>
      {relationships.length ? (
        <>
          <svg className="observatory-topology-map" viewBox="0 0 800 140" aria-hidden="true">
            {relationships.slice(0, VISUAL_EDGE_LIMIT).map((item, index) => {
              const row = index % 5;
              const column = Math.floor(index / 5);
              return (
                <line
                  key={`${item.from}:${item.to}:${item.kind}:${index}`}
                  x1={50 + column * 180}
                  y1={20 + row * 24}
                  x2={150 + column * 180}
                  y2={20 + row * 24}
                />
              );
            })}
          </svg>
          <ul className="observatory-relationship-list">
            {relationships.map((item, index) => (
              <li key={`${item.from}:${item.to}:${item.kind}:${index}`}>
                <p>
                  <strong>{labels.get(item.from) ?? item.from}</strong>{" "}
                  {item.kind}{" "}
                  <strong>{labels.get(item.to) ?? item.to}</strong>
                </p>
                <small>{item.authority} · <code>{item.source}</code></small>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="empty-text">No declared or observed relationships reported.</p>
      )}
    </section>
  );
}
