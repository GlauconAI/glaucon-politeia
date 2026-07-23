# Dashboard System Observatory runbook

> Dashboard is the current external project name and `/dashboard` is the canonical route. Internal `observatory_*` identifiers and historical release evidence are intentionally preserved for compatibility.

This runbook retains the M1A release evidence and adds the completed System Observatory and first Delivery Governance workflow: collect a strict v3 Snapshot containing the v2 asset inventory plus a bounded Project Cockpit read model, publish the last-known-good Snapshot, prune bounded history, and operate automatic refresh without any Gateway lifecycle action. Collection is read-only. Migration, publication, deployment, and scheduling remain distinct release gates.

## Safety boundary

- Run collection from a clean checkout. The only expected output is `.observatory/observatory-snapshot.json`, which is ignored by Git and atomically written with mode `0600`.
- The canonical registry and `openclaw agents list --json` / `openclaw status --json` are read-only inputs. The collector never writes to the registry or OpenClaw runtime.
- Do not use `npm run supabase:apply-missing`, `npm run observatory:publish`, `npm run vercel:deploy`, a Cron command, or any Gateway lifecycle command as part of local verification.
- Never infer approval for one gate from approval of another. Production migration, first snapshot publication, deployment, scheduling, and the first user mutation each require an explicit owner decision.

## Local/test workflow

### 1. Establish a clean baseline

```bash
git status --short --branch
git rev-parse HEAD
npm ci
```

Do not continue from a worktree with unexplained tracked changes. `npm ci` is optional when the lockfile-matched dependencies are already installed; it can require network access.

### 2. Validate the migration without applying it remotely

The M1A migration is `supabase/migrations/20260721000100_openclaw_observatory_m1a.sql`. Its contract is covered by the migration suites:

```bash
npm test -- tests/migration-sql.test.ts tests/observatory-migration.test.ts
```

For an integration check, use a disposable local Supabase instance only. Bind its published ports to loopback through a dedicated Docker network, then rebuild the database from migrations and run the live contract verifier:

```bash
# OrbStack preflight: this setting takes effect after an OrbStack restart.
test "$(orbctl config get docker.expose_ports_to_lan)" = "false" || {
  orbctl config set docker.expose_ports_to_lan false
  echo "Restart OrbStack, then rerun this workflow."
  exit 1
}
docker network inspect observatory-local-loopback >/dev/null 2>&1 || \
  docker network create \
    -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 \
    observatory-local-loopback
supabase start \
  --network-id observatory-local-loopback \
  --exclude edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,storage-api,studio,supavisor,vector \
  --yes
supabase db reset --local --no-seed
npm run observatory:verify-local-db
```

Use `docker ps` to review the ports requested by the CLI, then use `lsof` to verify the effective host listeners. Supabase CLI's generic security notice and Docker metadata can still show `0.0.0.0`; on OrbStack the gate is `docker.expose_ports_to_lan=false` plus effective listeners for API port `54321` and database port `54322` on `127.0.0.1` only. Stop immediately if `lsof` shows either port on `[::]` or `*`. The verifier rejects any database URL whose host is not `127.0.0.1`/`localhost`, port is not `54322`, or database is not `postgres`. It checks live grants, RLS, role access, idempotency and conflicts, concurrent create/update behavior, RPC rollback, optimistic locking, immutability, append-only events, and `TRUNCATE` denial.

Do not set a remote `SUPABASE_DB_URL` for this check, and do not substitute the repository's remote `supabase:apply-missing` operation. A local reset is destructive to the disposable local database, so preserve any local data that matters before running it. When verification is complete and no disposable data is needed, remove the local stack and dedicated network:

```bash
supabase stop --no-backup
docker network rm observatory-local-loopback
```

### 3. Collect the real local v3 snapshot

```bash
umask 077
OBSERVATORY_REGISTRY_PATH="/Users/glaucon/Obsidian/Glaucon's Vault/🗺️ shared/projects/openclaw-orchestration-control/orchestration-system-design.html"
npm run observatory:collect -- "$OBSERVATORY_REGISTRY_PATH" ".observatory/observatory-snapshot.json"
git check-ignore -v .observatory/observatory-snapshot.json
```

For the complete System Observatory inventory, provide the explicit trusted roots. They are used only to derive bounded metadata; snapshot output never contains absolute paths or file content.

```bash
OBSERVATORY_WORKSPACE_ROOT="/Users/glaucon/.openclaw/workspace"
OBSERVATORY_VAULT_ROOT="/Users/glaucon/Obsidian/Glaucon's Vault"
OBSERVATORY_CONFIG_PATH="/Users/glaucon/.openclaw/openclaw.json"
npm run observatory:collect -- \
  "$OBSERVATORY_REGISTRY_PATH" \
  ".observatory/observatory-snapshot.json" \
  --workspace-root "$OBSERVATORY_WORKSPACE_ROOT" \
  --vault-root "$OBSERVATORY_VAULT_ROOT" \
  --config-path "$OBSERVATORY_CONFIG_PATH"
```

The legacy collector invokes only these OpenClaw commands, each with a 30-second timeout:

```text
openclaw agents list --json
openclaw status --json
```

The v3 collector extends that committed read-only allowlist with per-agent skill availability plus global plugin/tool, Cron, Gateway, and runtime summaries. It also projects only four exact Dashboard governance documents—README, Development Baseline, EDAD Tracker, and estimate calibration—into the strict Project Cockpit read model. Raw command objects, raw Markdown, Cron payloads, delivery destinations, session keys, config values, file contents, and absolute roots are never serialized.

If either input, command, schema validation, digesting, or atomic write fails, stop. Do not publish. The destination is replaced only after a complete validated write; an existing local last-known-good file remains intact on collection/rename failure.

### 4. Validate provenance, consistency, and privacy

Run the committed v3 verifier first. It reports only schema/count/check results, Project Cockpit counts, and privacy category counts; it never prints matched values.

```bash
npm run observatory:verify-snapshot -- .observatory/observatory-snapshot.json
```

The committed Zod schema is the allowlist: strict-object parsing rejects additional keys. The verifier below then checks source identity, supported versions, digest shape, summary consistency, known canonical counts, and denylist categories. It reports only category counts and never prints matching values.

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'VERIFY'
import { readFile } from "node:fs/promises";
import {
  ObservatoryCollectionEnvelopeSchema,
  OBSERVATORY_COLLECTION_SCHEMA_VERSION_V3,
  OBSERVATORY_COLLECTOR_VERSION_V3,
} from "./lib/observatory/collection-schema.ts";
import {
  OBSERVATORY_SNAPSHOT_SCHEMA_VERSION,
  ORCHESTRATION_REGISTRY_SCHEMA_VERSION,
  ORCHESTRATION_REGISTRY_LOGICAL_REFERENCE,
} from "./lib/observatory/schema.ts";

const raw = await readFile(".observatory/observatory-snapshot.json", "utf8");
const snapshot = ObservatoryCollectionEnvelopeSchema.parse(JSON.parse(raw));
const deny = {
  secret_key: /(?:password|passwd|secret|token|credential|authorization|cookie|private[_-]?key|api[_-]?key|service[_-]?role)/iu,
  secret_value: /(?:bearer\s+[a-z0-9._~+/=-]+|(?:sk|ghp|xox[abprs])-?[a-z0-9_-]{16,}|eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,})/iu,
  session_data: /(?:session(?:key|id|path|token)?|agent:[^\s:/]+:[^\s/]+)/iu,
  absolute_or_private_path: /(?:\/(?:Users|home)\/|[a-z]:\\|\.openclaw\/|Obsidian\/|Glaucon[^/]*Vault)/iu,
  email: /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/iu,
  raw_knowledge_key: /^(?:raw|content|body|markdown|html|note|notes|prompt|transcript|document|knowledge)$/iu,
  profile_data_key: /^(?:profile|avatar|bio|phone|address|birthday|birthdate|account|username|user_id)$/iu,
};
const violations = Object.fromEntries(Object.keys(deny).map((key) => [key, 0]));
function scan(value) {
  if (Array.isArray(value)) return value.forEach(scan);
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (deny.secret_key.test(key)) violations.secret_key++;
      if (deny.session_data.test(key)) violations.session_data++;
      if (deny.raw_knowledge_key.test(key)) violations.raw_knowledge_key++;
      if (deny.profile_data_key.test(key)) violations.profile_data_key++;
      scan(child);
    }
  } else if (typeof value === "string") {
    if (deny.secret_value.test(value)) violations.secret_value++;
    if (deny.session_data.test(value)) violations.session_data++;
    if (deny.absolute_or_private_path.test(value)) violations.absolute_or_private_path++;
    if (deny.email.test(value)) violations.email++;
  }
}
scan(snapshot);

const counts = {
  projects: snapshot.registry.project_groups.reduce((n, group) => n + group.projects.length, 0),
  primary_scenes: snapshot.registry.scenes.length,
  secondary_scenes: snapshot.registry.summary.secondary_scene_count,
  execution_flows: snapshot.registry.execution_flows.length,
  agents: snapshot.agents.length,
  bindings: snapshot.agents.reduce((n, agent) => n + agent.binding_count, 0),
  assets: snapshot.assets.length,
  relationships: snapshot.relationships.length,
  milestones: snapshot.delivery_governance.summary.milestone_count,
  features: snapshot.delivery_governance.summary.feature_count,
  tasks: snapshot.delivery_governance.summary.task_count,
  executor_runs: snapshot.delivery_governance.summary.run_count,
  gates: snapshot.delivery_governance.summary.gate_count,
};
const checks = {
  collection_schema: snapshot.schema_version === OBSERVATORY_COLLECTION_SCHEMA_VERSION_V3,
  collector_version: snapshot.collector_version === OBSERVATORY_COLLECTOR_VERSION_V3,
  snapshot_schema: snapshot.registry.schema_version === OBSERVATORY_SNAPSHOT_SCHEMA_VERSION,
  registry_schema: snapshot.registry.registry_schema_version === ORCHESTRATION_REGISTRY_SCHEMA_VERSION,
  source_reference: snapshot.registry.source.logical_reference === ORCHESTRATION_REGISTRY_LOGICAL_REFERENCE,
  source_authority: snapshot.registry.source.authority === "canonical",
  source_owner: snapshot.registry.source.owner === "Socrates",
  freshness: snapshot.registry.source.freshness === "fresh" && snapshot.summary.freshness === "fresh",
  digest_shapes: /^[a-f0-9]{64}$/.test(snapshot.source_digest) && /^[a-f0-9]{64}$/.test(snapshot.registry.source.digest),
  project_summary: counts.projects === snapshot.registry.summary.project_count && counts.projects === snapshot.summary.project_count,
  scene_summary: counts.primary_scenes === snapshot.registry.summary.primary_scene_count && counts.primary_scenes === snapshot.summary.primary_scene_count,
  flow_summary: counts.execution_flows === snapshot.registry.summary.execution_flow_count && counts.execution_flows === snapshot.summary.execution_flow_count,
  agent_summary: counts.agents === snapshot.summary.agent_count,
  binding_summary: counts.bindings === snapshot.summary.binding_count,
  runtime_summary: snapshot.runtime.configured_agent_count === snapshot.summary.configured_agent_count && JSON.stringify(snapshot.runtime.task_totals) === JSON.stringify(snapshot.summary.task_totals),
  canonical_counts: counts.projects === 62 && counts.primary_scenes === 37 && counts.secondary_scenes === 10,
  governance_counts: counts.milestones === 5 && counts.features === 17 && counts.tasks === 74 && counts.executor_runs === 28 && counts.gates === 11,
};
console.log(JSON.stringify({ schema: "pass", counts, checks, privacy_category_counts: violations }, null, 2));
if (Object.values(checks).some((value) => !value) || Object.values(violations).some((value) => value !== 0)) process.exitCode = 1;
VERIFY
```

Any nonzero privacy category requires investigation without printing or pasting the candidate value. Delete or quarantine the local artifact, fix the whitelist with a RED regression test first, recollect, and rescan. Never publish an artifact that fails this gate.

### 5. Run the quality gates

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short --branch
```

If resources are constrained, Vitest can be serialized with `npm test -- --maxWorkers=1 --no-file-parallelism`. A sandbox can prevent Turbopack from creating its local helper process or binding a loopback port; in that case rerun the exact build under approved local verification permissions. Do not change application behavior to bypass a sandbox restriction.

## Automatic refresh, recovery, and retention

### One-shot refresh

The refresh command takes the registry, workspace root, Vault root, and optional config path as positional arguments. It acquires `.observatory/refresh.lock` exclusively, collects into the local last-known-good file, validates and publishes it idempotently, and writes only bounded state to `.observatory/refresh-state.json`. Lock and state files are mode `0600`; raw stderr is discarded.

The outer collection/publication step allows 10 minutes. This is calibrated for the sequential 1,600+ asset host inventory while remaining below the 15-minute schedule; the exclusive lock rejects overlap. Do not use `launchctl kickstart -k` as a short health probe while a refresh is running, because it terminates the valid in-flight collection and records a failure. Wait for the job to exit, then verify the Snapshot mtime and refresh state.

The macOS LaunchAgent must use `ProcessType=Standard`. `Background` applies stricter CPU and I/O limits; at production scale it caused the core `openclaw agents list --json` command to exceed its trusted 30-second bound even though the same command completed in about five to six seconds in a normal host shell. Do not use `Interactive`; the refresh is not user-interactive. On a failed child step, the orchestrator may retain up to 8 KiB in memory only long enough to reduce stderr to a whitelisted error code such as `COMMAND_TIMEOUT_AGENTS`; raw child output must never enter notification text or refresh state.

```bash
npm run observatory:refresh -- \
  "$OBSERVATORY_REGISTRY_PATH" \
  "$OBSERVATORY_WORKSPACE_ROOT" \
  "$OBSERVATORY_VAULT_ROOT" \
  "$OBSERVATORY_CONFIG_PATH"
```

Safe machine-readable results are:

- `OBSERVATORY_REFRESH_OK`: collection and publication succeeded.
- `OBSERVATORY_REFRESH_SKIPPED_LOCKED`: another run owns the fresh lock; this is a safe overlap skip.
- `OBSERVATORY_REFRESH_FAILURE`: the third consecutive failure threshold was reached.
- `OBSERVATORY_REFRESH_STALE`: no success has occurred for 45 minutes; emitted once until recovery.
- `OBSERVATORY_REFRESH_RECOVERY`: the first success after failure or stale state.

Every failed attempt exits nonzero with the generic `OBSERVATORY_REFRESH_FAILED` message. A failed candidate never replaces the local last-known-good Snapshot and is never published.

### Failure and recovery drill

Use an intentionally missing registry path; do not alter Gateway, Cron, or production credentials. Execute three times to reach the notification threshold, inspect only the safe state counters, then run once with the canonical path and require one recovery code.

```bash
for attempt in 1 2 3; do
  npm run observatory:refresh -- \
    ".observatory/missing-registry.html" \
    "$OBSERVATORY_WORKSPACE_ROOT" \
    "$OBSERVATORY_VAULT_ROOT" \
    "$OBSERVATORY_CONFIG_PATH" || true
done
npm run observatory:refresh -- \
  "$OBSERVATORY_REGISTRY_PATH" \
  "$OBSERVATORY_WORKSPACE_ROOT" \
  "$OBSERVATORY_VAULT_ROOT" \
  "$OBSERVATORY_CONFIG_PATH"
```

### Release evidence and retention

The migration `20260722000100_observatory_snapshot_retention.sql` preserves table immutability for every direct caller and exposes two `service_role`-only RPCs. Mark release evidence before pruning. Retention keeps the newest 30 non-release Snapshots plus every release-marked Snapshot.

```bash
npm run observatory:mark-release -- .observatory/observatory-snapshot.json
npm run observatory:retention -- 30
```

Both commands require server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. They reject remote HTTP, invalid digests, and retention counts outside 1–365. Never put either credential in a Cron payload, command argument, Snapshot, Git file, or client environment.

### Disable and rollback

Disable the OpenClaw refresh Cron first. Do not restart Gateway. The UI remains on the latest successful Snapshot. If v2 rendering is rolled back, v1 history remains readable. The retention migration is additive; leave the column and restricted RPCs in place during an application rollback. Emergency database rollback means revoking both retention RPCs, not deleting Snapshot history.

## Staging/readiness gate

Staging is an external-write environment, not an extension of local verification. Before any staging action, obtain approval for the exact environment and action.

1. Use an isolated staging Supabase project and staging deployment. Confirm no production URL, database URL, or service-role key is loaded.
2. Review and apply only `20260721000100_openclaw_observatory_m1a.sql` after its prerequisite migrations. Confirm all three Dashboard tables with legacy `observatory_*` identifiers have RLS enabled, snapshots are immutable, work-item events are append-only, and only admins can read through authenticated policies.
3. Configure the application with staging `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the repository's existing server-only Supabase credential. Keep database connection strings out of Vercel.
4. Recollect and pass the local schema/privacy gate. With separate publication approval, provide `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only to the server-side publisher process, then run `npm run observatory:publish -- .observatory/observatory-snapshot.json`.
5. Verify publication idempotency by digest, latest-successful selection, admin rendering, anonymous and non-admin redirect, invalid-payload error state, and responsive/keyboard behavior.
6. With explicit approval for a staging user write, submit one Idea/Feature/Bug via Quick Capture and verify one inbox item plus one append-only `created` event. Reusing the same idempotency key with the same content must not duplicate; different content must conflict.

Readiness is evidence, not permission to promote.

## Production and user gates

The owner must explicitly approve each of these gates, in order:

1. **Production migration:** target project and exact migration SHA reviewed; backup/recovery posture accepted; migration applied and RLS/readiness queries recorded.
2. **Production credentials:** correct environment binding confirmed; service-role and database credentials remain server/operator only and are never exposed through `NEXT_PUBLIC_*`, Git, logs, snapshot JSON, or client bundles.
3. **First production snapshot publication:** the exact digest and privacy-scan result reviewed; `npm run observatory:publish` authorized against the named production Supabase URL.
4. **Deployment:** production build evidence reviewed; the exact Vercel deployment authorized; auth callback and admin identity verified.
5. **First user mutation:** an authorized admin explicitly approves a production Quick Capture smoke test and its retained audit row.
6. **Automation:** create or update only the approved isolated 15-minute refresh Cron after all System Observatory production gates pass. The payload may run collect/publish/retention and announce only safe failure/stale/recovery codes. It must never contain secrets or a Gateway start/stop/restart/update action.

## Last-known-good, stale state, and rollback

- **Collection failure:** no failed artifact is publishable. Atomic local writes preserve the previous destination on failure.
- **Publication failure:** the publisher validates the strict schema and both digests before network I/O. A rejected request inserts nothing. A `409` is success only after the digest is confirmed, so the database keeps the existing row.
- **Last-known-good read:** `/dashboard` selects the newest row whose status is `success`; `/observatory` is only a legacy redirect. If collection or publication fails, the previously published successful row remains available.
- **Stale/unknown display:** the UI visibly warns when a validated payload says `stale` or `unknown`; invalid payloads are not rendered. M1A does not derive freshness from wall-clock age, and the current successful collector labels its source `fresh`. Therefore an aging last-known-good snapshot can still carry `fresh`; operators must compare `generated_at` with an owner-approved maximum age before relying on it. Automated age-based staleness is a post-M1A concern.
- **Application rollback:** redeploy the previously approved application build. Snapshot and event data remain untouched.
- **Bad but schema-valid latest snapshot:** snapshots are immutable. Do not update/delete the row. Correct the source or collector, repeat all local gates, and—with publication approval—publish a newer corrected snapshot.
- **Migration rollback:** do not drop Dashboard tables with legacy `observatory_*` identifiers or disable protections during an incident. Roll back the application first. Any schema reversal must be a separately reviewed forward migration with backup and explicit production approval.

## Credential handling

- `SUPABASE_SERVICE_ROLE_KEY` is accepted only by the server-side publisher. Supply it through the approved secret manager or ephemeral process environment, not command arguments, shell history, snapshot files, tickets, or chat.
- `SUPABASE_URL` must be HTTPS; plain HTTP is accepted only for loopback development.
- `SUPABASE_DB_URL` is an operator-only migration/readiness credential and must never be configured in Vercel production.
- Keep `.env*` and `.observatory/` untracked. Verify artifact mode is `0600`. Do not print raw CLI JSON or privacy-scan matches.
- If any credential might have entered an artifact or log, stop publication, restrict access to the artifact, rotate the credential through its owner, and repeat collection and scanning.

## M1A local release evidence (2026-07-22)

- Starting commit: `811c378e46033b760857f52ea67935e04a4f4803` on `feat/observatory-m1a`; tracked worktree clean before collection.
- Real collection succeeded against the canonical Socrates registry and read-only OpenClaw CLI. The ignored artifact was 43,362 bytes with mode `0600`.
- Strict schema/provenance/summary validation passed: 62 projects, 37 primary scenes, 10 secondary scenes, 4 execution flows, 14 agents, and 10 bindings. Secret keys/values, session data, private paths, emails, raw knowledge keys, and profile-data keys each scanned at zero findings.
- `npm test`: 46 files and 243 tests passed. `npm run lint` and `npm run typecheck`: exit 0. `npm run build`: compiled successfully and confirmed `/observatory` as dynamic.
- The initial sandboxed collector status query and build were blocked by local runtime/port permissions; each exact command passed when rerun with approved local verification permissions. No source change was made for either sandbox-only failure.
- No production migration, snapshot publication, Vercel deployment, Cron creation, Gateway lifecycle/change command, or external user write was performed.

### Disposable database integration evidence

- Starting commit: `5830636ae65546b0423c1c38619429d8e64b6ca9` on local `main`, verified in isolated branch `chore/observatory-m1a-local-integration`.
- Runtime: OrbStack 2.2.1, Docker Engine 29.4.0, and Supabase CLI 2.109.1. OrbStack LAN port exposure was disabled before the accepted run.
- `supabase db reset --local --no-seed` recreated the disposable database and applied every migration from zero through `20260721000100_openclaw_observatory_m1a.sql`.
- The live verifier passed 24 checks covering exact grants, RLS and anonymous/non-admin/admin access, service Snapshot insert, direct-write denial, Quick Capture authorization, idempotent retry and payload conflict, concurrent create/update, optimistic-lock conflict, RPC rollback, Snapshot immutability, append-only Events, and `TRUNCATE` denial.
- Effective API and database listeners were both restricted to `127.0.0.1`; a probe through the Mac's LAN address confirmed database port `54322` was blocked.
- No production database, remote Supabase project, publication endpoint, Vercel deployment, Cron, Gateway, or retained external user data was touched.

## M2 Project Cockpit local release evidence (2026-07-22)

- Base: production `main` at `a85cd35410b0614b1bf2707835d0474a54d88c0d`; implementation remained isolated on `feat/dashboard-m2-cockpit`. The unrelated anonymous-engagement working-tree changes were not present in or copied into this branch.
- The strict v3 dogfood projection reads exactly four allowlisted Dashboard governance documents and produced 5 Milestones, 17 Features, 74 Tasks, 28 Executor Runs, and 11 Gate decisions. Every Feature retained its bounded Gate requirement; aliased wiki evidence retained only its display label.
- The final real ignored v3 artifact was 1,143,196 bytes with mode `0600` and digest `f559305dcbaa344e0f8e9f17562f60c00b002be7f4051349d58cd902ebcb1597`. It also retained 1,604 System Observatory assets, 1,447 relationships, and all 6 source-health domains.
- Strict schema, digest, relationship, source-domain and summary checks passed. Eight privacy categories—private paths, browser data, configuration/payload data, email, raw content, secret keys, secret values and session data—each reported zero findings.
- Final local quality gate: 63 test files / 307 tests, lint, typecheck, production build and diff check passed. The production build confirmed `/dashboard` remains dynamically server-rendered and `/observatory` remains the static compatibility redirect.
- No production Snapshot was published, no Vercel deployment was created, and no Supabase, Cron, LaunchAgent, Gateway or external user state was changed. Production release remains an explicit shared-`main` Gate.

## M2 Delivery Governance completion local release evidence (2026-07-23)

- Base: production `main` at `83d972d66cc5347b6e8b45684239a4e54aba01ad`; implementation remained isolated on `feature-dashboard-m2-delivery-governance-complete`. The unrelated anonymous-engagement changes in the main worktree were not copied into this branch.
- The strict v3 read model remains backward compatible. It now projects bounded `DIR-*` plan revision history and optional Actual date columns while accepting older v3 Snapshots that do not contain `plan_revisions`.
- Three read-only M2 views were added after Project Cockpit:
  - native Three-track Roadmap for Original Baseline / Current Approved Plan / Actual, variance, first slip, plan revisions, semantic table fallback, and deterministic Baseline Review;
  - Flow Analytics / Forecast for WIP, Throughput, Age, Cycle Time, P85 SLE, Rework, baseline variance, prediction error, forecast interval/confidence, provenance, and explicit insufficient-evidence states;
  - Governance Reports / Review for formal status, weekly/monthly reports, data quality, source-linked issues, explicit delay attribution, revision/Gate history, and bounded sanitized JSON export.
- Blocked and Waiting duration are never inferred from labels. Forecasting requires at least three completed Tasks across two completion dates; SLE requires at least five completed Task cycle-time samples. Missing evidence remains `Not recorded` or `Insufficient evidence`.
- Fresh full local quality gate: 69 test files / 325 tests, lint, typecheck, and production build passed. The build confirmed `/dashboard` remains dynamically server-rendered and `/observatory` remains the static compatibility route.
- Fresh real ignored candidate: schema `3.0.0`, digest `5ca90e7aa5cb0589f33dab90cd92e16a610b9f021d47acb23a3dece412bf6836`, 1,145,318 bytes, mode `0600`; 1,604 assets / 1,447 relationships / 6 source-health domains plus 5 Milestones / 17 Features / 74 Tasks / 28 Executor Runs / 12 Gates / 3 Plan Revisions.
- The committed verifier passed mode, digest, success, six-domain, relationship-integrity, and privacy checks. All eight privacy categories reported zero findings.
- The initial sandboxed collector and Turbopack build were blocked by host process/runtime restrictions; the exact bounded commands passed with approved host execution. No source or implementation change was made to bypass either restriction.
- No production Snapshot was published, no Vercel deployment was created, and no Supabase, Cron, LaunchAgent, Gateway or external user state was changed by this local Gate. Production release uses the existing shared-main / Vercel / natural-refresh / authenticated-smoke Gate.

## M3 manual Work Tracker core local release evidence (2026-07-23)

- Base: production `main` at `417501e234ac7e0325d34b0539f8d15857aaa44c`; implementation remained isolated on `feature-m3-work-tracker-core`. The unrelated anonymous-engagement changes in the main worktree were not copied into this branch.
- The admin-only write surface now includes the complete manual workflow: Inbox, Triage, Ready, In Progress, Review, Done, Blocked, Waiting, and Reopened. The database rejects every transition outside the committed graph.
- Entering Ready, or moving directly from Reopened to In Progress, requires non-empty acceptance criteria, a priority, and an owner. Every field edit, transition, evidence addition, and evidence soft removal uses a row lock plus `expected_version`, increments the work-item version, and writes an append-only event in the same transaction.
- Direct table writes remain denied. Evidence accepts bounded HTTP(S) links, is admin-readable only, and is soft-removed so its audit history remains intact. Anonymous and non-admin callers cannot read Work Tracker tables or execute mutation RPCs.
- `/dashboard` now renders the accessible Work Tracker Board beneath the existing read-only governance surfaces. Native drag is optional; every allowed move is also exposed through a labeled keyboard-operable form. `/dashboard/work-items/[id]` provides bounded fields, Ready Gate guidance, transitions, evidence controls, and chronological history.
- A clean `supabase db reset --local --no-seed` applied every migration through `20260723000100_work_tracker_core.sql`. The live verifier passed 32 checks covering exact grants, RLS, anonymous/non-admin/admin access, direct-write denial, idempotency, concurrent create/update, optimistic conflicts, Ready Gate, legal and illegal transitions, invalid evidence URL rejection, evidence audit/soft removal, RPC rollback, immutability, retention, append-only events, and `TRUNCATE` denial.
- Fresh local quality Gate: 72 test files / 365 tests, lint, typecheck, and production build passed. The build confirmed `/dashboard` and `/dashboard/work-items/[id]` are dynamically server-rendered while `/observatory` remains the compatibility route.
- The disposable Supabase stack was removed with `supabase stop --no-backup`; loopback ports `54321` and `54322` were closed and OrbStack was returned to its original stopped state.
- No production database migration, shared-main push, Vercel deployment, Cron, Gateway action, or retained production Work Item was performed. Production release requires explicit approval for the M3 migration, shared-main push/deployment, and the first retained admin workflow smoke.

### M3 rollback

- Before production, discard or revert the feature commits; the production database and application are unchanged.
- After production migration, roll back the application first by redeploying the previously approved build. Do not drop Work Tracker tables, delete evidence/history, or weaken RLS/append-only protections during an incident.
- Any schema correction or RPC rollback must be a reviewed forward migration with a backup/recovery decision and explicit production approval.

## M3 manual Work Tracker core Production Gate (2026-07-23)

- The authorized release fast-forwarded `main` from `417501e234ac7e0325d34b0539f8d15857aaa44c` through the M3 candidate and production-smoke fix `430981d7056a3f05121f17b0569b15a6ec1ea3ec`. The unrelated anonymous-engagement working-tree changes remained uncommitted and were excluded from both pushes.
- Before migration, a restricted schema-only production backup was captured with mode `0600`, size 44,336 bytes, and SHA-256 `2417e78fe0bbe89f8c84a78ffff4709098eba7423750313028d76cbc3b5ccd27`. Its bounded inspection confirmed the prior Observatory schema and the absence of the new evidence table.
- Production migration history was reconciled to the already-live schema, then `20260723000100_work_tracker_core.sql` was the only dry-run change and was applied. Its SHA-256 is `cbf2e7924d9658ffb3234042331cba3f7b1eb2ef5cd48a5fd5afc586a93aa1fc`.
- Read-only production verification confirmed the migration record, five workflow columns, evidence table with RLS, exactly four guarded mutation RPCs, authenticated select-only evidence grants, and denied direct evidence writes.
- The first exact application deployment was `dpl_8xbiyT5VaH82ku1EryWA9PJHJvaE` for candidate `89417ab9d5e749b742c76eea9e12379fe6aa4178`. Authenticated smoke then exposed a React form-reset display defect for newly selected priority and owner fields. A failing regression test reproduced it; the fix retained controlled select state across successful Server Actions and passed 72 test files / 366 tests, lint, typecheck, and a production build.
- The corrected exact-code deployment is `dpl_G6sAtBvVQLZRCPSYvq7QTCPdZLhS`, state `READY`, for `430981d7056a3f05121f17b0569b15a6ec1ea3ec`.
- Retained production item `6b59ca0f-7480-4a21-8eb0-15d03ac8db4d` completed the full workflow and remains in Done at version 20 with acceptance criteria, High priority, owner, Dashboard project reference, and M3 milestone reference. Ready Gate rejection was verified before completing the required fields.
- Its append-only history contains 1 created event, 4 field-update events, 13 state-transition events, 1 evidence-added event, and 1 evidence-removed event. The exact transition sequence covered Inbox, Triage, Ready, In Progress, Blocked, Waiting, Review, Done, Reopened, and returned to Done. Evidence soft removal left 1 historical row and 0 active links.
- The authenticated Board shows the retained item in Done; the item detail shows the complete chronological history; browser page errors, application alerts, and console output are empty. Anonymous `/dashboard` and the work-item detail route return authentication redirects, while `/observatory` preserves its permanent redirect to `/dashboard`.
- Rollback remains application-first. Database correction requires a reviewed forward migration; the retained work item and append-only history must not be deleted to simulate rollback.
