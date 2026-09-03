import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql",
);

async function migration() {
  return (await readFile(migrationPath, "utf8")).replace(/\s+/gu, " ");
}

describe("Project Version contract v1 migration", () => {
  it("is additive, transactional, and performs fail-closed preflights before constraints", async () => {
    const sql = await migration();
    expect(sql).toMatch(/^begin;/iu);
    expect(sql).toMatch(/commit;\s*$/iu);
    expect(sql).not.toMatch(/drop table|drop column/iu);
    expect(sql.indexOf("OBSERVATORY_MULTIPLE_EXECUTION_VERSIONS")).toBeLessThan(
      sql.indexOf("observatory_project_versions_one_execution_idx"),
    );
    expect(sql.indexOf("OBSERVATORY_WORK_ITEM_VERSION_REQUIRED")).toBeLessThan(
      sql.indexOf("alter column project_version_id set not null"),
    );
    expect(sql).toMatch(/version\.project_key\s*<>\s*coalesce\(item\.project_key,\s*item\.project_ref\)/iu);
    expect(sql).toMatch(/OBSERVATORY_PREDECESSOR_(SELF|PROJECT_MISMATCH|CYCLE)/u);
  });

  it("adds the complete version and Work Item contract without rewriting scope", async () => {
    const sql = await migration();
    for (const column of [
      "semver text",
      "is_release_target boolean",
      "milestone_ref text",
      "predecessor_version_id uuid",
      "roadmap_ref text",
      "approved_plan_ref text",
      "acceptance_summary text",
      "actual_date date",
      "dependencies_summary text",
      "dependencies_satisfied boolean",
      "artifacts_accepted boolean",
      "verification_complete boolean",
      "roadmap_reconciled boolean",
      "user_gate_decision_ref text",
      "version_binding_kind text",
    ]) expect(sql.toLowerCase()).toContain(column);
    expect(sql).toMatch(/version_binding_kind[\s\S]*default 'optional'/iu);
    expect(sql).toMatch(/set version_binding_kind = 'optional'/iu);
    expect(sql).toMatch(/alter column version_binding_kind set not null/iu);
    const dataBackfill = sql.slice(
      sql.indexOf("update public.observatory_project_versions"),
      sql.indexOf("alter table public.observatory_work_items alter column"),
    );
    expect(dataBackfill).not.toMatch(/set\s+(version_label|description|milestone_ref)\s*=/iu);
  });

  it("normalizes only safe legacy SemVer labels and enforces portfolio invariants", async () => {
    const sql = await migration();
    expect(sql).toContain("^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:\\.(0|[1-9][0-9]*))?$");
    expect(sql).toMatch(/is_backlog[\s\S]*semver is null/iu);
    expect(sql).toContain("semver ~ '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$'");
    expect(sql).toContain("observatory_project_versions_semver_idx");
    expect(sql).toContain("observatory_project_versions_one_execution_idx");
    expect(sql).toContain("observatory_project_versions_one_release_target_idx");
    expect(sql).toMatch(/where status in \('active', 'gate_ready'\)/iu);
    expect(sql).toMatch(/where is_release_target/iu);
    expect(sql).toMatch(/update public\.observatory_project_versions set is_release_target\s*=\s*false where is_backlog and is_release_target is distinct from false/iu);
    expect(sql).toMatch(/observatory_project_versions_backlog_release_target_check[\s\S]*not\s*\(is_backlog and is_release_target\)/iu);
    expect(sql).toMatch(/planned[\s\S]*active[\s\S]*gate_ready[\s\S]*released[\s\S]*archived[\s\S]*cancelled/iu);
  });

  it("enforces predecessor, lifecycle, immutable history, and release gates in database code", async () => {
    const sql = await migration();
    expect(sql).toContain("validate_observatory_project_version_predecessor");
    expect(sql).toMatch(/predecessor\.project_key <> new\.project_key/iu);
    expect(sql).toMatch(/predecessor\.semver[\s\S]*new\.semver/iu);
    expect(sql).toMatch(/successor\.predecessor_version_id\s*=\s*new\.id/iu);
    expect(sql).toContain("OBSERVATORY_SUCCESSOR_PROJECT_MISMATCH");
    expect(sql).toContain("OBSERVATORY_SUCCESSOR_SEMVER_REQUIRED");
    expect(sql).toContain("OBSERVATORY_SUCCESSOR_ORDER_INVALID");
    expect(sql).toMatch(/with recursive predecessor_chain/iu);
    expect(sql).toContain("protect_observatory_project_version_history");
    expect(sql).toMatch(/old\.status = 'released'[\s\S]*new\.status = 'archived'/iu);
    expect(sql).toMatch(/current_version\.status\s*=\s*'gate_ready'[\s\S]*target_status\s+in\s+\('active','released'\)/iu);
    expect(sql).not.toMatch(/current_version\.status\s*=\s*'gate_ready'[\s\S]{0,120}'cancelled'/iu);
    expect(sql).toMatch(/current_version\.is_backlog[\s\S]*OBSERVATORY_PROJECT_VERSION_BACKLOG_IMMUTABLE/iu);
    expect(sql).toMatch(/count\(\*\)[\s\S]*version_binding_kind = 'required'[\s\S]*state <> 'done'/iu);
    for (const gate of [
      "acceptance_summary",
      "dependencies_satisfied",
      "artifacts_accepted",
      "verification_complete",
      "roadmap_reconciled",
      "user_gate_decision_ref",
    ]) expect(sql).toContain(gate);
    expect(sql).not.toMatch(/update public\.observatory_project_versions[\s\S]{0,300}set status = 'released'/iu);
  });

  it("retires the current release target when that version is released or cancelled", async () => {
    const sql = await migration();
    const releaseTransition = sql.slice(
      sql.indexOf("create function public.transition_observatory_project_version"),
      sql.indexOf("-- Work Item RPCs"),
    );

    expect(releaseTransition).toMatch(
      /is_release_target\s*=\s*case when target_status in \('released','cancelled'\) then false else current_version\.is_release_target end/iu,
    );
  });

  it("serializes graph validation and binding against concurrent version mutations", async () => {
    const sql = await migration();
    expect(sql).toMatch(/create or replace function public\.lock_observatory_project_version_graph[\s\S]*pg_advisory_xact_lock\(20960902000300\)/iu);
    expect(sql).toMatch(/create trigger observatory_project_versions_lock_graph[\s\S]*before insert or update of project_key, semver, predecessor_version_id[\s\S]*for each statement[\s\S]*lock_observatory_project_version_graph/iu);
    const predecessorValidator = sql.slice(
      sql.indexOf("create or replace function public.validate_observatory_project_version_predecessor"),
      sql.indexOf("create trigger observatory_project_versions_validate_predecessor"),
    );
    expect(predecessorValidator).toMatch(/pg_advisory_xact_lock\(20960902000300\)/iu);
    expect(predecessorValidator).toMatch(/::numeric\[\]/iu);
    expect(predecessorValidator).not.toMatch(/::integer\[\]/iu);
    expect(predecessorValidator.indexOf("pg_advisory_xact_lock")).toBeLessThan(
      predecessorValidator.indexOf("new.predecessor_version_id"),
    );
    expect(sql).toMatch(
      /before insert or update of project_key, semver, predecessor_version_id[\s\S]*validate_observatory_project_version_predecessor/iu,
    );
    const versionUpdateRpc = sql.slice(
      sql.indexOf("create function public.update_observatory_project_version"),
      sql.indexOf("create function public.transition_observatory_project_version"),
    );
    expect(versionUpdateRpc).toContain("pg_advisory_xact_lock(20960902000300)");
    expect(versionUpdateRpc.indexOf("pg_advisory_xact_lock(20960902000300)")).toBeLessThan(
      versionUpdateRpc.indexOf("for update"),
    );

    const workItemValidator = sql.slice(
      sql.indexOf("create or replace function public.validate_observatory_work_item_project_version"),
      sql.indexOf("drop trigger if exists observatory_work_items_validate_project_version"),
    );
    expect(workItemValidator).toMatch(
      /from public\.observatory_project_versions where id = new\.project_version_id for key share/iu,
    );
    expect(workItemValidator.indexOf("for key share")).toBeLessThan(
      workItemValidator.indexOf("version_status in ('released', 'archived', 'cancelled')"),
    );
    expect(sql).toMatch(
      /create trigger observatory_work_items_validate_project_version before insert or update of state,[\s\S]*for each row execute function public\.validate_observatory_work_item_project_version/iu,
    );

    const releaseTransition = sql.slice(
      sql.indexOf("create function public.transition_observatory_project_version"),
      sql.indexOf("-- work item rpcs"),
    );
    expect(releaseTransition.indexOf("for update")).toBeLessThan(
      releaseTransition.indexOf("from public.observatory_work_items"),
    );
  });

  it("routes every gate-related transition and claim state mutation through the locked state trigger", async () => {
    const [core, claims] = await Promise.all([
      readFile(join(process.cwd(), "supabase/migrations/20260723000100_work_tracker_core.sql"), "utf8"),
      readFile(join(process.cwd(), "supabase/migrations/20260723000200_observatory_agent_claim_engine.sql"), "utf8"),
    ]);
    const stateMutationBody = (source: string, functionName: string) => source.slice(
      source.indexOf(`function public.${functionName}`),
      source.indexOf(`revoke all privileges on function public.${functionName}`),
    ).replace(/\s+/gu, " ");

    expect(stateMutationBody(core, "transition_observatory_work_item")).toMatch(
      /update public\.observatory_work_items set state = target_state/iu,
    );
    for (const claimRpc of [
      "sweep_observatory_work_item_claims",
      "claim_observatory_work_item",
      "release_observatory_work_item_claim",
      "complete_observatory_work_item_claim",
      "cancel_observatory_work_item_claim",
    ]) {
      expect(stateMutationBody(claims, claimRpc)).toMatch(
        /update public\.observatory_work_items set state = /iu,
      );
    }
  });

  it("defines the exact canonical checks including both release dates", async () => {
    const sql = await migration();
    expect(sql).toMatch(/set released_at = coalesce\(released_at, updated_at, created_at\) where status in \('released', 'archived'\) and released_at is null/iu);
    expect(sql.indexOf("set released_at = coalesce(released_at, updated_at, created_at)")).toBeLessThan(
      sql.indexOf("observatory_project_versions_release_timestamp_check"),
    );
    expect(sql).toMatch(/update public\.observatory_project_versions set actual_date = released_at::date where status in \('released', 'archived'\) and actual_date is null/iu);
    expect(sql.indexOf("set actual_date = released_at::date")).toBeLessThan(
      sql.indexOf("observatory_project_versions_release_timestamp_check"),
    );
    expect(sql).toMatch(/observatory_project_versions_status_check[\s\S]*status in \('planned', 'active', 'gate_ready', 'released', 'archived', 'cancelled'\)/iu);
    expect(sql).toMatch(/observatory_project_versions_semver_check[\s\S]*is_backlog and semver is null[\s\S]*not is_backlog[\s\S]*semver ~ /iu);
    expect(sql).toMatch(/observatory_project_versions_backlog_release_target_check[\s\S]*not \(is_backlog and is_release_target\)/iu);
    expect(sql).toMatch(/observatory_project_versions_release_timestamp_check[\s\S]*status not in \('released', 'archived'\)[\s\S]*released_at is not null[\s\S]*actual_date is not null/iu);
  });

  it("replaces only the two known v0 version constraints after verifying their exact definitions", async () => {
    const sql = await migration();
    const replacement = sql.slice(
      sql.indexOf("do $constraints$"),
      sql.indexOf("alter table public.observatory_project_versions\n  add constraint observatory_project_versions_status_check"),
    );

    expect(replacement).toContain("conname = 'observatory_project_versions_status_check'");
    expect(replacement).toContain("conname = 'observatory_project_versions_check'");
    expect(replacement).toContain("OBSERVATORY_PROJECT_VERSION_PRIOR_CONSTRAINT_MISMATCH");
    expect(replacement).toContain("alter table public.observatory_project_versions drop constraint observatory_project_versions_status_check");
    expect(replacement).toContain("alter table public.observatory_project_versions drop constraint observatory_project_versions_check");
    expect(replacement).not.toMatch(/for\s+constraint_name\s+in/iu);
    expect(replacement).not.toMatch(/like\s+'%status/iu);
    expect(replacement).not.toMatch(/execute\s+format/iu);
  });

  it("keeps compatibility overloads behind v1 defaults, audits snapshots, and blocks new bindings to terminal versions", async () => {
    const sql = await migration();
    for (const name of [
      "create_observatory_project_version",
      "update_observatory_project_version",
      "transition_observatory_project_version",
      "create_observatory_work_item",
      "update_observatory_work_item",
    ]) expect(sql).toContain(name);
    expect(sql).toMatch(/create function public\.create_observatory_project_version\( p_project_key text, p_version_label text, p_title text, p_description text, p_target_date date \)[\s\S]*return public\.create_observatory_project_version\([\s\S]*p_semver/iu);
    expect(sql).toMatch(/create function public\.update_observatory_project_version\( p_project_version_id uuid, p_expected_version integer, p_version_label text, p_title text, p_description text, p_target_date date \)[\s\S]*normalized_semver[\s\S]*return public\.update_observatory_project_version\([\s\S]*normalized_semver/iu);
    expect(sql).toMatch(/drop function if exists public\.transition_observatory_project_version\(/iu);
    expect(sql).toMatch(/jsonb_build_object\('before',\s*to_jsonb\(current_version\),\s*'after',\s*to_jsonb\(updated_version\)\)/iu);
    expect(sql).toMatch(/version_status in \('released', 'archived', 'cancelled'\)/iu);
    expect(sql).toMatch(/old\.project_version_id is distinct from new\.project_version_id|new\.project_version_id is distinct from old\.project_version_id/iu);
    expect(sql).toMatch(/drop trigger if exists observatory_work_items_validate_project_version/iu);
    expect(sql).toMatch(/update of[\s\S]{0,400}project_ref[\s\S]{0,200}project_key[\s\S]{0,200}project_version_id, version_binding_kind/iu);
    for (const signature of [
      "create_observatory_project_version(text,text,text,text,date)",
      "update_observatory_project_version(uuid,integer,text,text,text,date)",
      "create_observatory_work_item(text,text,text,text,text)",
      "create_observatory_work_item(text,text,text,text,text,text)",
      "create_observatory_work_item(text,text,text,text,text,uuid,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,integer,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid)",
    ]) {
      expect(sql).toContain(`revoke all privileges on function public.${signature} from public,anon,authenticated,service_role`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated`);
    }
    expect(sql).toMatch(/on conflict \(created_by, idempotency_key\) do nothing/iu);
    expect(sql).toContain("OBSERVATORY_PROJECT_CONTROL_BINDING_INVALID");
    expect(sql).toMatch(/security definer/iu);
    expect(sql).toMatch(/enable row level security/iu);
    expect(sql).toMatch(/grant execute[\s\S]*to authenticated/iu);
    for (const signature of [
      "create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)",
      "update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)",
      "transition_observatory_project_version(uuid,integer,text)",
      "create_observatory_work_item(text,text,text,text,text,uuid,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text)",
    ]) {
      expect(sql).toContain(`revoke all privileges on function public.${signature} from public,anon,authenticated,service_role`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated`);
    }
  });

  it("translates duplicate labels and SemVer without hiding portfolio conflicts", async () => {
    const sql = await migration();
    for (const body of [
      sql.slice(sql.indexOf("create function public.create_observatory_project_version"), sql.indexOf("create function public.update_observatory_project_version")),
      sql.slice(sql.indexOf("create function public.update_observatory_project_version"), sql.indexOf("create function public.transition_observatory_project_version")),
    ]) {
      expect(body).toMatch(/get stacked diagnostics[\s\S]*constraint_name/iu);
      expect(body).toContain("observatory_project_versions_project_label_idx");
      expect(body).toContain("observatory_project_versions_semver_idx");
      expect(body).toContain("OBSERVATORY_PROJECT_VERSION_DUPLICATE");
      expect(body).toContain("OBSERVATORY_PROJECT_VERSION_SEMVER_DUPLICATE");
      expect(body).toMatch(/else raise;/iu);
    }
  });

  it("rejects null expected versions in every v1 optimistic mutation RPC", async () => {
    const sql = await migration();
    const bodies = [
      sql.slice(sql.indexOf("create function public.update_observatory_project_version"), sql.indexOf("create function public.transition_observatory_project_version")),
      sql.slice(sql.indexOf("create function public.transition_observatory_project_version"), sql.indexOf("-- Work Item RPCs")),
      sql.slice(sql.indexOf("create function public.update_observatory_work_item"), sql.indexOf("revoke all privileges on function public.create_observatory_project_version")),
    ];

    expect(bodies[0]).toMatch(/if p_expected_version is null then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT'/iu);
    expect(bodies[1]).toMatch(/if p_expected_version is null then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT'/iu);
    expect(bodies[2]).toMatch(/if p_expected_version is null then raise exception 'OBSERVATORY_VERSION_CONFLICT'/iu);
  });

  it("preserves exact create idempotency after a version becomes terminal", async () => {
    const sql = await migration();
    const body = sql.slice(
      sql.indexOf("create function public.create_observatory_work_item"),
      sql.indexOf("create function public.update_observatory_work_item"),
    );
    const firstExistingLookup = body.indexOf("where created_by=calling_user and idempotency_key=btrim(p_idempotency_key)");
    const terminalRejection = body.indexOf("OBSERVATORY_PROJECT_VERSION_BINDING_CLOSED");
    const insert = body.indexOf("insert into public.observatory_work_items");

    expect(firstExistingLookup).toBeGreaterThan(0);
    expect(firstExistingLookup).toBeLessThan(terminalRejection);
    expect(firstExistingLookup).toBeLessThan(insert);
    expect(body).toMatch(/existing_item\.project_version_id is distinct from p_project_version_id/iu);
    expect(body).toContain("OBSERVATORY_IDEMPOTENCY_CONFLICT");
    expect(body).toMatch(/on conflict \(created_by, idempotency_key\) do nothing/iu);
    expect(body.indexOf("on conflict (created_by, idempotency_key) do nothing")).toBeLessThan(
      body.lastIndexOf("where created_by=calling_user and idempotency_key=btrim(p_idempotency_key)"),
    );
  });

  it("uses an explicit Work Item business-field whitelist for audit snapshots", async () => {
    const sql = await migration();
    const createBody = sql.slice(
      sql.indexOf("create function public.create_observatory_work_item"),
      sql.indexOf("create function public.update_observatory_work_item"),
    );
    const updateBody = sql.slice(
      sql.indexOf("create function public.update_observatory_work_item"),
      sql.indexOf("revoke all privileges on function public.create_observatory_project_version"),
    );
    const auditSql = `${createBody.slice(createBody.indexOf("insert into public.observatory_work_item_events"))}\n${updateBody.slice(updateBody.indexOf("insert into public.observatory_work_item_events"))}`;

    expect(auditSql).toContain("'version_binding_kind'");
    expect(auditSql).toContain("created_item.version_binding_kind");
    expect(auditSql).toContain("current_item.version_binding_kind");
    expect(auditSql).toContain("updated_item.version_binding_kind");
    expect(auditSql).not.toMatch(/to_jsonb\((?:created|current|updated)_item\)/iu);
    for (const forbidden of [
      "'idempotency_key'",
      "'agent_claim_enabled'",
      "'authorized_paths'",
      "'allowed_action_classes'",
      "'claim_approved_by'",
      "'claim_approved_at'",
    ]) expect(auditSql).not.toContain(forbidden);
  });

  it("freezes every Work Item scope field while its bound version is released or archived", async () => {
    const sql = await migration();
    expect(sql).toContain("OBSERVATORY_WORK_ITEM_VERSION_SCOPE_IMMUTABLE");
    expect(sql).toMatch(/bound_version_status\s+in\s+\('released',\s*'archived'\)/iu);
    for (const column of [
      "type",
      "title",
      "description",
      "acceptance_criteria",
      "priority",
      "owner_id",
      "assigned_agent_id",
      "project_ref",
      "milestone_ref",
      "project_key",
      "plan_revision",
      "stage_id",
      "work_package_id",
      "project_version_id",
      "version_binding_kind",
    ]) {
      expect(sql).toMatch(new RegExp(`new\\.${column}\\s+is distinct from\\s+old\\.${column}`, "iu"));
    }
    expect(sql).toMatch(
      /before insert or update of state, type, title, description, acceptance_criteria, priority, owner_id, assigned_agent_id, project_ref, milestone_ref, project_key, plan_revision, stage_id, work_package_id, project_version_id, version_binding_kind/iu,
    );
    expect(sql).not.toMatch(/new\.state is distinct from old\.state/iu);
  });
});
