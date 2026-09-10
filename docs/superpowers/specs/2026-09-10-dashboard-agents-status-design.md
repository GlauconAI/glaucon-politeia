# Dashboard Agents Status Design

## Goal

Make every configured OpenClaw Agent easy to inspect from the existing `/dashboard` page. The Dashboard must expose configured defaults, the latest Telegram Direct runtime values, and the latest runtime values for each Telegram group without creating a separate Agents route.

## Scope

- Add a stable, full-width `#dashboard-agents` section to `/dashboard`.
- Point the Agents summary card and section navigation directly to that anchor.
- Remove Agents from the mixed two-column Core objects grid to avoid duplicate and hard-to-find representations.
- Show each configured Agent even when runtime activity data is unavailable.
- Preserve all existing Dashboard routes, project data, governance panels, and read-only behavior.

## Information Architecture

Each Agent card contains three explicit layers:

1. **Default configuration** — configured Model and Thinking Level.
2. **Latest TD** — effective Model, effective Thinking Level, current run state, and last update time for the most recent Telegram Direct session.
3. **Telegram groups** — a collapsed list of the most recent session for every distinct Telegram group, with group name, effective Model, effective Thinking Level, run state, and last update time.

The card header also shows binding count and whether the Agent is the OpenClaw default. A runtime row receives an `Override` badge when either its effective Model or Thinking Level differs from the Agent default.

## Data Contract

Add Observatory collection schema v7 as an additive successor to v6. Existing v1-v6 snapshots remain valid and render with a bounded compatibility state.

The v7 envelope adds a top-level `agent_activity` projection:

- `status`: `ready`, `partial`, or `unavailable`.
- `collected_at`: ISO timestamp.
- `agents`: one record per configured Agent.
- Each record contains `agent_id`, nullable `default_thinking_level`, nullable `latest_direct`, and a bounded array of `telegram_groups`.
- Each activity row contains only a sanitized display label where applicable, effective Model, effective Thinking Level, whether each value came from an override or default, normalized run state, active-run flag, and update timestamp.

The existing `agents[].model_label` remains the configured default Model and is not duplicated in the new projection.

## Collection Flow

After the existing v6 snapshot is assembled, the collector runs bounded read-only OpenClaw CLI calls:

- `openclaw config get agents --json` for whitelisted per-Agent/global Thinking defaults.
- `openclaw gateway call sessions.list --json --params {"limit":500}` for current Direct and group activity.

The collector:

- accepts only Telegram Direct and Telegram group sessions;
- chooses the newest Direct row per Agent;
- chooses the newest row per distinct group per Agent;
- normalizes Model labels to include the provider when available;
- resolves effective Thinking as explicit `thinkingLevel`, then `thinkingDefault`, then unknown;
- sorts Agents by ID and groups by most recent update;
- hashes internal group/session identity for stable keys;
- never publishes raw session keys, chat IDs, private Direct display names, usernames, paths, command output, or config payloads.

If one source fails or returns malformed data, collection produces `partial` or `unavailable` activity instead of failing the entire Dashboard refresh. Configured Agents continue to render with available defaults and an explicit unavailable message.

## UI Components

Create a focused `AgentStatusDirectory` client component. `ObservatoryOverview` owns placement and supplies the validated snapshot; the component owns presentation only.

- Two-column card grid on wide screens, one column on narrow screens.
- Default and latest TD values are visible without interaction.
- Telegram groups use native `<details>` disclosure and are collapsed by default.
- Empty and unavailable states are written explicitly.
- Status and override cues use text as well as color.
- Timestamps use semantic `<time>` elements.

## Compatibility

- v1-v6 snapshots render Agent defaults from the existing `agents` array and state that live activity requires a v7 refresh.
- v7 validation remains strict and bounded.
- The v7 verifier accepts the same source-health domain count as v6 because Agent activity is a runtime projection, not a new filesystem source-health domain.
- Last-known-good Project Control retention accepts both v6 and v7 snapshots.

## Testing

- Collector unit tests cover CLI argv, default inheritance, Direct selection, group deduplication, override detection inputs, partial failures, bounds, and privacy redaction.
- Schema tests prove v7 validation and v1-v6 compatibility.
- Component tests prove the precise anchor, default/TD/group display, collapsed groups, override labels, and old-snapshot fallback.
- Page navigation tests prove the Agents section link.
- Focused tests run first; the repository release verification gate runs before PR creation.
- Production acceptance verifies authenticated desktop and mobile rendering, anchor navigation, group disclosure, and absence of private Direct identity data.

## Non-goals

- No `/dashboard/agents` route.
- No editing of Agent or session configuration.
- No historical trend charts.
- No non-Telegram channels.
- No database migration.
