import type { ObservatoryAgentActivitySnapshot, ObservatoryAgentActivityRow } from "@/lib/observatory/agent-activity-schema";
import type { ObservatoryAgent } from "@/lib/observatory/collection-schema";

function statusLabel(status: ObservatoryAgentActivityRow["run_state"]): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formattedTime(value: string): string {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function hasOverride(activity: ObservatoryAgentActivityRow): boolean {
  return (
    activity.model_source === "override" ||
    activity.thinking_source === "override"
  );
}

function ActivityValues({ activity }: { activity: ObservatoryAgentActivityRow }) {
  return (
    <>
      <div className="agent-status-value-grid">
        <dl>
          <div>
            <dt>Model</dt>
            <dd>{activity.model_label}</dd>
          </div>
          <div>
            <dt>Thinking</dt>
            <dd>{activity.thinking_level}</dd>
          </div>
        </dl>
      </div>
      <div className="agent-status-meta">
        <span className={`agent-status-state agent-status-state-${activity.run_state}`}>
          {statusLabel(activity.run_state)}
        </span>
        {hasOverride(activity) ? (
          <span className="agent-status-override">Override</span>
        ) : null}
        <time dateTime={activity.updated_at}>{formattedTime(activity.updated_at)}</time>
      </div>
    </>
  );
}

export function AgentStatusDirectory({
  agents,
  activity,
}: {
  agents: readonly ObservatoryAgent[];
  activity?: ObservatoryAgentActivitySnapshot;
}) {
  const activityByAgent = new Map(
    activity?.agents.map((entry) => [entry.agent_id, entry]) ?? [],
  );

  return (
    <section
      id="dashboard-agents"
      className="agent-status-directory dashboard-section-anchor"
      aria-labelledby="agent-status-heading"
      data-dashboard-section
    >
      <div className="observatory-panel-heading">
        <div>
          <p className="eyebrow">Configured and effective runtime</p>
          <h2 id="agent-status-heading">Agent status</h2>
        </div>
        <span className="observatory-status-badge">{agents.length} Agents</span>
      </div>

      {!activity ? (
        <p className="agent-status-notice" role="status">
          Live TD and Telegram group activity requires the next validated refresh.
        </p>
      ) : activity.status !== "ready" ? (
        <p className="agent-status-notice" role="status">
          Runtime activity is {activity.status}; available configured values remain visible.
        </p>
      ) : null}

      {agents.length ? (
        <div className="agent-status-grid">
          {agents.map((agent) => {
            const agentActivity = activityByAgent.get(agent.id);
            const direct = agentActivity?.latest_direct ?? null;
            const groups = agentActivity?.telegram_groups ?? [];
            return (
              <article className="agent-status-card" key={agent.id}>
                <header className="agent-status-card-heading">
                  <div>
                    <h3>
                      {agent.emoji ? `${agent.emoji} ` : ""}
                      {agent.display_name || agent.id}
                    </h3>
                    <p>{agent.id}</p>
                  </div>
                  <div className="agent-status-card-badges">
                    {agent.default ? <span>Default Agent</span> : null}
                    <span>{agent.binding_count} bindings</span>
                  </div>
                </header>

                <section className="agent-status-layer">
                  <h4>Default configuration</h4>
                  <div className="agent-status-value-grid">
                    <dl>
                      <div>
                        <dt>Model</dt>
                        <dd>{agent.model_label || "Not reported"}</dd>
                      </div>
                      <div>
                        <dt>Thinking</dt>
                        <dd>{agentActivity?.default_thinking_level ?? "Not reported"}</dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <section className="agent-status-layer">
                  <h4>Latest TD</h4>
                  {direct ? (
                    <ActivityValues activity={direct} />
                  ) : (
                    <p className="empty-text">No TD activity reported.</p>
                  )}
                </section>

                <details className="agent-status-groups">
                  <summary>Telegram groups · {groups.length}</summary>
                  {groups.length ? (
                    <ul>
                      {groups.map((group) => (
                        <li key={group.identity}>
                          <div className="agent-status-group-heading">
                            <h4>{group.label}</h4>
                          </div>
                          <ActivityValues activity={group} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-text">No Telegram group activity reported.</p>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-text">No configured Agents reported.</p>
      )}
    </section>
  );
}
