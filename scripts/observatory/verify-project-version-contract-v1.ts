import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import postgres, { type Sql } from "postgres";

const MIGRATION_VERSION = "20260902000300";
const DEFAULT_MIGRATION_PATH = resolve(
  "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql",
);
export const ROLLBACK_GUIDANCE =
  "Forward-only rollback: the prior application revision is not directly compatible because this migration drops superseded RPC overloads. Keep the current application, or apply a reviewed corrective compatibility migration before application rollback. Never drop the schema or rewrite migration history.";

type Mode = "source" | "preflight" | "status" | "apply" | "concurrency";
export type VerifierOptions = {
  mode: Mode;
  confirmLocalApply?: true;
  confirmLocalConcurrency?: true;
};

export function assertLocalProjectVersionApplyTarget(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  if (
    parsed.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.port !== "54322" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error("Apply mode is restricted to the disposable loopback database on port 54322.");
  }
}

export function parseProjectVersionVerifierArgs(argv: string[]): VerifierOptions {
  let mode: Mode = "source";
  let confirmLocalApply = false;
  let confirmLocalConcurrency = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      const value = argv[++index];
      if (!value || !["source", "preflight", "status", "apply", "concurrency"].includes(value)) {
        throw new Error("--mode must be source, preflight, status, apply, or concurrency.");
      }
      mode = value as Mode;
    } else if (argument === "--confirm-local-apply") {
      confirmLocalApply = true;
    } else if (argument === "--confirm-local-concurrency") {
      confirmLocalConcurrency = true;
    } else {
      throw new Error(`unknown verifier option: ${argument}`);
    }
  }
  if (mode === "apply") {
    if (!confirmLocalApply) throw new Error("Apply mode requires --confirm-local-apply.");
  }
  if (mode === "concurrency" && !confirmLocalConcurrency) {
    throw new Error("Concurrency mode requires --confirm-local-concurrency.");
  }
  return {
    mode,
    ...(confirmLocalApply ? { confirmLocalApply: true as const } : {}),
    ...(confirmLocalConcurrency ? { confirmLocalConcurrency: true as const } : {}),
  };
}

function requirePattern(source: string, label: string, pattern: RegExp) {
  if (!pattern.test(source)) throw new Error(`Source verification failed: ${label}.`);
}

export async function verifyProjectVersionContractSource(
  migrationPath = DEFAULT_MIGRATION_PATH,
) {
  const source = await readFile(migrationPath, "utf8");
  const checks: string[] = [];
  requirePattern(source, "transaction boundary", /^\s*begin;[\s\S]*commit;\s*$/iu);
  checks.push("transaction boundary");
  requirePattern(source, "schema contract", /add column semver[\s\S]*version_binding_kind[\s\S]*project_version_id set not null/iu);
  checks.push("schema contract");
  requirePattern(source, "preflight guards", /OBSERVATORY_MULTIPLE_EXECUTION_VERSIONS[\s\S]*OBSERVATORY_WORK_ITEM_VERSION_REQUIRED/iu);
  checks.push("preflight guards");
  requirePattern(source, "portfolio indexes", /one_execution_idx[\s\S]*one_release_target_idx[\s\S]*semver_idx/iu);
  checks.push("portfolio indexes");
  requirePattern(
    source,
    "canonical constraints",
    /observatory_project_versions_status_check\s+check \(status in \('planned', 'active', 'gate_ready', 'released', 'archived', 'cancelled'\)\)[\s\S]*observatory_project_versions_semver_check\s+check \(\(is_backlog and semver is null\) or \(not is_backlog and \(semver is null or semver ~ '[^']+'\)\)\)[\s\S]*observatory_project_versions_backlog_release_target_check\s+check \(not \(is_backlog and is_release_target\)\)[\s\S]*observatory_project_versions_release_timestamp_check\s+check \(status not in \('released', 'archived'\) or \(released_at is not null and actual_date is not null\)\)/iu,
  );
  requirePattern(
    source,
    "exact prior constraint replacement",
    /conname = 'observatory_project_versions_status_check'[\s\S]*conname = 'observatory_project_versions_check'[\s\S]*OBSERVATORY_PROJECT_VERSION_PRIOR_CONSTRAINT_MISMATCH[\s\S]*drop constraint observatory_project_versions_status_check[\s\S]*drop constraint observatory_project_versions_check/iu,
  );
  if (/for\s+constraint_name\s+in|pg_get_constraintdef\(oid\)\s+like\s+'%status/iu.test(source)) {
    throw new Error("Source verification failed: exact prior constraint replacement.");
  }
  checks.push("canonical constraints");
  requirePattern(source, "predecessor integrity", /with recursive predecessor_chain[\s\S]*OBSERVATORY_PREDECESSOR_CYCLE/iu);
  requirePattern(source, "serialized predecessor graph", /lock_observatory_project_version_graph[\s\S]*pg_advisory_xact_lock\(20960902000300\)[\s\S]*create trigger observatory_project_versions_lock_graph[\s\S]*before insert or update of project_key, semver, predecessor_version_id[\s\S]*for each statement execute function public\.lock_observatory_project_version_graph/iu);
  checks.push("predecessor integrity");
  requirePattern(source, "lifecycle and release gates", /gate_ready[\s\S]*version_binding_kind = 'required'[\s\S]*RELEASE_GATE_INCOMPLETE/iu);
  requirePattern(source, "exact gate-ready transitions", /current_version\.status='gate_ready' and target_status in \('active','released'\)/iu);
  if (/current_version\.status='gate_ready'[\s\S]{0,120}'cancelled'/iu.test(source)) {
    throw new Error("Source verification failed: exact gate-ready transitions.");
  }
  checks.push("lifecycle and release gates");
  requirePattern(
    source,
    "terminal work item scope",
    /bound_version_status in \('released', 'archived'\)[\s\S]*new\.type is distinct from old\.type[\s\S]*new\.acceptance_criteria is distinct from old\.acceptance_criteria[\s\S]*new\.owner_id is distinct from old\.owner_id[\s\S]*new\.project_version_id is distinct from old\.project_version_id[\s\S]*OBSERVATORY_WORK_ITEM_VERSION_SCOPE_IMMUTABLE/iu,
  );
  checks.push("terminal work item scope");
  requirePattern(source, "serialized work item binding", /where id = new\.project_version_id\s+for key share[\s\S]*OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED/iu);
  requirePattern(source, "state mutation lock trigger", /create trigger observatory_work_items_validate_project_version\s+before insert or update of state,[\s\S]*for each row execute function public\.validate_observatory_work_item_project_version/iu);
  requirePattern(source, "version update lock order", /create function public\.update_observatory_project_version[\s\S]*pg_advisory_xact_lock\(20960902000300\)[\s\S]*for update/iu);
  requirePattern(source, "release gate lock order", /create function public\.transition_observatory_project_version[\s\S]*for update[\s\S]*from public\.observatory_work_items[\s\S]*version_binding_kind = 'required'/iu);
  for (const [signature, nextMarker, conflict] of [
    ["update_observatory_project_version", "create function public.transition_observatory_project_version", "OBSERVATORY_PROJECT_VERSION_CONFLICT"],
    ["transition_observatory_project_version", "-- Work Item RPCs", "OBSERVATORY_PROJECT_VERSION_CONFLICT"],
    ["update_observatory_work_item", "revoke all privileges on function public.create_observatory_project_version", "OBSERVATORY_VERSION_CONFLICT"],
  ] as const) {
    const bodyStart = source.indexOf(`create function public.${signature}`);
    const body = source.slice(bodyStart, source.indexOf(nextMarker, bodyStart));
    requirePattern(
      body,
      `null expected version guard for ${signature}`,
      new RegExp(`if p_expected_version is null then raise exception '${conflict}'`, "iu"),
    );
  }
  const createWorkItem = source.slice(
    source.indexOf("create function public.create_observatory_work_item"),
    source.indexOf("create function public.update_observatory_work_item"),
  );
  const retryLookup = createWorkItem.indexOf("where created_by=calling_user and idempotency_key=btrim(p_idempotency_key)");
  const terminalRejection = createWorkItem.indexOf("OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED");
  const workItemInsert = createWorkItem.indexOf("insert into public.observatory_work_items");
  if (retryLookup < 0 || terminalRejection < 0 || workItemInsert < 0
    || retryLookup > terminalRejection || retryLookup > workItemInsert
    || !/existing_item\.project_version_id is distinct from p_project_version_id/iu.test(createWorkItem)
    || !/on conflict \(created_by, idempotency_key\) do nothing/iu.test(createWorkItem)) {
    throw new Error("Source verification failed: terminal-safe create idempotency.");
  }
  const workItemAudit = source.slice(
    source.indexOf("insert into public.observatory_work_item_events", source.indexOf("create function public.create_observatory_work_item")),
    source.indexOf("revoke all privileges on function public.create_observatory_project_version"),
  );
  requirePattern(workItemAudit, "Work Item audit whitelist", /'version_binding_kind',[a-z_]+_item\.version_binding_kind/iu);
  if (/to_jsonb\((?:created|current|updated)_item\)|'idempotency_key'|'agent_claim_enabled'|'authorized_paths'|'allowed_action_classes'|'claim_approved_by'|'claim_approved_at'/iu.test(workItemAudit)) {
    throw new Error("Source verification failed: Work Item audit whitelist.");
  }
  checks.push("serialized mutation validation");
  requirePattern(source, "security and audit", /security definer[\s\S]*jsonb_build_object\('before'[\s\S]*grant execute/iu);
  checks.push("security and audit");
  checks.push("rollback guidance");
  return { mode: "source" as const, ok: true, checks, rollbackGuidance: ROLLBACK_GUIDANCE };
}

type ReadOnlySqlClient = {
  unsafe: (statement: string) => Promise<readonly Record<string, unknown>[]>;
};

export type ProjectVersionPreflightCounts = {
  missingBindings: number;
  multipleExecutionProjects: number;
  normalizedSemverCollisions: number;
  predecessorSelfReferences: number;
  predecessorMissingTargets: number;
  predecessorCrossProjectReferences: number;
  predecessorNonCanonicalSemverReferences: number;
  predecessorNonIncreasingReferences: number;
  predecessorCycles: number;
  duplicateReleaseTargetProjects: number;
};

export type ProjectVersionPreflightResult = {
  mode: "preflight";
  ok: boolean;
  blockingIssueCount: number;
  warningCount: number;
  blocking: ProjectVersionPreflightCounts;
  warnings: { legacyNonSemverLabels: number };
};

async function readCount(
  client: ReadOnlySqlClient,
  statement: string,
  key: string,
): Promise<number> {
  const [row] = await client.unsafe(statement);
  return Number(row?.[key] ?? 0);
}

export async function readProjectVersionContractPreflight(client: ReadOnlySqlClient) {
  const [capabilities = {}] = await client.unsafe(`
    select
      to_regclass('public.observatory_project_versions') is not null as versions_table,
      to_regclass('public.observatory_work_items') is not null as work_items_table,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_work_items' and column_name='project_version_id') as project_version_id,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_project_versions' and column_name='predecessor_version_id') as predecessor_version_id,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_project_versions' and column_name='is_release_target') as is_release_target,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_project_versions' and column_name='is_backlog') as is_backlog
      , exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_project_versions' and column_name='semver') as semver
  `);
  const versionsTable = capabilities.versions_table === true;
  const workItemsTable = capabilities.work_items_table === true;
  const projectVersionId = capabilities.project_version_id === true;
  const predecessorVersionId = capabilities.predecessor_version_id === true;
  const releaseTarget = capabilities.is_release_target === true;
  const backlog = capabilities.is_backlog === true;
  const semver = capabilities.semver === true;

  let missingBindings = 0;
  if (workItemsTable && !projectVersionId) {
    missingBindings = await readCount(
      client,
      "select count(*)::integer as missing_binding_count from public.observatory_work_items",
      "missing_binding_count",
    );
  } else if (workItemsTable && projectVersionId && !versionsTable) {
    missingBindings = await readCount(
      client,
      "select count(*)::integer as missing_binding_count from public.observatory_work_items",
      "missing_binding_count",
    );
  } else if (workItemsTable && projectVersionId && versionsTable) {
    missingBindings = await readCount(client, `
      select count(*)::integer as missing_binding_count
      from public.observatory_work_items item
      left join public.observatory_project_versions version on version.id=item.project_version_id
      where item.project_version_id is null or version.id is null
        or version.project_key<>coalesce(item.project_key,item.project_ref)
    `, "missing_binding_count");
  }

  const multipleExecutionProjects = versionsTable
    ? await readCount(client, `
        select count(*)::integer as multiple_execution_project_count from (
          select project_key from public.observatory_project_versions
          where status in ('active','gate_ready') group by project_key having count(*)>1
        ) duplicates
      `, "multiple_execution_project_count")
    : 0;
  const legacyNonSemverLabels = versionsTable
    ? await readCount(client, `
        select count(*)::integer as legacy_non_semver_label_count
        from public.observatory_project_versions
        where ${backlog ? "not is_backlog and" : ""}
          version_label !~ '^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:\\.(0|[1-9][0-9]*))?$'
      `, "legacy_non_semver_label_count")
    : 0;
  const normalizedVersionExpression =
    "(regexp_match(version_label, '^v?([0-9]+)\\.([0-9]+)(?:\\.([0-9]+))?$'))[1] || '.' || (regexp_match(version_label, '^v?([0-9]+)\\.([0-9]+)(?:\\.([0-9]+))?$'))[2] || '.' || coalesce((regexp_match(version_label, '^v?([0-9]+)\\.([0-9]+)(?:\\.([0-9]+))?$'))[3], '0')";
  const normalizedSemverCollisions = versionsTable
    ? await readCount(client, `
        select count(*)::integer as normalized_semver_collision_count from (
          select project_key, ${normalizedVersionExpression} as normalized_semver
          from public.observatory_project_versions
          where ${backlog ? "not is_backlog and" : ""}
            version_label ~ '^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:\\.(0|[1-9][0-9]*))?$'
          group by project_key, normalized_semver
          having count(*) > 1
        ) collisions
      `, "normalized_semver_collision_count")
    : 0;

  let predecessorSelfReferences = 0;
  let predecessorMissingTargets = 0;
  let predecessorCrossProjectReferences = 0;
  let predecessorNonCanonicalSemverReferences = 0;
  let predecessorNonIncreasingReferences = 0;
  let predecessorCycles = 0;
  if (versionsTable && predecessorVersionId) {
    const canonicalEndpointPredicate = semver
      ? `version.semver ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'
            and predecessor.semver ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'`
      : `version.version_label ~ '^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:\\.(0|[1-9][0-9]*))?$'
            and predecessor.version_label ~ '^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:\\.(0|[1-9][0-9]*))?$'`;
    const predecessorOrderPredicate = semver
      ? `${canonicalEndpointPredicate}
            and string_to_array(predecessor.semver, '.')::integer[] >=
              string_to_array(version.semver, '.')::integer[]`
      : `${canonicalEndpointPredicate}
            and string_to_array(trim(leading 'v' from predecessor.version_label) ||
              case when predecessor.version_label ~ '^v?[0-9]+\\.[0-9]+$' then '.0' else '' end, '.')::integer[] >=
              string_to_array(trim(leading 'v' from version.version_label) ||
              case when version.version_label ~ '^v?[0-9]+\\.[0-9]+$' then '.0' else '' end, '.')::integer[]`;
    const [row = {}] = await client.unsafe(`
      select
        count(*) filter (where version.predecessor_version_id=version.id)::integer as predecessor_self_count,
        count(*) filter (where predecessor.id is null)::integer as predecessor_missing_target_count,
        count(*) filter (where predecessor.id is not null and predecessor.project_key<>version.project_key)::integer
          as predecessor_cross_project_count,
        count(*) filter (
          where predecessor.id is not null and not coalesce((${canonicalEndpointPredicate}), false)
        )::integer as predecessor_non_canonical_semver_count,
        count(*) filter (
          where predecessor.id is not null
            and ${predecessorOrderPredicate}
        )::integer as predecessor_non_increasing_count
      from public.observatory_project_versions version
      left join public.observatory_project_versions predecessor on predecessor.id=version.predecessor_version_id
      where version.predecessor_version_id is not null
    `);
    predecessorSelfReferences = Number(row.predecessor_self_count ?? 0);
    predecessorMissingTargets = Number(row.predecessor_missing_target_count ?? 0);
    predecessorCrossProjectReferences = Number(row.predecessor_cross_project_count ?? 0);
    predecessorNonCanonicalSemverReferences = Number(row.predecessor_non_canonical_semver_count ?? 0);
    predecessorNonIncreasingReferences = Number(row.predecessor_non_increasing_count ?? 0);
    predecessorCycles = await readCount(client, `
      with recursive predecessor_chain(origin, id, predecessor_version_id, path, cycle) as (
        select id, id, predecessor_version_id, array[id], false
        from public.observatory_project_versions where predecessor_version_id is not null
        union all
        select chain.origin, version.id, version.predecessor_version_id,
          chain.path || version.id, version.id = any(chain.path)
        from predecessor_chain chain
        join public.observatory_project_versions version on version.id=chain.predecessor_version_id
        where not chain.cycle
      )
      select count(distinct origin)::integer as predecessor_cycle_count
      from predecessor_chain where cycle
    `, "predecessor_cycle_count");
  }
  const duplicateReleaseTargetProjects = versionsTable && releaseTarget
    ? await readCount(client, `
        select count(*)::integer as duplicate_release_target_project_count from (
          select project_key from public.observatory_project_versions
          where is_release_target group by project_key having count(*)>1
        ) duplicates
      `, "duplicate_release_target_project_count")
    : 0;

  const blocking: ProjectVersionPreflightCounts = {
    missingBindings,
    multipleExecutionProjects,
    normalizedSemverCollisions,
    predecessorSelfReferences,
    predecessorMissingTargets,
    predecessorCrossProjectReferences,
    predecessorNonCanonicalSemverReferences,
    predecessorNonIncreasingReferences,
    predecessorCycles,
    duplicateReleaseTargetProjects,
  };
  const blockingIssueCount = Object.values(blocking).reduce((total, count) => total + count, 0);
  return {
    mode: "preflight" as const,
    ok: blockingIssueCount === 0,
    blockingIssueCount,
    warningCount: legacyNonSemverLabels,
    blocking,
    warnings: { legacyNonSemverLabels },
  };
}

export function assertProjectVersionPreflightAllowsApply(preflight: ProjectVersionPreflightResult) {
  if (preflight.ok) return;
  const issues = Object.entries(preflight.blocking)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${name}=${count}`)
    .join(", ");
  throw new Error(`Project Version preflight blocked apply: ${issues}.`);
}

export async function readProjectVersionContractStatus(sql: Sql) {
  const [status] = await sql<Record<string, boolean | number>[]>`
    with bounded_rpc_signatures(signature) as (values
      ('public.create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)'),
      ('public.ensure_observatory_project_backlog_versions(text[])'),
      ('public.update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)'),
      ('public.transition_observatory_project_version(uuid,integer,text)'),
      ('public.create_observatory_work_item(text,text,text,text,text,uuid,text,text)'),
      ('public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text)')
    ), superseded_rpc_signatures(signature) as (values
      ('public.create_observatory_project_version(text,text,text,text,date)'),
      ('public.update_observatory_project_version(uuid,integer,text,text,text,date)'),
      ('public.create_observatory_work_item(text,text,text,text,text,uuid,text)'),
      ('public.create_observatory_work_item(text,text,text,text,text,text)'),
      ('public.create_observatory_work_item(text,text,text,text,text)'),
      ('public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text)'),
      ('public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,integer,text,text)'),
      ('public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text)'),
      ('public.update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid)')
    ), resolved_bounded_rpcs as (
      select signature, to_regprocedure(signature) as procedure
      from bounded_rpc_signatures
    ), mutation_function_catalog as (
      select bounded.signature, bounded.procedure, function_catalog.prosecdef,
        function_catalog.proconfig,
        lower(regexp_replace(pg_get_functiondef(bounded.procedure), '\\s+', ' ', 'g')) as definition
      from resolved_bounded_rpcs bounded
      left join pg_proc function_catalog on function_catalog.oid=bounded.procedure
    ), table_acl_expectations(table_name, grantee_name, grantee_oid, privilege_type, expected) as (
      select table_name, grantee_name, grantee_oid, privilege_type,
        grantee_name='authenticated' and privilege_type='SELECT'
      from (values
        ('observatory_project_versions'),
        ('observatory_project_version_events')
      ) tables(table_name)
      cross join (values
        ('public', 0::oid),
        ('anon', (select oid from pg_roles where rolname='anon')),
        ('authenticated', (select oid from pg_roles where rolname='authenticated')),
        ('service_role', (select oid from pg_roles where rolname='service_role'))
      ) grantees(grantee_name, grantee_oid)
      cross join (values
        ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
      ) privileges(privilege_type)
    ), rpc_acl_expectations(signature, grantee_name, grantee_oid, expected) as (
      select signature, grantee_name, grantee_oid, grantee_name='authenticated'
      from bounded_rpc_signatures
      cross join (values
        ('public', 0::oid),
        ('anon', (select oid from pg_roles where rolname='anon')),
        ('authenticated', (select oid from pg_roles where rolname='authenticated')),
        ('service_role', (select oid from pg_roles where rolname='service_role'))
      ) grantees(grantee_name, grantee_oid)
    ), policy_expectations(table_name, policy_name) as (values
      ('observatory_project_versions','observatory_project_versions_select_admin'),
      ('observatory_project_version_events','observatory_project_version_events_select_admin')
    ), constraint_definitions as (
      select constraint_catalog.conrelid, constraint_catalog.conname,
        lower(regexp_replace(pg_get_constraintdef(constraint_catalog.oid), '\\s+', ' ', 'g')) as definition,
        constraint_catalog.convalidated
      from pg_constraint constraint_catalog
      where constraint_catalog.contype='c'
        and constraint_catalog.conrelid in (
          'public.observatory_project_versions'::regclass,
          'public.observatory_work_items'::regclass
        )
    ), function_definitions(signature, definition) as (
      select signature, lower(regexp_replace(pg_get_functiondef(to_regprocedure(signature)), '\\s+', ' ', 'g'))
      from (values
        ('public.lock_observatory_project_version_graph()'),
        ('public.validate_observatory_project_version_predecessor()'),
        ('public.validate_observatory_work_item_project_version()'),
        ('public.update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)'),
        ('public.transition_observatory_project_version(uuid,integer,text)')
      ) definitions(signature)
      where to_regprocedure(signature) is not null
    )
    select
      (select count(*) = 15 from information_schema.columns where table_schema='public'
        and table_name='observatory_project_versions' and column_name = any(array[
          'semver','is_release_target','milestone_ref','predecessor_version_id','roadmap_ref',
          'approved_plan_ref','acceptance_summary','actual_date','dependencies_summary',
          'dependencies_satisfied','artifacts_accepted','verification_complete',
          'roadmap_reconciled','user_gate_decision_ref','version_label'
        ])) as version_columns,
      exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='observatory_work_items' and column_name='version_binding_kind' and is_nullable='NO') as binding_column,
      to_regclass('public.observatory_project_versions_one_execution_idx') is not null as execution_index,
      to_regclass('public.observatory_project_versions_one_release_target_idx') is not null as release_target_index,
      to_regclass('public.observatory_project_versions_semver_idx') is not null as semver_index,
      exists(select 1 from constraint_definitions where conrelid='public.observatory_project_versions'::regclass
        and conname='observatory_project_versions_status_check' and convalidated
        and definition='check ((status = any (array[''planned''::text, ''active''::text, ''gate_ready''::text, ''released''::text, ''archived''::text, ''cancelled''::text])))') as status_constraint,
      exists(select 1 from constraint_definitions where conrelid='public.observatory_project_versions'::regclass
        and conname='observatory_project_versions_semver_check' and convalidated
        and definition='check (((is_backlog and (semver is null)) or ((not is_backlog) and ((semver is null) or (semver ~ ''^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$''::text)))))')
        as semver_constraint,
      exists(select 1 from constraint_definitions where conrelid='public.observatory_project_versions'::regclass
        and conname='observatory_project_versions_backlog_release_target_check' and convalidated
        and definition='check ((not (is_backlog and is_release_target)))')
        as backlog_release_target_constraint,
      exists(select 1 from constraint_definitions where conrelid='public.observatory_project_versions'::regclass
        and conname='observatory_project_versions_release_timestamp_check' and convalidated
        and definition='check (((status <> all (array[''released''::text, ''archived''::text])) or ((released_at is not null) and (actual_date is not null))))')
        as release_timestamp_constraint,
      exists(select 1 from constraint_definitions where conrelid='public.observatory_work_items'::regclass
        and conname='observatory_work_items_version_binding_kind_check' and convalidated
        and definition='check ((version_binding_kind = any (array[''required''::text, ''optional''::text])))') as binding_constraint,
      exists(select 1 from pg_trigger
        where tgrelid='public.observatory_work_items'::regclass
          and tgname='observatory_work_items_validate_project_version'
          and tgenabled in ('O','A') and not tgisinternal
          and tgfoid=to_regprocedure('public.validate_observatory_work_item_project_version()')
          and lower(regexp_replace(pg_get_triggerdef(oid), '\\s+', ' ', 'g')) like
            '%before insert or update of state, type, title, description, acceptance_criteria, priority, owner_id, assigned_agent_id, project_ref, milestone_ref, project_key, plan_revision, stage_id, work_package_id, project_version_id, version_binding_kind on public.observatory_work_items%')
        as work_item_validation_trigger,
      exists(select 1 from pg_trigger
        where tgrelid='public.observatory_project_versions'::regclass
          and tgname='observatory_project_versions_lock_graph'
          and tgenabled in ('O','A') and not tgisinternal
          and tgfoid=to_regprocedure('public.lock_observatory_project_version_graph()')
          and lower(regexp_replace(pg_get_triggerdef(oid), '\\s+', ' ', 'g')) like
            '%before insert or update of project_key, semver, predecessor_version_id on public.observatory_project_versions for each statement execute function public.lock_observatory_project_version_graph()%')
        as graph_lock_trigger,
      exists(select 1 from function_definitions
        where signature='public.lock_observatory_project_version_graph()'
          and definition like '%pg_advisory_xact_lock(20960902000300)%') as graph_lock_function,
      exists(select 1 from function_definitions
        where signature='public.validate_observatory_work_item_project_version()'
          and definition like '%where id = old.project_version_id%for key share%bound_version_status in%where id = new.project_version_id%for key share%version_status in%') as work_item_validator_lock,
      exists(select 1 from function_definitions
        where signature like 'public.update_observatory_project_version(%'
          and position('pg_advisory_xact_lock(20960902000300)' in definition)>0
          and position('pg_advisory_xact_lock(20960902000300)' in definition)<position('for update' in definition))
        as version_update_lock_order,
      exists(select 1 from function_definitions
        where signature='public.transition_observatory_project_version(uuid,integer,text)'
          and position('for update' in definition)>0
          and position('for update' in definition)<position('from public.observatory_work_items' in definition)
          and definition like '%version_binding_kind = ''required''%state <> ''done''%')
        as version_transition_lock_order,
      exists(select 1 from function_definitions
        where signature='public.validate_observatory_project_version_predecessor()'
          and position('pg_advisory_xact_lock(20960902000300)' in definition)>0
          and position('pg_advisory_xact_lock(20960902000300)' in definition)<position('if new.predecessor_version_id' in definition)
          and definition like '%with recursive predecessor_chain%observatory_predecessor_cycle%observatory_successor_order_invalid%')
        as predecessor_validator_lock,
      exists(select 1 from pg_trigger
        where tgrelid='public.observatory_project_versions'::regclass
          and tgname='observatory_project_versions_validate_predecessor'
          and tgenabled in ('O','A') and not tgisinternal
          and tgfoid=to_regprocedure('public.validate_observatory_project_version_predecessor()')) as predecessor_trigger,
      exists(select 1 from pg_trigger where tgname='observatory_project_versions_protect_history' and not tgisinternal) as history_trigger,
      (select bool_and(procedure is not null) from resolved_bounded_rpcs)
        as bounded_rpcs,
      not exists(select 1 from superseded_rpc_signatures where to_regprocedure(signature) is not null)
        as superseded_rpcs_absent,
      exists(select 1 from pg_class where oid='public.observatory_project_versions'::regclass and relrowsecurity)
        and exists(select 1 from pg_class where oid='public.observatory_project_version_events'::regclass and relrowsecurity)
        as versions_and_events_rls,
      not exists (
        select 1 from table_acl_expectations expectation
        join pg_class table_catalog on table_catalog.oid=
          format('public.%I',expectation.table_name)::regclass
        where exists (
          select 1 from aclexplode(coalesce(table_catalog.relacl,acldefault('r',table_catalog.relowner))) privilege
          where privilege.grantee=expectation.grantee_oid
            and privilege.privilege_type=expectation.privilege_type
            and not privilege.is_grantable
        ) is distinct from expectation.expected
      ) and not exists (
        select 1 from pg_class table_catalog
        cross join lateral aclexplode(coalesce(table_catalog.relacl,acldefault('r',table_catalog.relowner))) privilege
        where table_catalog.oid in (
          'public.observatory_project_versions'::regclass,
          'public.observatory_project_version_events'::regclass
        ) and privilege.grantee<>table_catalog.relowner
          and not (privilege.grantee=(select oid from pg_roles where rolname='authenticated')
            and privilege.privilege_type='SELECT' and not privilege.is_grantable)
      ) as table_acls_exact,
      (select count(*)=2 from pg_policy policy
        where policy.polrelid in (
          'public.observatory_project_versions'::regclass,
          'public.observatory_project_version_events'::regclass
        )) and not exists (
          select 1 from policy_expectations expectation
          left join pg_policy policy on policy.polrelid=
              format('public.%I',expectation.table_name)::regclass
            and policy.polname=expectation.policy_name
          where policy.oid is null or not policy.polpermissive or policy.polcmd<>'r'
            or policy.polroles<>array[(select oid from pg_roles where rolname='authenticated')]
            or lower(regexp_replace(pg_get_expr(policy.polqual,policy.polrelid), '\\s+', ' ', 'g'))<>'is_current_user_admin()'
            or policy.polwithcheck is not null
      ) as admin_select_policies_exact,
      not exists (
        select 1 from rpc_acl_expectations expectation
        join pg_proc function_catalog on function_catalog.oid=to_regprocedure(expectation.signature)
        where exists (
          select 1 from aclexplode(coalesce(function_catalog.proacl,acldefault('f',function_catalog.proowner))) privilege
          where privilege.grantee=expectation.grantee_oid
            and privilege.privilege_type='EXECUTE' and not privilege.is_grantable
        ) is distinct from expectation.expected
      ) and not exists (
        select 1 from mutation_function_catalog mutation
        join pg_proc function_catalog on function_catalog.oid=mutation.procedure
        cross join lateral aclexplode(coalesce(function_catalog.proacl,acldefault('f',function_catalog.proowner))) privilege
        where privilege.grantee<>function_catalog.proowner
          and not (privilege.grantee=(select oid from pg_roles where rolname='authenticated')
            and privilege.privilege_type='EXECUTE' and not privilege.is_grantable)
      ) as rpc_acls_exact,
      (select bool_and(procedure is not null and prosecdef
        and proconfig=array['search_path=pg_catalog']
        and definition like '%if calling_user is null or not public.is_current_user_admin() then%'
        and definition like '%administrator access required%'
      ) from mutation_function_catalog) as admin_rpc_definitions_exact,
      exists(select 1 from supabase_migrations.schema_migrations where version=${MIGRATION_VERSION}) as migration_recorded,
      not exists(select 1 from public.observatory_work_items item left join public.observatory_project_versions version
        on version.id=item.project_version_id where item.project_version_id is null
        or version.id is null or version.project_key<>coalesce(item.project_key,item.project_ref)) as bindings_valid,
      not exists(select 1 from public.observatory_project_versions where status in ('active','gate_ready')
        group by project_key having count(*)>1) as execution_versions_valid,
      not exists(select 1 from public.observatory_project_versions where is_release_target
        group by project_key having count(*)>1) as release_targets_valid,
      not exists(select 1 from public.observatory_project_versions where is_backlog and is_release_target)
        as backlog_release_targets_valid,
      not exists(select 1 from public.observatory_project_versions where semver is not null
        and semver !~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') as semver_valid,
      not exists(select 1 from public.observatory_project_versions version
        join public.observatory_project_versions predecessor on predecessor.id=version.predecessor_version_id
        where predecessor.project_key<>version.project_key or predecessor.semver is null or version.semver is null
          or string_to_array(predecessor.semver,'.')::integer[] >= string_to_array(version.semver,'.')::integer[])
        and not exists(
          with recursive predecessor_chain(origin, id, predecessor_version_id, path, cycle) as (
            select id, id, predecessor_version_id, array[id], false
            from public.observatory_project_versions where predecessor_version_id is not null
            union all
            select chain.origin, version.id, version.predecessor_version_id,
              chain.path || version.id, version.id = any(chain.path)
            from predecessor_chain chain
            join public.observatory_project_versions version on version.id=chain.predecessor_version_id
            where not chain.cycle
          )
          select 1 from predecessor_chain where cycle
        ) as predecessors_valid
  `;
  if (!status || Object.values(status).some((value) => value !== true)) {
    const failed = Object.entries(status ?? {}).filter(([, value]) => value !== true).map(([key]) => key);
    throw new Error(`Database status verification failed: ${failed.join(", ") || "unavailable"}.`);
  }
  return { mode: "status" as const, ok: true, checks: Object.keys(status), rollbackGuidance: ROLLBACK_GUIDANCE };
}

async function applyMigration(sql: Sql) {
  const source = await readFile(DEFAULT_MIGRATION_PATH, "utf8");
  const body = source.replace(/^\s*begin;\s*/iu, "").replace(/\s*commit;\s*$/iu, "");
  await sql.begin(async (transaction) => {
    await transaction.unsafe(body);
    await transaction`
      insert into supabase_migrations.schema_migrations(version, statements, name)
      values (${MIGRATION_VERSION}, array[${source}], 'work_tracker_project_version_contract_v1')
      on conflict (version) do nothing
    `;
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Local-only, post-apply concurrency exercise. It writes a uniquely named fixture
 * to the disposable loopback database, commits only the Work Item state change,
 * rolls back the release RPC, and removes the event-free fixture rows in finally.
 */
export async function exerciseProjectVersionReleaseConcurrency(databaseUrl: string) {
  assertLocalProjectVersionApplyTarget(databaseUrl);
  const connectionOptions = {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    onnotice: () => undefined,
  } as const;
  const observer = postgres(databaseUrl, connectionOptions);
  const stateConnection = postgres(databaseUrl, connectionOptions);
  const releaseConnection = postgres(databaseUrl, connectionOptions);
  const fixtureSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const projectKey = `local/concurrency-${fixtureSuffix}`;
  const stateChanged = deferred();
  const allowStateCommit = deferred();
  const releaseStarted = deferred();
  let versionId: string | undefined;
  let itemId: string | undefined;
  let releasePid: number | undefined;
  let releaseFinished = false;
  let statePromise: Promise<unknown> | undefined;
  let releasePromise: Promise<unknown> | undefined;

  try {
    const [admin] = await observer<{ user_id: string }[]>`
      select user_id::text as user_id from public.profiles
      where is_admin=true order by created_at limit 1
    `;
    if (!admin?.user_id) throw new Error("Local concurrency mode requires one administrator fixture.");

    const [version] = await observer<{ id: string }[]>`
      insert into public.observatory_project_versions (
        project_key, version_label, semver, title, description, status,
        acceptance_summary, dependencies_satisfied, artifacts_accepted,
        verification_complete, roadmap_reconciled, user_gate_decision_ref,
        created_by, updated_by
      ) values (
        ${projectKey}, 'v1.0.0', '1.0.0', 'Local concurrency fixture', '', 'gate_ready',
        'accepted', true, true, true, true, 'local-only',
        ${admin.user_id}::uuid, ${admin.user_id}::uuid
      ) returning id::text as id
    `;
    versionId = version?.id;
    if (!versionId) throw new Error("Unable to create the local Version concurrency fixture.");

    const [item] = await observer<{ id: string }[]>`
      insert into public.observatory_work_items (
        type, title, description, state, idempotency_key, created_by,
        project_ref, project_version_id, version_binding_kind, assigned_agent_id
      ) values (
        'feature', 'Local required item', '', 'review', ${`concurrency-${fixtureSuffix}`},
        ${admin.user_id}::uuid, ${projectKey}, ${versionId}::uuid, 'required', 'plato'
      ) returning id::text as id
    `;
    itemId = item?.id;
    if (!itemId) throw new Error("Unable to create the local Work Item concurrency fixture.");

    statePromise = (async () => {
      await stateConnection.unsafe("begin");
      try {
        await stateConnection.unsafe("set local statement_timeout='5s'; set local lock_timeout='5s'");
        const changed = await stateConnection<{ state: string }[]>`
          update public.observatory_work_items set state='done', version=version+1
          where id=${itemId}::uuid returning state
        `;
        if (changed[0]?.state !== "done") throw new Error("Required Work Item state change did not execute.");
        stateChanged.resolve();
        await withTimeout(allowStateCommit.promise, 5_000, "State transaction release barrier");
        await stateConnection.unsafe("commit");
      } catch (error) {
        await stateConnection.unsafe("rollback").catch(() => undefined);
        throw error;
      }
    })();
    await withTimeout(stateChanged.promise, 5_000, "Required Work Item state change");

    releasePromise = (async () => {
      await releaseConnection.unsafe("begin");
      try {
        await releaseConnection.unsafe("set local statement_timeout='5s'; set local lock_timeout='5s'");
        await releaseConnection`select set_config('request.jwt.claim.sub', ${admin.user_id}, true)`;
        const [backend] = await releaseConnection<{ pid: number }[]>`select pg_backend_pid()::integer as pid`;
        releasePid = backend?.pid;
        releaseStarted.resolve();
        const [released] = await releaseConnection<{ status: string }[]>`
          select status from public.transition_observatory_project_version(${versionId}::uuid, 1, 'released')
        `;
        const [required] = await releaseConnection<{ non_done: number }[]>`
          select count(*)::integer as non_done from public.observatory_work_items
          where project_version_id=${versionId}::uuid and version_binding_kind='required' and state<>'done'
        `;
        if (released?.status !== "released" || required?.non_done !== 0) {
          throw new Error("Serialized release observed a required non-done Work Item.");
        }
        return released.status;
      } finally {
        await releaseConnection.unsafe("rollback").catch(() => undefined);
      }
    })().finally(() => { releaseFinished = true; });
    await withTimeout(releaseStarted.promise, 5_000, "Release transaction start");
    if (!releasePid) throw new Error("Release transaction backend identity is unavailable.");

    const lockDeadline = Date.now() + 3_000;
    let lockObserved = false;
    while (!lockObserved && Date.now() < lockDeadline) {
      if (releaseFinished) throw new Error("Release did not serialize behind the required Work Item state change.");
      const [activity] = await observer<{ waiting: boolean }[]>`
        select exists(select 1 from pg_stat_activity
          where pid=${releasePid} and wait_event_type='Lock') as waiting
      `;
      lockObserved = activity?.waiting === true;
      if (!lockObserved) await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    }
    if (!lockObserved) throw new Error("Release lock wait was not observed within 3000ms.");

    allowStateCommit.resolve();
    await withTimeout(Promise.all([statePromise, releasePromise]), 7_000, "Serialized release exercise");
    return { mode: "concurrency" as const, ok: true, lockObserved: true, finalState: "released+done" };
  } finally {
    allowStateCommit.resolve();
    await Promise.allSettled([statePromise, releasePromise].filter(Boolean) as Promise<unknown>[]);
    if (itemId) await observer`delete from public.observatory_work_items where id=${itemId}::uuid`;
    if (versionId) await observer`delete from public.observatory_project_versions where id=${versionId}::uuid`;
    await Promise.all([
      observer.end({ timeout: 5 }),
      stateConnection.end({ timeout: 5 }),
      releaseConnection.end({ timeout: 5 }),
    ]);
  }
}

export async function runProjectVersionContractVerifier(options: VerifierOptions) {
  if (options.mode === "source") return verifyProjectVersionContractSource();
  if (options.mode === "concurrency") {
    const localDatabaseUrl = process.env.OBSERVATORY_LOCAL_DB_URL;
    if (!localDatabaseUrl) {
      throw new Error("Database concurrency mode requires OBSERVATORY_LOCAL_DB_URL.");
    }
    assertLocalProjectVersionApplyTarget(localDatabaseUrl);
    return exerciseProjectVersionReleaseConcurrency(localDatabaseUrl);
  }
  const databaseUrl = process.env.OBSERVATORY_DATABASE_URL ?? process.env.OBSERVATORY_LOCAL_DB_URL;
  if (!databaseUrl) throw new Error(`Database ${options.mode} mode requires OBSERVATORY_DATABASE_URL or OBSERVATORY_LOCAL_DB_URL.`);
  if (options.mode === "apply") assertLocalProjectVersionApplyTarget(databaseUrl);
  const sql = postgres(databaseUrl, { connect_timeout: 10, idle_timeout: 5, max: 1, onnotice: () => undefined });
  try {
    const preflightClient = { unsafe: (statement: string) => sql.unsafe(statement) };
    if (options.mode === "preflight") return await readProjectVersionContractPreflight(preflightClient);
    if (options.mode === "apply") {
      const preflight = await readProjectVersionContractPreflight(preflightClient);
      assertProjectVersionPreflightAllowsApply(preflight);
      await applyMigration(sql);
    }
    return await readProjectVersionContractStatus(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function formatProjectVersionVerifierError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown verifier failure.";
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, "[DATABASE_URL_REDACTED]");
}

async function main() {
  try {
    const options = parseProjectVersionVerifierArgs(process.argv.slice(2));
    const result = await runProjectVersionContractVerifier(options);
    process.stdout.write(`${JSON.stringify(result)}\n${ROLLBACK_GUIDANCE}\n`);
  } catch (error) {
    const message = formatProjectVersionVerifierError(error);
    process.stderr.write(`OBSERVATORY_PROJECT_VERSION_CONTRACT_V1_VERIFY_FAILED: ${message}\n${ROLLBACK_GUIDANCE}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
