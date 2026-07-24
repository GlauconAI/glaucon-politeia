import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import postgres from "postgres";

const DATABASE_URL =
  process.env.OBSERVATORY_LOCAL_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const API_BASE =
  process.env.OBSERVATORY_PILOT_API_URL ??
  "http://127.0.0.1:3000/api/dashboard/work-items/claims";
const TOKEN =
  process.env.OBSERVATORY_PILOT_TOKEN ?? "owner-supplied-pilot-token";
const parsedDatabaseUrl = new URL(DATABASE_URL);
const parsedApiUrl = new URL(API_BASE);
if (
  !["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname) ||
  parsedDatabaseUrl.port !== "54322" ||
  !["127.0.0.1", "localhost"].includes(parsedApiUrl.hostname) ||
  parsedApiUrl.port !== "3000"
) {
  throw new Error(
    "Pilot targets must target the disposable loopback database and API.",
  );
}

const sql = postgres(DATABASE_URL, {
  connect_timeout: 10,
  idle_timeout: 5,
  max: 4,
  onnotice: () => undefined,
});
type Transaction = postgres.TransactionSql;
type WorkItem = { id: string; state: string; version: number };
type ClaimResponse = {
  claim: {
    id: string;
    status: string;
    claimVersion: number;
    leaseExpiresAt: string;
  };
  workItem: {
    id: string;
    state: string;
    version: number;
    authorizedPaths: string[];
  };
};

async function asAdmin<T>(
  adminId: string,
  action: (transaction: Transaction) => Promise<T>,
) {
  const wrapped = await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
    await transaction`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
    await transaction.unsafe("set local role authenticated");
    return { value: await action(transaction) };
  });
  return wrapped.value;
}

async function createReadyItem(
  adminId: string,
  runId: string,
  input: {
    type: "feature" | "bug";
    title: string;
    paths: string[];
    risk?: "low" | "high";
    enabled?: boolean;
  },
) {
  return asAdmin(adminId, async (transaction) => {
    const [created] = await transaction<WorkItem[]>`
      select id, state, version from public.create_observatory_work_item(
        ${input.type}, ${input.title}, 'Disposable Dashboard dogfood item',
        ${`${input.title.toLowerCase()}-${runId}`}
      )
    `;
    const [triaged] = await transaction<WorkItem[]>`
      select id, state, version from public.transition_observatory_work_item(
        ${created.id}, ${created.version}, 'triage'
      )
    `;
    const [prepared] = await transaction<WorkItem[]>`
      select id, state, version from public.update_observatory_work_item(
        ${created.id}, ${triaged.version}, ${input.type}, ${input.title},
        'Disposable Dashboard dogfood item',
        'Focused tests and authorized-path checks pass.',
        'medium', ${adminId}, 'dashboard', 'OBS-M3'
      )
    `;
    const [ready] = await transaction<WorkItem[]>`
      select id, state, version from public.transition_observatory_work_item(
        ${created.id}, ${prepared.version}, 'ready'
      )
    `;
    const [configured] = await transaction<WorkItem[]>`
      select id, state, version
      from public.configure_observatory_agent_claim_policy(
        ${ready.id}, ${ready.version}, ${input.risk ?? "low"},
        ${input.enabled ?? true}, ${input.paths}::text[],
        ${["code_edit", "test"]}::text[]
      )
    `;
    return configured;
  });
}

async function api(path: string, body: Record<string, unknown>) {
  return fetch(`${API_BASE}${path}`, {
    method: path ? "PATCH" : "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function claimAndFinish(
  adminId: string,
  item: WorkItem,
  key: string,
  expectedPaths: string[],
) {
  const claimResponse = await api("", {
    idempotencyKey: key,
    workItemId: item.id,
    leaseSeconds: 900,
  });
  assert.equal(claimResponse.status, 200);
  const claimed = (await claimResponse.json()) as ClaimResponse;
  assert.deepEqual(claimed.workItem.authorizedPaths, expectedPaths);

  const heartbeatResponse = await api(`/${claimed.claim.id}`, {
    "action": "heartbeat",
    expectedClaimVersion: claimed.claim.claimVersion,
    leaseSeconds: 900,
  });
  assert.equal(heartbeatResponse.status, 200);
  const heartbeat = (await heartbeatResponse.json()) as {
    claimVersion: number;
  };

  const completionResponse = await api(`/${claimed.claim.id}`, {
    "action": "complete",
    expectedClaimVersion: heartbeat.claimVersion,
    expectedWorkItemVersion: claimed.workItem.version,
    summary: "Dogfood focused tests and boundary checks passed.",
    evidenceUrl: `https://github.com/example/glaucon-politeia/commit/${key}`,
  });
  assert.equal(completionResponse.status, 200);
  const completed = (await completionResponse.json()) as ClaimResponse;
  assert.equal(
    completed.workItem.state,
    "review",
    "agent completion must stop at Review",
  );
  const [done] = await asAdmin(adminId, (transaction) =>
    transaction<WorkItem[]>`
      select id, state, version from public.transition_observatory_work_item(
        ${completed.workItem.id}, ${completed.workItem.version}, 'done'
      )
    `,
  );
  assert.equal(done?.state, "done");
  return { claimed, completed, done };
}

async function main() {
  const runId = randomUUID();
  const adminId = randomUUID();
  await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.role', 'service_role', true)`;
    await transaction`
      insert into auth.users (
        id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        ${adminId}, 'authenticated', 'authenticated',
        ${`dogfood-${runId}@example.invalid`}, '{}'::jsonb, '{}'::jsonb,
        now(), now()
      )
    `;
    await transaction`
      insert into public.profiles (user_id, username, display_name, is_admin)
      values (${adminId}, ${`dogfood-${runId}`}, 'Dogfood Admin', true)
    `;
  });

  const feature = await createReadyItem(adminId, runId, {
    type: "feature",
    title: "M3-CLAIM-PILOT-FEATURE",
    paths: [
      "components/observatory/WorkTrackerBoard.tsx",
      "tests/observatory-work-tracker-board.test.tsx",
    ],
  });
  const featureResult = await claimAndFinish(
    adminId,
    feature,
    `feature-${runId}`,
    [
      "components/observatory/WorkTrackerBoard.tsx",
      "tests/observatory-work-tracker-board.test.tsx",
    ],
  );

  const bug = await createReadyItem(adminId, runId, {
    type: "bug",
    title: "M3-CLAIM-PILOT-BUG",
    paths: [
      "components/observatory/WorkItemDetail.tsx",
      "tests/observatory-work-item-detail.test.tsx",
    ],
  });
  const bugResult = await claimAndFinish(
    adminId,
    bug,
    `bug-${runId}`,
    [
      "components/observatory/WorkItemDetail.tsx",
      "tests/observatory-work-item-detail.test.tsx",
    ],
  );
  const [endedClaim] = await sql<
    { status: string; ended_at: string | null; lease_expires_at: string }[]
  >`
    select status, ended_at, lease_expires_at
    from public.observatory_work_item_claims
    where id = ${bugResult.claimed.claim.id}
  `;
  const effectiveActive =
    endedClaim?.status === "active" &&
    endedClaim.ended_at === null &&
    new Date(endedClaim.lease_expires_at).getTime() > Date.now();
  assert.equal(
    effectiveActive,
    false,
    "historical future lease is not active",
  );

  const highRisk = await createReadyItem(adminId, runId, {
    type: "bug",
    title: "M3-CLAIM-PILOT-HIGH-RISK-CONTROL",
    paths: ["components/observatory/WorkItemDetail.tsx"],
    risk: "high",
    enabled: false,
  });
  const before = await sql<WorkItem[]>`
    select id, state, version from public.observatory_work_items
    where id = ${highRisk.id}
  `;
  const denial = await api("", {
    idempotencyKey: `high-${runId}`,
    workItemId: highRisk.id,
    leaseSeconds: 900,
  });
  assert.equal(denial.status, 204);
  const after = await sql<WorkItem[]>`
    select id, state, version from public.observatory_work_items
    where id = ${highRisk.id}
  `;
  assert.deepEqual([...after], [...before], "high-risk control remains unchanged");

  const itemIds = [feature.id, bug.id];
  const [totals] = await sql<
    { claims: number; events: number; evidence: number }[]
  >`
    select
      (select count(*)::integer from public.observatory_work_item_claims where work_item_id = any(${itemIds}::uuid[])) claims,
      (select count(*)::integer from public.observatory_work_item_events where work_item_id = any(${itemIds}::uuid[])) events,
      (select count(*)::integer from public.observatory_work_item_evidence where work_item_id = any(${itemIds}::uuid[])) evidence
  `;
  console.log(
    JSON.stringify(
      {
        status: "DOGFOOD_PILOT_PASSED",
        feature: {
          id: feature.id,
          claimId: featureResult.claimed.claim.id,
          finalVersion: featureResult.done.version,
        },
        bug: {
          id: bug.id,
          claimId: bugResult.claimed.claim.id,
          finalVersion: bugResult.done.version,
        },
        highRiskControlId: highRisk.id,
        totals,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(
      `DOGFOOD_PILOT_FAILED: ${error instanceof Error ? error.message : "unknown failure"}`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 2 });
  });
