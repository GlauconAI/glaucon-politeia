import type { ProjectExecutionLine } from "@/lib/observatory/project-execution-schema";

function transferLabel(line: ProjectExecutionLine) {
  return line.transfer_mode === "project_executor"
    ? "Returns to PM"
    : "User + Owner line";
}

export function ProjectExecutionLanes({
  lines,
}: {
  lines: ProjectExecutionLine[];
}) {
  if (!lines.length) {
    return <p className="project-execution-no-lines">No execution lines reported.</p>;
  }

  return (
    <ol className="project-execution-lanes" aria-label="Execution lanes">
      {lines.map((line) => (
        <li key={line.line_id}>
          <article className="project-execution-lane">
            <div className="project-execution-lane-heading">
              <div>
                <p className="eyebrow">{line.stage_id}</p>
                <h4>{line.title}</h4>
              </div>
              <span className={`project-execution-status status-${line.status}`}>
                {line.status.replaceAll("_", " ")}
              </span>
            </div>
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>{line.owner_agent_id}</dd>
              </div>
              <div>
                <dt>Control</dt>
                <dd>{transferLabel(line)}</dd>
              </div>
              <div>
                <dt>Run</dt>
                <dd><code>{line.run_id}</code></dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd><time dateTime={line.updated_at}>{line.updated_at}</time></dd>
              </div>
            </dl>
            {line.transfer_mode === "independent_owner_line" &&
            line.status === "transferred" ? (
              <p className="project-execution-control-note">PM no longer waiting</p>
            ) : null}
            <p className="project-execution-dependencies">
              {line.dependencies.length
                ? `Depends on ${line.dependencies.join(", ")}`
                : "No dependencies"}
            </p>
            {line.artifact_ref ? (
              <p className="project-execution-evidence">
                <span>Artifact</span> <code>{line.artifact_ref}</code>
              </p>
            ) : null}
            {line.verification_summary ? (
              <p className="project-execution-evidence">
                <span>Verification</span> {line.verification_summary}
              </p>
            ) : null}
          </article>
        </li>
      ))}
    </ol>
  );
}
