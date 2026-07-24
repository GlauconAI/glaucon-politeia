import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

const EXPECTED_CHECKS = [
  "fixtures created",
  "claims table exact grants",
  "claims table RLS enabled",
  "claim RPC exact grants",
  "admin RPC exact grants",
  "anonymous claims read denied",
  "non-admin claims read filtered by RLS",
  "admin claims read allowed by RLS",
  "authenticated direct claim insert denied",
  "service-role direct claim insert denied",
  "claim event principal constraint",
  "agent evidence principal constraint",
  "ready Feature prepared",
  "owner low-risk policy approved",
  "non-admin policy approval denied",
  "high-risk approval denied",
  "service claim starts lease",
  "claim moves Ready to In Progress",
  "claim boundary returned",
  "claim start audited with agent principal",
  "idempotent retry returns same claim",
  "idempotency conflict rejected",
  "concurrent claim has one winner",
  "heartbeat extends lease",
  "stale heartbeat version rejected",
  "claim ownership mismatch rejected",
  "human mutation blocked during active claim",
  "release closes claim",
  "release returns work to Ready",
  "release append-only audit recorded",
  "released work can be reclaimed",
  "completion closes claim",
  "completion stops at Review",
  "completion HTTPS evidence recorded",
  "completion append-only audit recorded",
  "human final Done approval succeeds",
  "expiry sweep closes stale lease",
  "expiry sweep recovers work to Ready",
  "administrator cancellation closes claim",
  "cancellation recovers work to Ready",
  "high-risk item claim denied without mutation",
  "append-only claim history and rollback preserved",
] as const;

const LOCAL_DATABASE_URL =
  process.env.OBSERVATORY_LOCAL_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(LOCAL_DATABASE_URL);
if (
  !["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname) ||
  parsedDatabaseUrl.port !== "54322" ||
  parsedDatabaseUrl.pathname !== "/postgres"
) {
  throw new Error(
    "OBSERVATORY_LOCAL_DB_URL must target the disposable loopback database on port 54322.",
  );
}

const sql = postgres(LOCAL_DATABASE_URL, {
  connect_timeout: 10,
  idle_timeout: 5,
  max: 8,
  onnotice: () => undefined,
});
type Role = "anon" | "authenticated" | "service_role";
type Transaction = postgres.TransactionSql;
const checks: string[] = [];

function record(label: (typeof EXPECTED_CHECKS)[number]) {
  assert.equal(
    label,
    EXPECTED_CHECKS[checks.length],
    "verifier check order is stable",
  );
  checks.push(label);
}

function pgError(error: unknown) {
  return error && typeof error === "object"
    ? (error as { code?: string; message?: string })
    : {};
}

async function expectPgError(
  label: string,
  code: string,
  action: () => Promise<unknown>,
  pattern?: RegExp,
) {
  try {
    await action();
  } catch (error) {
    const candidate = pgError(error);
    assert.equal(candidate.code, code, `${label}: PostgreSQL code`);
    if (pattern) assert.match(candidate.message ?? "", pattern, label);
    return;
  }
  assert.fail(`${label}: expected PostgreSQL error ${code}`);
}

async function asRole<T>(
  role: Role,
  userId: string | null,
  action: (transaction: Transaction) => Promise<T>,
) {
  const wrapped = await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.role', ${role}, true)`;
    await transaction`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
    await transaction.unsafe(`set local role ${role}`);
    return { value: await action(transaction) };
  });
  return wrapped.value;
}

async function createReadyItem(
  adminId: string,
  runId: string,
  suffix: string,
  type: "feature" | "bug" = "feature",
) {
  return asRole("authenticated", adminId, async (transaction) => {
    const [created] = await transaction<{ id: string; version: number }[]>`
      select id, version from public.create_observatory_work_item(
        ${type}, ${`Claim ${suffix}`}, 'Disposable verifier item',
        ${`claim-${suffix}-${runId}`}
      )
    `;
    assert.ok(created);
    const [triaged] = await transaction<{ version: number }[]>`
      select version from public.transition_observatory_work_item(
        ${created.id}, ${created.version}, 'triage'
      )
    `;
    const [prepared] = await transaction<{ version: number }[]>`
      select version from public.update_observatory_work_item(
        ${created.id}, ${triaged.version}, ${type}, ${`Claim ${suffix}`},
        'Disposable verifier item', 'Agent result reaches Review.',
        'medium', ${adminId}, 'dashboard', 'OBS-M3'
      )
    `;
    const [ready] = await transaction<
      { id: string; state: string; version: number }[]
    >`
      select id, state, version from public.transition_observatory_work_item(
        ${created.id}, ${prepared.version}, 'ready'
      )
    `;
    assert.ok(ready);
    return ready;
  });
}

async function configurePolicy(
  adminId: string,
  item: { id: string; version: number },
  input: { risk: "low" | "high"; enabled: boolean },
) {
  return asRole("authenticated", adminId, async (transaction) => {
    const [updated] = await transaction<
      { id: string; state: string; version: number; risk_level: string }[]
    >`
      select id, state, version, risk_level
      from public.configure_observatory_agent_claim_policy(
        ${item.id}, ${item.version}, ${input.risk}, ${input.enabled},
        ${["components/observatory"]}::text[],
        ${["code_edit", "test"]}::text[]
      )
    `;
    assert.ok(updated);
    return updated;
  });
}

async function claimItem(input: {
  agentId: string;
  key: string;
  itemId: string | null;
  lease?: number;
}) {
  return asRole("service_role", null, async (transaction) => {
    const [row] = await transaction<{ result: Record<string, any> }[]>`
      select public.claim_observatory_work_item(
        ${input.agentId}, ${input.key}, ${input.itemId},
        ${input.lease ?? 900}
      ) as result
    `;
    assert.ok(row);
    return row.result;
  });
}

async function main() {
  const runId = randomUUID();
  const adminId = randomUUID();
  const userId = randomUUID();
  await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.role', 'service_role', true)`;
    await transaction`
      insert into auth.users (
        id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values
        (${adminId}, 'authenticated', 'authenticated',
         ${`claim-admin-${runId}@example.invalid`}, '{}'::jsonb, '{}'::jsonb,
         now(), now()),
        (${userId}, 'authenticated', 'authenticated',
         ${`claim-user-${runId}@example.invalid`}, '{}'::jsonb, '{}'::jsonb,
         now(), now())
    `;
    await transaction`
      insert into public.profiles (user_id, username, display_name, is_admin)
      values
        (${adminId}, ${`claim-admin-${runId}`}, 'Claim Admin', true),
        (${userId}, ${`claim-user-${runId}`}, 'Claim User', false)
    `;
  });
  record("fixtures created");

  const tableGrants = await sql<
    {
      role_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
    }[]
  >`
    select role_name,
      has_table_privilege(role_name, 'public.observatory_work_item_claims', 'select') can_select,
      has_table_privilege(role_name, 'public.observatory_work_item_claims', 'insert') can_insert,
      has_table_privilege(role_name, 'public.observatory_work_item_claims', 'update') can_update,
      has_table_privilege(role_name, 'public.observatory_work_item_claims', 'delete') can_delete
    from unnest(array['anon','authenticated','service_role']) role_name
    order by role_name
  `;
  assert.deepEqual(
    [...tableGrants],
    [
      { role_name: "anon", can_select: false, can_insert: false, can_update: false, can_delete: false },
      { role_name: "authenticated", can_select: true, can_insert: false, can_update: false, can_delete: false },
      { role_name: "service_role", can_select: false, can_insert: false, can_update: false, can_delete: false },
    ],
  );
  record("claims table exact grants");

  const [rls] = await sql<{ relrowsecurity: boolean }[]>`
    select relrowsecurity from pg_class
    where oid = 'public.observatory_work_item_claims'::regclass
  `;
  assert.equal(rls?.relrowsecurity, true);
  record("claims table RLS enabled");

  const [rpcGrants] = await sql<
    { anon: boolean; authenticated: boolean; service_role: boolean }[]
  >`
    select
      has_function_privilege('anon', 'public.claim_observatory_work_item(text,text,uuid,integer)', 'execute') anon,
      has_function_privilege('authenticated', 'public.claim_observatory_work_item(text,text,uuid,integer)', 'execute') authenticated,
      has_function_privilege('service_role', 'public.claim_observatory_work_item(text,text,uuid,integer)', 'execute') service_role
  `;
  assert.deepEqual(rpcGrants, { anon: false, authenticated: false, service_role: true });
  record("claim RPC exact grants");

  const [adminGrants] = await sql<
    { anon: boolean; authenticated: boolean; service_role: boolean }[]
  >`
    select
      has_function_privilege('anon', 'public.configure_observatory_agent_claim_policy(uuid,integer,text,boolean,text[],text[])', 'execute') anon,
      has_function_privilege('authenticated', 'public.configure_observatory_agent_claim_policy(uuid,integer,text,boolean,text[],text[])', 'execute') authenticated,
      has_function_privilege('service_role', 'public.configure_observatory_agent_claim_policy(uuid,integer,text,boolean,text[],text[])', 'execute') service_role
  `;
  assert.deepEqual(adminGrants, { anon: false, authenticated: true, service_role: false });
  record("admin RPC exact grants");

  await expectPgError("anonymous read", "42501", () =>
    asRole("anon", null, (transaction) =>
      transaction`select * from public.observatory_work_item_claims`,
    ),
  );
  record("anonymous claims read denied");
  const [nonAdminCount] = await asRole("authenticated", userId, (transaction) =>
    transaction<{ count: number }[]>`
      select count(*)::integer count from public.observatory_work_item_claims
    `,
  );
  assert.equal(nonAdminCount?.count, 0);
  record("non-admin claims read filtered by RLS");
  const [adminCount] = await asRole("authenticated", adminId, (transaction) =>
    transaction<{ count: number }[]>`
      select count(*)::integer count from public.observatory_work_item_claims
    `,
  );
  assert.equal(adminCount?.count, 0);
  record("admin claims read allowed by RLS");

  for (const [role, label] of [
    ["authenticated", "authenticated direct claim insert denied"],
    ["service_role", "service-role direct claim insert denied"],
  ] as const) {
    await expectPgError(label, "42501", () =>
      asRole(role, role === "authenticated" ? adminId : null, (transaction) =>
        transaction`
          insert into public.observatory_work_item_claims (
            work_item_id, agent_id, idempotency_key, request_fingerprint,
            lease_expires_at
          ) values (${randomUUID()}, 'bypass', 'bypass', 'bypass', now() + interval '15 minutes')
        `,
      ),
    );
    record(label);
  }

  await expectPgError("principal", "23514", () =>
    sql`
      insert into public.observatory_work_item_events (
        work_item_id, event_type, actor_id, agent_id, data
      ) values (${randomUUID()}, 'claim_started', ${adminId}, 'agent', '{}'::jsonb)
    `,
  );
  record("claim event principal constraint");
  await expectPgError("evidence principal", "23514", () =>
    sql`
      insert into public.observatory_work_item_evidence (
        work_item_id, label, url, created_by, created_by_agent
      ) values (${randomUUID()}, 'bad', 'https://example.invalid', ${adminId}, 'agent')
    `,
  );
  record("agent evidence principal constraint");

  let feature = await createReadyItem(adminId, runId, "feature");
  assert.equal(feature.state, "ready");
  record("ready Feature prepared");
  feature = await configurePolicy(adminId, feature, {
    risk: "low",
    enabled: true,
  });
  assert.equal(feature.state, "ready");
  record("owner low-risk policy approved");

  const nonAdminItem = await createReadyItem(adminId, runId, "non-admin");
  await expectPgError("non-admin policy", "42501", () =>
    configurePolicy(userId, nonAdminItem, { risk: "low", enabled: true }),
  );
  record("non-admin policy approval denied");
  const highRisk = await createReadyItem(adminId, runId, "high-risk");
  await expectPgError("high-risk", "23514", () =>
    configurePolicy(adminId, highRisk, { risk: "high", enabled: true }),
    /observatory_claim_policy_invalid/iu,
  );
  record("high-risk approval denied");

  const first = await claimItem({
    agentId: "plato-pilot",
    key: `first-${runId}`,
    itemId: feature.id,
  });
  assert.equal(first.claim.status, "active");
  record("service claim starts lease");
  assert.equal(first.work_item.state, "in_progress");
  record("claim moves Ready to In Progress");
  assert.deepEqual(first.work_item.authorized_paths, ["components/observatory"]);
  assert.deepEqual(first.work_item.allowed_action_classes, ["code_edit", "test"]);
  record("claim boundary returned");
  const [startEvent] = await sql<{ actor_id: string | null; agent_id: string | null }[]>`
    select actor_id, agent_id from public.observatory_work_item_events
    where work_item_id = ${feature.id} and event_type = 'claim_started'
  `;
  assert.deepEqual(startEvent, { actor_id: null, agent_id: "plato-pilot" });
  record("claim start audited with agent principal");

  const repeated = await claimItem({
    agentId: "plato-pilot",
    key: `first-${runId}`,
    itemId: feature.id,
  });
  assert.equal(repeated.claim.id, first.claim.id);
  record("idempotent retry returns same claim");
  await expectPgError("idempotency conflict", "23505", () =>
    claimItem({
      agentId: "plato-pilot",
      key: `first-${runId}`,
      itemId: null,
      lease: 1200,
    }),
    /observatory_claim_idempotency_conflict/iu,
  );
  record("idempotency conflict rejected");

  let concurrent = await createReadyItem(adminId, runId, "concurrent");
  concurrent = await configurePolicy(adminId, concurrent, {
    risk: "low",
    enabled: true,
  });
  const concurrentResults = await Promise.allSettled([
    claimItem({ agentId: "agent-a", key: `a-${runId}`, itemId: concurrent.id }),
    claimItem({ agentId: "agent-b", key: `b-${runId}`, itemId: concurrent.id }),
  ]);
  assert.equal(
    concurrentResults.filter((result) => result.status === "fulfilled").length,
    1,
  );
  record("concurrent claim has one winner");

  const [heartbeat] = await asRole("service_role", null, (transaction) =>
    transaction<{ result: Record<string, any> }[]>`
      select public.renew_observatory_work_item_claim(
        ${first.claim.id}, 'plato-pilot', 1, 1200
      ) result
    `,
  );
  assert.equal(heartbeat?.result.claim_version, 2);
  record("heartbeat extends lease");
  await expectPgError("stale heartbeat", "40001", () =>
    asRole("service_role", null, (transaction) =>
      transaction`
        select public.renew_observatory_work_item_claim(
          ${first.claim.id}, 'plato-pilot', 1, 900
        )
      `,
    ),
  );
  record("stale heartbeat version rejected");
  await expectPgError("owner mismatch", "42501", () =>
    asRole("service_role", null, (transaction) =>
      transaction`
        select public.renew_observatory_work_item_claim(
          ${first.claim.id}, 'other-agent', 2, 900
        )
      `,
    ),
  );
  record("claim ownership mismatch rejected");
  await expectPgError("human mutation", "55006", () =>
    asRole("authenticated", adminId, (transaction) =>
      transaction`
        select * from public.update_observatory_work_item(
          ${feature.id}, ${first.work_item.version}, 'feature',
          'Bypass active claim', '', 'Agent result reaches Review.',
          'medium', ${adminId}, 'dashboard', 'OBS-M3'
        )
      `,
    ),
  );
  record("human mutation blocked during active claim");

  const [released] = await asRole("service_role", null, (transaction) =>
    transaction<{ result: Record<string, any> }[]>`
      select public.release_observatory_work_item_claim(
        ${first.claim.id}, 'plato-pilot', 2, ${first.work_item.version}
      ) result
    `,
  );
  assert.equal(released?.result.claim.status, "released");
  record("release closes claim");
  assert.equal(released?.result.work_item.state, "ready");
  record("release returns work to Ready");
  const [releaseEvents] = await sql<{ count: number }[]>`
    select count(*)::integer count from public.observatory_work_item_events
    where work_item_id = ${feature.id}
      and event_type in ('claim_released', 'state_transitioned')
      and agent_id = 'plato-pilot'
  `;
  assert.ok((releaseEvents?.count ?? 0) >= 2);
  record("release append-only audit recorded");

  const reclaimed = await claimItem({
    agentId: "plato-pilot",
    key: `reclaim-${runId}`,
    itemId: feature.id,
  });
  assert.notEqual(reclaimed.claim.id, first.claim.id);
  record("released work can be reclaimed");
  const [completed] = await asRole("service_role", null, (transaction) =>
    transaction<{ result: Record<string, any> }[]>`
      select public.complete_observatory_work_item_claim(
        ${reclaimed.claim.id}, 'plato-pilot', 1,
        ${reclaimed.work_item.version}, 'Verifier completion passed.',
        'https://github.com/example/repo/commit/verifier'
      ) result
    `,
  );
  assert.equal(completed?.result.claim.status, "completed");
  record("completion closes claim");
  assert.equal(completed?.result.work_item.state, "review");
  record("completion stops at Review");
  assert.equal(completed?.result.evidence.created_by, null);
  assert.equal(completed?.result.evidence.created_by_agent, "plato-pilot");
  record("completion HTTPS evidence recorded");
  const [completionEvents] = await sql<{ count: number }[]>`
    select count(*)::integer count from public.observatory_work_item_events
    where work_item_id = ${feature.id}
      and event_type in ('claim_completed', 'evidence_added', 'state_transitioned')
      and agent_id = 'plato-pilot'
  `;
  assert.ok((completionEvents?.count ?? 0) >= 3);
  record("completion append-only audit recorded");
  const [done] = await asRole("authenticated", adminId, (transaction) =>
    transaction<{ state: string }[]>`
      select state from public.transition_observatory_work_item(
        ${feature.id}, ${completed!.result.work_item.version}, 'done'
      )
    `,
  );
  assert.equal(done?.state, "done");
  record("human final Done approval succeeds");

  let expiring = await createReadyItem(adminId, runId, "expiring", "bug");
  expiring = await configurePolicy(adminId, expiring, {
    risk: "low",
    enabled: true,
  });
  const expiringClaim = await claimItem({
    agentId: "expiry-agent",
    key: `expiry-${runId}`,
    itemId: expiring.id,
    lease: 300,
  });
  await sql`
    update public.observatory_work_item_claims
    set lease_expires_at = now() - interval '1 second'
    where id = ${expiringClaim.claim.id}
  `;
  const [swept] = await asRole("service_role", null, (transaction) =>
    transaction<{ count: number }[]>`
      select public.sweep_observatory_work_item_claims() count
    `,
  );
  assert.ok((swept?.count ?? 0) >= 1);
  const [expired] = await sql<{ status: string }[]>`
    select status from public.observatory_work_item_claims
    where id = ${expiringClaim.claim.id}
  `;
  assert.equal(expired?.status, "expired");
  record("expiry sweep closes stale lease");
  const [expiredItem] = await sql<{ state: string }[]>`
    select state from public.observatory_work_items where id = ${expiring.id}
  `;
  assert.equal(expiredItem?.state, "ready");
  record("expiry sweep recovers work to Ready");

  let cancellable = await createReadyItem(adminId, runId, "cancel", "bug");
  cancellable = await configurePolicy(adminId, cancellable, {
    risk: "low",
    enabled: true,
  });
  const cancelClaim = await claimItem({
    agentId: "cancel-agent",
    key: `cancel-${runId}`,
    itemId: cancellable.id,
  });
  const [cancelled] = await asRole("authenticated", adminId, (transaction) =>
    transaction<{ result: Record<string, any> }[]>`
      select public.cancel_observatory_work_item_claim(
        ${cancelClaim.claim.id}, 1, ${cancelClaim.work_item.version}
      ) result
    `,
  );
  assert.equal(cancelled?.result.claim.status, "cancelled");
  record("administrator cancellation closes claim");
  assert.equal(cancelled?.result.work_item.state, "ready");
  record("cancellation recovers work to Ready");

  const highControl = await configurePolicy(adminId, highRisk, {
    risk: "high",
    enabled: false,
  });
  const beforeHigh = await sql<{ state: string; version: number }[]>`
    select state, version from public.observatory_work_items
    where id = ${highControl.id}
  `;
  await expectPgError("high-risk no work", "P0002", () =>
    claimItem({
      agentId: "high-agent",
      key: `high-${runId}`,
      itemId: highControl.id,
    }),
  );
  const afterHigh = await sql<{ state: string; version: number }[]>`
    select state, version from public.observatory_work_items
    where id = ${highControl.id}
  `;
  assert.deepEqual(afterHigh, beforeHigh);
  record("high-risk item claim denied without mutation");

  const [historyBefore] = await sql<{ count: number }[]>`
    select count(*)::integer count from public.observatory_work_item_events
    where work_item_id = ${feature.id}
  `;
  await expectPgError(
    "event append-only",
    "P0001",
    () =>
      sql`
        update public.observatory_work_item_events set data = '{}'::jsonb
        where work_item_id = ${feature.id}
      `,
    /events are append-only/iu,
  );
  const [historyAfter] = await sql<{ count: number }[]>`
    select count(*)::integer count from public.observatory_work_item_events
    where work_item_id = ${feature.id}
  `;
  assert.deepEqual(historyAfter, historyBefore);
  record("append-only claim history and rollback preserved");

  assert.deepEqual(checks, [...EXPECTED_CHECKS]);
  console.log(
    JSON.stringify(
      {
        status: "pass",
        "check_count": checks.length,
        checks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    const candidate = pgError(error);
    console.error(
      `OBSERVATORY_AGENT_CLAIM_DB_VERIFY_FAILED: ${candidate.message ?? "unknown failure"}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 2 });
  });
