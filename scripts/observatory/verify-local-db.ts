import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import postgres from "postgres";

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

type DatabaseRole = "anon" | "authenticated" | "service_role";
type Transaction = postgres.TransactionSql;

const checks: string[] = [];

function record(check: string): void {
  checks.push(check);
}

function pgError(error: unknown): { code?: string; message?: string } {
  if (error && typeof error === "object") {
    return error as { code?: string; message?: string };
  }
  return {};
}

async function expectPgError(
  label: string,
  expectedCode: string,
  action: () => Promise<unknown>,
  messagePattern?: RegExp,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const candidate = pgError(error);
    assert.equal(candidate.code, expectedCode, `${label}: PostgreSQL code`);
    if (messagePattern) {
      assert.match(candidate.message ?? "", messagePattern, `${label}: message`);
    }
    record(label);
    return;
  }
  assert.fail(`${label}: expected PostgreSQL error ${expectedCode}`);
}

async function asRole<T>(
  role: DatabaseRole,
  userId: string | null,
  action: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const result = await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.role', ${role}, true)`;
    await transaction`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
    await transaction.unsafe(`set local role ${role}`);
    return { value: await action(transaction) };
  });
  return result.value;
}

async function createWorkItem(
  userId: string,
  input: {
    type: "idea" | "feature" | "bug";
    title: string;
    description: string;
    idempotencyKey: string;
  },
) {
  return asRole("authenticated", userId, async (transaction) => {
    const [item] = await transaction<
      {
        id: string;
        type: string;
        title: string;
        description: string;
        state: string;
        version: number;
      }[]
    >`
      select id, type, title, description, state, version
      from public.create_observatory_work_item(
        ${input.type},
        ${input.title},
        ${input.description},
        ${input.idempotencyKey}
      )
    `;
    assert.ok(item, "create_observatory_work_item returned a row");
    return item;
  });
}

async function updateWorkItem(
  userId: string,
  input: {
    id: string;
    expectedVersion: number;
    type: "idea" | "feature" | "bug";
    title: string;
    description: string;
    acceptanceCriteria?: string;
    priority?: "low" | "medium" | "high" | "urgent" | null;
    ownerId?: string | null;
    projectRef?: string | null;
    milestoneRef?: string | null;
  },
) {
  return asRole("authenticated", userId, async (transaction) => {
    const [item] = await transaction<
      {
        id: string;
        title: string;
        version: number;
      }[]
    >`
      select id, title, version
      from public.update_observatory_work_item(
        ${input.id},
        ${input.expectedVersion},
        ${input.type},
        ${input.title},
        ${input.description},
        ${input.acceptanceCriteria ?? ""},
        ${input.priority ?? null},
        ${input.ownerId ?? null},
        ${input.projectRef ?? null},
        ${input.milestoneRef ?? null}
      )
    `;
    assert.ok(item, "update_observatory_work_item returned a row");
    return item;
  });
}

async function transitionWorkItem(
  userId: string,
  input: { id: string; expectedVersion: number; targetState: string },
) {
  return asRole("authenticated", userId, async (transaction) => {
    const [item] = await transaction<
      { id: string; state: string; version: number }[]
    >`
      select id, state, version
      from public.transition_observatory_work_item(
        ${input.id},
        ${input.expectedVersion},
        ${input.targetState}
      )
    `;
    assert.ok(item, "transition_observatory_work_item returned a row");
    return item;
  });
}

async function addWorkItemEvidence(
  userId: string,
  input: {
    id: string;
    expectedVersion: number;
    label: string;
    url: string;
  },
) {
  return asRole("authenticated", userId, async (transaction) => {
    const [item] = await transaction<{ id: string; version: number }[]>`
      select id, version
      from public.add_observatory_work_item_evidence(
        ${input.id},
        ${input.expectedVersion},
        ${input.label},
        ${input.url}
      )
    `;
    assert.ok(item, "add_observatory_work_item_evidence returned a row");
    return item;
  });
}

async function removeWorkItemEvidence(
  userId: string,
  input: { id: string; evidenceId: string; expectedVersion: number },
) {
  return asRole("authenticated", userId, async (transaction) => {
    const [item] = await transaction<{ id: string; version: number }[]>`
      select id, version
      from public.remove_observatory_work_item_evidence(
        ${input.id},
        ${input.evidenceId},
        ${input.expectedVersion}
      )
    `;
    assert.ok(item, "remove_observatory_work_item_evidence returned a row");
    return item;
  });
}

async function main(): Promise<void> {
  const runId = randomUUID();
  const adminId = randomUUID();
  const userId = randomUUID();
  const digest = randomBytes(32).toString("hex");

  await sql.begin(async (transaction) => {
    await transaction`select set_config('request.jwt.claim.role', 'service_role', true)`;
    await transaction`
      insert into auth.users (
        id,
        aud,
        role,
        email,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values
        (
          ${adminId},
          'authenticated',
          'authenticated',
          ${`observatory-admin-${runId}@example.invalid`},
          '{}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        ),
        (
          ${userId},
          'authenticated',
          'authenticated',
          ${`observatory-user-${runId}@example.invalid`},
          '{}'::jsonb,
          '{}'::jsonb,
          now(),
          now()
        )
    `;
    await transaction`
      insert into public.profiles (
        user_id,
        username,
        display_name,
        is_admin
      )
      values
        (${adminId}, ${`observatory-admin-${runId}`}, 'Observatory Admin', true),
        (${userId}, ${`observatory-user-${runId}`}, 'Observatory User', false)
    `;
  });
  record("fixtures created through service-role claim boundary");

  const tablePrivileges = await sql<
    {
      role_name: string;
      table_name: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
    }[]
  >`
    select role_name, table_name,
      has_table_privilege(role_name, 'public.' || table_name, 'select') as can_select,
      has_table_privilege(role_name, 'public.' || table_name, 'insert') as can_insert,
      has_table_privilege(role_name, 'public.' || table_name, 'update') as can_update,
      has_table_privilege(role_name, 'public.' || table_name, 'delete') as can_delete,
      has_table_privilege(role_name, 'public.' || table_name, 'truncate') as can_truncate
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    cross join unnest(array[
      'observatory_snapshots',
      'observatory_work_items',
      'observatory_work_item_events',
      'observatory_work_item_evidence'
    ]) table_name
    order by role_name, table_name
  `;

  for (const privilege of tablePrivileges) {
    const expectedSelect =
      privilege.role_name === "authenticated" ||
      privilege.role_name === "service_role" &&
        privilege.table_name === "observatory_snapshots";
    const expectedInsert =
      privilege.role_name === "service_role" &&
      privilege.table_name === "observatory_snapshots";
    assert.equal(
      privilege.can_select,
      expectedSelect,
      `${privilege.role_name} ${privilege.table_name}: select grant`,
    );
    assert.equal(
      privilege.can_insert,
      expectedInsert,
      `${privilege.role_name} ${privilege.table_name}: insert grant`,
    );
    assert.equal(privilege.can_update, false);
    assert.equal(privilege.can_delete, false);
    assert.equal(privilege.can_truncate, false);
  }
  record("exact table grants and truncate denial");

  const rlsRows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
    select relname, relrowsecurity
    from pg_class
    where relname in (
      'observatory_snapshots',
      'observatory_work_items',
      'observatory_work_item_events',
      'observatory_work_item_evidence'
    )
    order by relname
  `;
  assert.equal(rlsRows.length, 4);
  assert.ok(rlsRows.every((row) => row.relrowsecurity));
  record("RLS enabled on all Observatory tables");

  const functionPrivileges = await sql<
    {
      role_name: string;
      can_create: boolean;
      can_update: boolean;
      can_transition: boolean;
      can_add_evidence: boolean;
      can_remove_evidence: boolean;
      can_prune: boolean;
      can_mark_release: boolean;
    }[]
  >`
    select role_name,
      has_function_privilege(
        role_name,
        'public.create_observatory_work_item(text,text,text,text)',
        'execute'
      ) as can_create,
      has_function_privilege(
        role_name,
        'public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text)',
        'execute'
      ) as can_update,
      has_function_privilege(
        role_name,
        'public.transition_observatory_work_item(uuid,integer,text)',
        'execute'
      ) as can_transition,
      has_function_privilege(
        role_name,
        'public.add_observatory_work_item_evidence(uuid,integer,text,text)',
        'execute'
      ) as can_add_evidence,
      has_function_privilege(
        role_name,
        'public.remove_observatory_work_item_evidence(uuid,uuid,integer)',
        'execute'
      ) as can_remove_evidence,
      has_function_privilege(
        role_name,
        'public.prune_observatory_snapshots(integer)',
        'execute'
      ) as can_prune,
      has_function_privilege(
        role_name,
        'public.mark_observatory_snapshot_release(text)',
        'execute'
      ) as can_mark_release
    from unnest(array['anon', 'authenticated', 'service_role']) role_name
    order by role_name
  `;
  for (const privilege of functionPrivileges) {
    const expected = privilege.role_name === "authenticated";
    assert.equal(privilege.can_create, expected);
    assert.equal(privilege.can_update, expected);
    assert.equal(privilege.can_transition, expected);
    assert.equal(privilege.can_add_evidence, expected);
    assert.equal(privilege.can_remove_evidence, expected);
    assert.equal(privilege.can_prune, privilege.role_name === "service_role");
    assert.equal(
      privilege.can_mark_release,
      privilege.role_name === "service_role",
    );
  }
  record("RPC execute grants limited to exact authenticated/service roles");

  await asRole("service_role", null, async (transaction) => {
    await transaction`
      insert into public.observatory_snapshots (
        schema_version,
        generated_at,
        source_digest,
        payload,
        summary,
        collector_version
      )
      values (
        '1',
        now(),
        ${digest},
        '{"kind":"integration"}'::jsonb,
        '{"project_count":0}'::jsonb,
        'integration-test'
      )
    `;
  });
  record("service role snapshot insert");

  for (const table of [
    "observatory_snapshots",
    "observatory_work_items",
    "observatory_work_item_events",
    "observatory_work_item_evidence",
  ] as const) {
    await expectPgError(
      `anonymous ${table} read denied`,
      "42501",
      () =>
        asRole("anon", null, async (transaction) => {
          await transaction.unsafe(`select * from public.${table}`);
        }),
    );
  }

  await asRole("authenticated", userId, async (transaction) => {
    const [counts] = await transaction<
      {
        snapshots: number;
        work_items: number;
        events: number;
        evidence: number;
      }[]
    >`
      select
        (select count(*)::integer from public.observatory_snapshots) as snapshots,
        (select count(*)::integer from public.observatory_work_items) as work_items,
        (
          select count(*)::integer
          from public.observatory_work_item_events
        ) as events,
        (
          select count(*)::integer
          from public.observatory_work_item_evidence
        ) as evidence
    `;
    assert.deepEqual(counts, {
      snapshots: 0,
      work_items: 0,
      events: 0,
      evidence: 0,
    });
  });
  record("non-admin authenticated reads filtered across all RLS tables");

  await asRole("authenticated", adminId, async (transaction) => {
    const [snapshotCount] = await transaction<{ count: number }[]>`
      select count(*)::integer as count
      from public.observatory_snapshots
      where source_digest = ${digest}
    `;
    assert.equal(
      snapshotCount?.count,
      1,
      "admin can read the snapshot created by this verification run",
    );
  });
  record("admin authenticated read allowed by RLS");

  await expectPgError(
    "non-admin Quick Capture denied",
    "42501",
    () =>
      createWorkItem(userId, {
        type: "idea",
        title: "Denied capture",
        description: "",
        idempotencyKey: `denied-${runId}`,
      }),
    /Administrator access required/u,
  );

  await expectPgError(
    "authenticated direct work-item insert denied",
    "42501",
    () =>
      asRole("authenticated", adminId, async (transaction) => {
        await transaction`
          insert into public.observatory_work_items (
            type,
            title,
            description,
            idempotency_key,
            created_by
          )
          values ('idea', 'Bypass', '', ${`bypass-${runId}`}, ${adminId})
        `;
      }),
  );

  await expectPgError(
    "direct evidence insert denied",
    "42501",
    () =>
      asRole("authenticated", adminId, async (transaction) => {
        await transaction`
          insert into public.observatory_work_item_evidence (
            work_item_id, label, url, created_by
          )
          values (
            ${randomUUID()},
            'Bypass',
            'https://example.invalid',
            ${adminId}
          )
        `;
      }),
  );

  const createInput = {
    type: "idea" as const,
    title: "Local integration capture",
    description: "Created through the audited RPC.",
    idempotencyKey: `create-${runId}`,
  };
  const created = await createWorkItem(adminId, createInput);
  assert.equal(created.version, 1);
  assert.equal(created.state, "inbox");

  const repeated = await createWorkItem(adminId, createInput);
  assert.equal(repeated.id, created.id);
  await asRole("authenticated", adminId, async (transaction) => {
    const [eventCount] = await transaction<{ count: number }[]>`
      select count(*)::integer as count
      from public.observatory_work_item_events
      where work_item_id = ${created.id}
    `;
    assert.equal(eventCount?.count, 1);
  });
  record("exact idempotent retry returns one item and one event");

  await expectPgError(
    "idempotency payload conflict rejected",
    "23505",
    () =>
      createWorkItem(adminId, {
        ...createInput,
        title: "Conflicting payload",
      }),
    /OBSERVATORY_IDEMPOTENCY_CONFLICT/u,
  );

  const concurrentInput = {
    type: "feature" as const,
    title: "Concurrent create",
    description: "Same request from two sessions.",
    idempotencyKey: `concurrent-create-${runId}`,
  };
  const concurrentCreates = await Promise.all([
    createWorkItem(adminId, concurrentInput),
    createWorkItem(adminId, concurrentInput),
  ]);
  assert.equal(concurrentCreates[0]?.id, concurrentCreates[1]?.id);
  await asRole("authenticated", adminId, async (transaction) => {
    const [counts] = await transaction<{ items: number; events: number }[]>`
      select
        (
          select count(*)::integer
          from public.observatory_work_items
          where created_by = ${adminId}
            and idempotency_key = ${concurrentInput.idempotencyKey}
        ) as items,
        (
          select count(*)::integer
          from public.observatory_work_item_events events
          join public.observatory_work_items items
            on items.id = events.work_item_id
          where items.created_by = ${adminId}
            and items.idempotency_key = ${concurrentInput.idempotencyKey}
        ) as events
    `;
    assert.deepEqual(counts, { items: 1, events: 1 });
  });
  record("concurrent identical Quick Capture is atomic and idempotent");

  const optimistic = await createWorkItem(adminId, {
    type: "bug",
    title: "Optimistic update",
    description: "Two writers share version one.",
    idempotencyKey: `optimistic-${runId}`,
  });
  const updateResults = await Promise.allSettled([
    updateWorkItem(adminId, {
      id: optimistic.id,
      expectedVersion: 1,
      type: "bug",
      title: "Optimistic winner A",
      description: "A",
    }),
    updateWorkItem(adminId, {
      id: optimistic.id,
      expectedVersion: 1,
      type: "bug",
      title: "Optimistic winner B",
      description: "B",
    }),
  ]);
  const fulfilledUpdates = updateResults.filter(
    (result) => result.status === "fulfilled",
  );
  const rejectedUpdates = updateResults.filter(
    (result) => result.status === "rejected",
  );
  assert.equal(fulfilledUpdates.length, 1);
  assert.equal(rejectedUpdates.length, 1);
  assert.equal(
    pgError(rejectedUpdates[0]?.reason).code,
    "40001",
    "losing optimistic update returns serialization conflict",
  );
  await asRole("authenticated", adminId, async (transaction) => {
    const [state] = await transaction<
      { version: number; events: number }[]
    >`
      select items.version,
        (
          select count(*)::integer
          from public.observatory_work_item_events events
          where events.work_item_id = items.id
        ) as events
      from public.observatory_work_items items
      where items.id = ${optimistic.id}
    `;
    assert.deepEqual(state, { version: 2, events: 2 });
  });
  record("concurrent optimistic update has one winner and one audited event");

  await expectPgError(
    "stale optimistic update rejected",
    "40001",
    () =>
      updateWorkItem(adminId, {
        id: optimistic.id,
        expectedVersion: 1,
        type: "bug",
        title: "Stale update",
        description: "Must not commit.",
      }),
    /OBSERVATORY_VERSION_CONFLICT/u,
  );
  await asRole("authenticated", adminId, async (transaction) => {
    const [state] = await transaction<
      { version: number; events: number }[]
    >`
      select items.version,
        (
          select count(*)::integer
          from public.observatory_work_item_events events
          where events.work_item_id = items.id
        ) as events
      from public.observatory_work_items items
      where items.id = ${optimistic.id}
    `;
    assert.deepEqual(state, { version: 2, events: 2 });
  });
  record("stale optimistic update rolls back without an audit event");

  const workflow = await createWorkItem(adminId, {
    type: "feature",
    title: "Manual Work Tracker workflow",
    description: "Exercise the M3 state machine.",
    idempotencyKey: `workflow-${runId}`,
  });
  const triaged = await transitionWorkItem(adminId, {
    id: workflow.id,
    expectedVersion: 1,
    targetState: "triage",
  });
  assert.deepEqual(
    { state: triaged.state, version: triaged.version },
    { state: "triage", version: 2 },
  );

  await expectPgError(
    "Ready Gate rejects incomplete work",
    "23514",
    () =>
      transitionWorkItem(adminId, {
        id: workflow.id,
        expectedVersion: 2,
        targetState: "ready",
      }),
    /OBSERVATORY_READY_GATE_FAILED/u,
  );

  const prepared = await updateWorkItem(adminId, {
    id: workflow.id,
    expectedVersion: 2,
    type: "feature",
    title: "Manual Work Tracker workflow",
    description: "Exercise the M3 state machine.",
    acceptanceCriteria: "Every mutation is audited.",
    priority: "high",
    ownerId: adminId,
    projectRef: "dashboard",
    milestoneRef: "OBS-M3",
  });
  assert.equal(prepared.version, 3);
  const ready = await transitionWorkItem(adminId, {
    id: workflow.id,
    expectedVersion: 3,
    targetState: "ready",
  });
  assert.deepEqual(
    { state: ready.state, version: ready.version },
    { state: "ready", version: 4 },
  );

  await expectPgError(
    "illegal state transition rejected",
    "22023",
    () =>
      transitionWorkItem(adminId, {
        id: workflow.id,
        expectedVersion: 4,
        targetState: "done",
      }),
    /OBSERVATORY_INVALID_TRANSITION/u,
  );

  const inProgress = await transitionWorkItem(adminId, {
    id: workflow.id,
    expectedVersion: 4,
    targetState: "in_progress",
  });
  assert.equal(inProgress.version, 5);
  const evidenceAdded = await addWorkItemEvidence(adminId, {
    id: workflow.id,
    expectedVersion: 5,
    label: "Local integration evidence",
    url: "https://example.invalid/work-tracker-evidence",
  });
  assert.equal(evidenceAdded.version, 6);
  const [activeEvidence] = await asRole(
    "authenticated",
    adminId,
    async (transaction) =>
      transaction<{ id: string }[]>`
        select id
        from public.observatory_work_item_evidence
        where work_item_id = ${workflow.id}
          and removed_at is null
      `,
  );
  assert.ok(activeEvidence);
  const evidenceRemoved = await removeWorkItemEvidence(adminId, {
    id: workflow.id,
    evidenceId: activeEvidence.id,
    expectedVersion: 6,
  });
  assert.equal(evidenceRemoved.version, 7);
  await asRole("authenticated", adminId, async (transaction) => {
    const [state] = await transaction<
      { version: number; active_evidence: number; events: number }[]
    >`
      select items.version,
        (
          select count(*)::integer
          from public.observatory_work_item_evidence evidence
          where evidence.work_item_id = items.id
            and evidence.removed_at is null
        ) as active_evidence,
        (
          select count(*)::integer
          from public.observatory_work_item_events events
          where events.work_item_id = items.id
        ) as events
      from public.observatory_work_items items
      where items.id = ${workflow.id}
    `;
    assert.deepEqual(state, {
      version: 7,
      active_evidence: 0,
      events: 7,
    });
  });
  record("evidence add and soft removal are audited");

  const rollbackItem = await createWorkItem(adminId, {
    type: "feature",
    title: "Rollback probe",
    description: "An injected event failure must roll back the item update.",
    idempotencyKey: `rollback-${runId}`,
  });
  await expectPgError(
    "RPC event failure aborts the work-item update",
    "P0001",
    () =>
      sql.begin(async (transaction) => {
        await transaction.unsafe(`
          create or replace function pg_temp.reject_observatory_updated_event()
          returns trigger
          language plpgsql
          as $$
          begin
            raise exception 'INTEGRATION_FORCED_EVENT_FAILURE';
          end;
          $$
        `);
        await transaction.unsafe(`
          create trigger observatory_integration_reject_updated_event
          before insert on public.observatory_work_item_events
          for each row
          when (new.event_type = 'updated')
          execute function pg_temp.reject_observatory_updated_event()
        `);
        await transaction`select set_config('request.jwt.claim.role', 'authenticated', true)`;
        await transaction`select set_config('request.jwt.claim.sub', ${adminId}, true)`;
        await transaction.unsafe("set local role authenticated");
        await transaction`
          select *
          from public.update_observatory_work_item(
            ${rollbackItem.id},
            1,
            'feature',
            'Must roll back',
            'The event insert is forced to fail.',
            '',
            null,
            null,
            null,
            null
          )
        `;
      }),
    /INTEGRATION_FORCED_EVENT_FAILURE/u,
  );
  await asRole("authenticated", adminId, async (transaction) => {
    const [state] = await transaction<
      { title: string; version: number; events: number }[]
    >`
      select items.title, items.version,
        (
          select count(*)::integer
          from public.observatory_work_item_events events
          where events.work_item_id = items.id
        ) as events
      from public.observatory_work_items items
      where items.id = ${rollbackItem.id}
    `;
    assert.deepEqual(state, {
      title: "Rollback probe",
      version: 1,
      events: 1,
    });
  });
  record("RPC rollback preserves item and audit history after event failure");

  await expectPgError(
    "snapshot update blocked by immutable trigger",
    "P0001",
    async () => {
      await sql`
        update public.observatory_snapshots
        set collector_version = 'mutated'
        where source_digest = ${digest}
      `;
    },
    /snapshots are immutable/iu,
  );

  await expectPgError(
    "snapshot delete blocked by immutable trigger",
    "P0001",
    async () => {
      await sql`
        delete from public.observatory_snapshots
        where source_digest = ${digest}
      `;
    },
    /snapshots are immutable/iu,
  );

  await expectPgError(
    "authenticated snapshot retention denied",
    "42501",
    () =>
      asRole("authenticated", adminId, async (transaction) => {
        await transaction`select public.prune_observatory_snapshots(30)`;
      }),
  );

  for (let index = 0; index < 32; index += 1) {
    const retentionDigest = randomBytes(32).toString("hex");
    await asRole("service_role", null, async (transaction) => {
      await transaction`
        insert into public.observatory_snapshots (
          schema_version,
          generated_at,
          source_digest,
          payload,
          summary,
          collector_version
        ) values (
          '2.0.0',
          now() + (${index}::text || ' seconds')::interval,
          ${retentionDigest},
          '{"kind":"retention-integration"}'::jsonb,
          '{"project_count":0}'::jsonb,
          'integration-test'
        )
      `;
    });
  }

  await asRole("service_role", null, async (transaction) => {
    const [marked] = await transaction<{ marked: boolean }[]>`
      select public.mark_observatory_snapshot_release(${digest}) as marked
    `;
    assert.equal(marked?.marked, true);
    const [pruned] = await transaction<{ deleted: number }[]>`
      select public.prune_observatory_snapshots(30) as deleted
    `;
    assert.equal(pruned?.deleted, 2);
  });
  const [retentionState] = await sql<
    { release_rows: number; rolling_rows: number }[]
  >`
    select
      count(*) filter (where release_evidence)::integer as release_rows,
      count(*) filter (where not release_evidence)::integer as rolling_rows
    from public.observatory_snapshots
  `;
  assert.deepEqual(retentionState, { release_rows: 1, rolling_rows: 30 });
  record("retention keeps 30 rolling rows plus release evidence");

  await expectPgError(
    "event update blocked by append-only trigger",
    "P0001",
    async () => {
      await sql`
        update public.observatory_work_item_events
        set data = '{"mutated":true}'::jsonb
        where work_item_id = ${created.id}
      `;
    },
    /events are append-only/iu,
  );

  await expectPgError(
    "service-role truncate denied",
    "42501",
    () =>
      asRole("service_role", null, async (transaction) => {
        await transaction`truncate table public.observatory_snapshots`;
      }),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        status: "pass",
        check_count: checks.length,
        checks,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error: unknown) => {
    const candidate = pgError(error);
    process.stderr.write(
      `OBSERVATORY_LOCAL_DB_VERIFY_FAILED: ${candidate.message ?? "Unknown error"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });
