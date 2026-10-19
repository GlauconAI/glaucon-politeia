# Dashboard daily refresh

## Contract

- Daily at 09:30 `America/Vancouver`; native OpenClaw command job, no model calls.
- One writer. Retire the broken launchd writer after the disabled replacement passes a forced canary.
- A private Telegram result is delivered by the scheduler for every run: publication/readback success or failure, new/modified/removed entity counts, current counts, and missing/stale source warnings.
- No change to Sinfonia monitoring jobs and no restoration of retired monitoring automations.
- Visible pages re-read the latest published snapshot every 60 seconds and on returning to the tab; this does not trigger collection.
- A page observation is a daily snapshot, not a live runtime. Snapshot age >30 hours is stale, independent of stored freshness flags. Execution/control input age is independently evaluated.
- Concerto Work Item counts on `/dashboard/projects` are live admin-authorized reads. They do not assert Project plan approval or replace public execution/control exports. Missing exports remain explicitly unavailable.
- Roadmap / Analytics / Review are labelled Dashboard development history.

## Installation

Use immutable source release directories under the owning Agent runtime, outside Git worktrees. Install exact candidate source and production dependencies, retain its revision receipt, and atomically select a `current` symlink only after verification. Keep mutable state in a separate private directory.

Run `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/observatory/daily-refresh.mjs /absolute/private/config.json` from the release directory. The config contains only absolute paths (no credential values): `stateDir`, `envFile`, `migrationStatePath`, `registryPath`, `workspaceRoot`, `vaultRoot`, `configPath`, `projectExecutionPath`, `projectControlPath`, `projectionRepository`, `mirrorPath`.

The dotenv file is parsed as data; only the existing Supabase endpoint/service credential is consumed internally. Released main projections are read from Git by exact SHA for each run, never the active development branch. Main HTML and shared registry must agree; remaining canonical catalog findings are reported, not silently repaired.

The launcher validates the current ACTIVE migration state, serializes the full run, seeds the comparison baseline from validated production data, invokes collection/publication, and verifies the exact published digest by readback. A failed publication does not advance the committed local baseline. No retention deletion is bundled with updates.

## Activation / acceptance

1. Pass `npm run release:verify`, independent review, Preview, and approved app merge. Deploy the app before publishing nullable unknown task counts.
2. Create replacement disabled with command argv (not shell expansion), private Telegram announce routing, timeout 1500 seconds, no-output timeout 1500 seconds, and a bounded output size.
3. Force one canary; require latest database digest, current models, registry count, private desktop/mobile reads, and notification receipt. Inspect zero model usage.
4. Unload the old launchd job; archive its plist and logs. Enable the native daily job; verify exactly one writer and next run in Vancouver time.
5. Document the schedule in OpenClaw Automations calendar. Read back the first natural daily run separately; a forced canary does not establish natural scheduling success.

## Recovery

Keep the previous immutable release. Pause the new scheduler before changing its active release. If a run fails, retain last valid production data and its collected-at date, report failure, retry next day. Do not restart the Gateway or alter other Agents' Work. A schema-incompatible app rollback requires first verifying snapshot compatibility.
