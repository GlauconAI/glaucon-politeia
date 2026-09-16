import type { ProjectCatalogAudit } from "#observatory-project-catalog-audit-schema";

export function ProjectCatalogAuditPanel({
  audit,
}: {
  audit: ProjectCatalogAudit | null;
}) {
  const findingGroups = audit
    ? [
        ["Unregistered surfaces", audit.unregistered_surfaces],
        ["Registered paths missing", audit.registered_paths_missing],
        ["Mapping incomplete", audit.mapping_incomplete],
      ] as const
    : [];
  const contractDrift = audit
    ? [
        ["Generated projections", audit.projection_drift],
        ["Shared mirror", audit.mirror_drift],
        ["Dashboard snapshot", audit.snapshot_drift],
      ] as const
    : [];

  return (
    <section className="observatory-project-catalog-audit" aria-labelledby="project-catalog-audit-title">
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">read-only consistency</p>
          <h2 id="project-catalog-audit-title">Project Catalog Audit</h2>
        </div>
        <span>{audit?.status ?? "unavailable"}</span>
      </div>
      {!audit ? (
        <p>Project Catalog audit is not available for this snapshot.</p>
      ) : (
        <>
          <p>
            This read-only audit reports drift after collection. It never adopts,
            deletes, moves, or ignores Project surfaces.
          </p>
          <p className="observatory-audit-meta">
            Collected <time dateTime={audit.collected_at}>{audit.collected_at}</time>
            {audit.error_code ? ` · ${audit.error_code}` : ""}
          </p>
          {findingGroups.map(([title, findings]) =>
            findings.length > 0 ? (
              <div key={title} className="observatory-audit-findings">
                <h3>{title}</h3>
                <ul>
                  {findings.map((finding) => <li key={finding}>{finding}</li>)}
                </ul>
              </div>
            ) : null,
          )}
          {audit.status === "failed" ? (
            <p>Consistency checks were not evaluated.</p>
          ) : (
            <ul className="observatory-audit-contracts" aria-label="Contract drift">
              {contractDrift.map(([label, drifted]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>{drifted ? "drift" : "aligned"}</strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
