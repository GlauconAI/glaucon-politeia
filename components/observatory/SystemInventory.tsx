"use client";

import { useMemo, useState } from "react";

import type { ObservatoryAsset } from "@/lib/observatory/asset-schema";

type Domain =
  | "all"
  | "skills"
  | "tools_profiles"
  | "rules_config"
  | "knowledge_agenda"
  | "source_repositories"
  | "operations";

function domainFor(kind: ObservatoryAsset["kind"]): Exclude<Domain, "all"> {
  if (kind === "skill") return "skills";
  if (kind === "tool" || kind === "profile") return "tools_profiles";
  if (kind === "rule" || kind === "config") return "rules_config";
  if (kind === "knowledge" || kind === "agenda") return "knowledge_agenda";
  if (kind === "repository") return "source_repositories";
  return "operations";
}

export function SystemInventory({ assets }: { assets: ObservatoryAsset[] }) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<Domain>("all");
  const [health, setHealth] = useState("all");
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return assets.filter((asset) => {
      if (domain !== "all" && domainFor(asset.kind) !== domain) return false;
      if (health !== "all" && asset.health !== health) return false;
      if (!normalizedQuery) return true;
      return [
        asset.id,
        asset.kind,
        asset.name,
        asset.owner,
        asset.authority,
        asset.source,
        asset.summary,
        ...asset.labels.flatMap((item) => [item.key, item.value]),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
  }, [assets, domain, health, query]);

  return (
    <section className="observatory-system-inventory" aria-labelledby="system-inventory-heading">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Safe metadata only</p>
          <h2 id="system-inventory-heading">System inventory</h2>
        </div>
        <span>{filtered.length} shown</span>
      </div>
      <div className="observatory-inventory-controls">
        <label>
          <span>Search system assets</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, owner, source…"
          />
        </label>
        <label>
          <span>Asset domain</span>
          <select value={domain} onChange={(event) => setDomain(event.target.value as Domain)}>
            <option value="all">All domains</option>
            <option value="skills">Skills</option>
            <option value="tools_profiles">Tools &amp; profiles</option>
            <option value="rules_config">Rules &amp; config</option>
            <option value="knowledge_agenda">Knowledge &amp; agenda</option>
            <option value="source_repositories">Source repositories</option>
            <option value="operations">Operations</option>
          </select>
        </label>
        <label>
          <span>Asset health</span>
          <select value={health} onChange={(event) => setHealth(event.target.value)}>
            <option value="all">All health</option>
            <option value="healthy">Healthy</option>
            <option value="degraded">Degraded</option>
            <option value="failed">Failed</option>
            <option value="unknown">Unknown</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      {filtered.length ? (
        <ul className="observatory-inventory-list">
          {filtered.map((asset) => (
            <li key={asset.id} data-health={asset.health}>
              <article>
                <div className="observatory-object-title">
                  <h3 className="observatory-wrap">{asset.name}</h3>
                  <span>{asset.kind}</span>
                </div>
                <p>{asset.summary}</p>
                <dl>
                  <div><dt>Owner</dt><dd>{asset.owner}</dd></div>
                  <div><dt>Authority</dt><dd>{asset.authority}</dd></div>
                  <div><dt>Freshness</dt><dd><span>{asset.freshness}</span></dd></div>
                  <div><dt>Health</dt><dd>{asset.health}</dd></div>
                  <div className="observatory-inventory-source"><dt>Source</dt><dd><code>{asset.source}</code></dd></div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-text">
          {assets.length ? "No assets match the current filters." : "No system assets reported."}
        </p>
      )}
    </section>
  );
}
