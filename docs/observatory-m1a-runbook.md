# OpenClaw Observatory M1A runbook

This runbook covers the M1A local vertical slice: validate the migration contract, collect a privacy-reduced snapshot from the canonical registry and read-only OpenClaw CLI, verify it locally, and prepare an explicitly approved staging or production release. Collection is read-only. Migration, publication, deployment, scheduling, Gateway changes, and user-facing Quick Capture checks are separate write gates.

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

For an integration check, use a disposable local Supabase instance only. Confirm the CLI is targeting local loopback, then run:

```bash
supabase status
supabase db reset --local
```

Do not set a remote `SUPABASE_DB_URL` for this check, and do not substitute the repository's remote `supabase:apply-missing` operation. A local reset is destructive to the disposable local database, so preserve any local data that matters before running it.

### 3. Collect the real local snapshot

```bash
umask 077
OBSERVATORY_REGISTRY_PATH="/Users/glaucon/Obsidian/Glaucon's Vault/🗺️ shared/projects/openclaw-orchestration-control/orchestration-system-design.html"
npm run observatory:collect -- "$OBSERVATORY_REGISTRY_PATH" ".observatory/observatory-snapshot.json"
git check-ignore -v .observatory/observatory-snapshot.json
```

The collector invokes only these OpenClaw commands, each with a 10-second timeout:

```text
openclaw agents list --json
openclaw status --json
```

If either input, command, schema validation, digesting, or atomic write fails, stop. Do not publish. The destination is replaced only after a complete validated write; an existing local last-known-good file remains intact on collection/rename failure.

### 4. Validate provenance, consistency, and privacy

The committed Zod schema is the allowlist: strict-object parsing rejects additional keys. The verifier below then checks source identity, supported versions, digest shape, summary consistency, known canonical counts, and denylist categories. It reports only category counts and never prints matching values.

```bash
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module <<'VERIFY'
import { readFile } from "node:fs/promises";
import {
  ObservatoryCollectionEnvelopeSchema,
  OBSERVATORY_COLLECTION_SCHEMA_VERSION,
  OBSERVATORY_COLLECTOR_VERSION,
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
};
const checks = {
  collection_schema: snapshot.schema_version === OBSERVATORY_COLLECTION_SCHEMA_VERSION,
  collector_version: snapshot.collector_version === OBSERVATORY_COLLECTOR_VERSION,
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

If resources are constrained, Vitest can be serialized with `npm test -- --maxWorkers=1 --minWorkers=1`. A sandbox can prevent Turbopack from creating its local helper process or binding a loopback port; in that case rerun the exact build under approved local verification permissions. Do not change application behavior to bypass a sandbox restriction.

## Staging/readiness gate

Staging is an external-write environment, not an extension of local verification. Before any staging action, obtain approval for the exact environment and action.

1. Use an isolated staging Supabase project and staging deployment. Confirm no production URL, database URL, or service-role key is loaded.
2. Review and apply only `20260721000100_openclaw_observatory_m1a.sql` after its prerequisite migrations. Confirm all three Observatory tables have RLS enabled, snapshots are immutable, work-item events are append-only, and only admins can read through authenticated policies.
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
6. **Automation or runtime changes:** Cron/scheduling and every Gateway start/stop/restart/update are outside M1A and require a separate design and explicit approval.

## Last-known-good, stale state, and rollback

- **Collection failure:** no failed artifact is publishable. Atomic local writes preserve the previous destination on failure.
- **Publication failure:** the publisher validates the strict schema and both digests before network I/O. A rejected request inserts nothing. A `409` is success only after the digest is confirmed, so the database keeps the existing row.
- **Last-known-good read:** `/observatory` selects the newest row whose status is `success`. If collection or publication fails, the previously published successful row remains available.
- **Stale/unknown display:** the UI visibly warns when a validated payload says `stale` or `unknown`; invalid payloads are not rendered. M1A does not derive freshness from wall-clock age, and the current successful collector labels its source `fresh`. Therefore an aging last-known-good snapshot can still carry `fresh`; operators must compare `generated_at` with an owner-approved maximum age before relying on it. Automated age-based staleness is a post-M1A concern.
- **Application rollback:** redeploy the previously approved application build. Snapshot and event data remain untouched.
- **Bad but schema-valid latest snapshot:** snapshots are immutable. Do not update/delete the row. Correct the source or collector, repeat all local gates, and—with publication approval—publish a newer corrected snapshot.
- **Migration rollback:** do not drop Observatory tables or disable protections during an incident. Roll back the application first. Any schema reversal must be a separately reviewed forward migration with backup and explicit production approval.

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
