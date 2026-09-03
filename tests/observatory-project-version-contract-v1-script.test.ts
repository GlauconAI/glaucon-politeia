import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertLocalProjectVersionApplyTarget,
  assertProjectVersionPreflightAllowsApply,
  formatProjectVersionVerifierError,
  parseProjectVersionVerifierArgs,
  readProjectVersionContractPreflight,
  readProjectVersionContractStatus,
  runProjectVersionContractVerifier,
  verifyProjectVersionContractSource,
} from "@/scripts/observatory/verify-project-version-contract-v1";

function normalizedSignatures(source: string, start: string, end: string) {
  const body = source.slice(source.indexOf(start) + start.length, source.indexOf(end));
  return [...body.matchAll(/'public\.([^']+)'/gu)]
    .map((match) => match[1].replace(/\s+/gu, ""))
    .sort();
}

describe("Project Version contract v1 verifier", () => {
  it("defaults to offline source verification and requires explicit apply intent", () => {
    expect(parseProjectVersionVerifierArgs([])).toEqual({ mode: "source" });
    expect(parseProjectVersionVerifierArgs(["--mode", "preflight"])).toEqual({ mode: "preflight" });
    expect(parseProjectVersionVerifierArgs(["--mode", "status"])).toEqual({ mode: "status" });
    expect(() => parseProjectVersionVerifierArgs(["--mode", "concurrency"])).toThrow(/--confirm-local-concurrency/u);
    expect(parseProjectVersionVerifierArgs(["--mode", "concurrency", "--confirm-local-concurrency"])).toEqual({
      mode: "concurrency",
      confirmLocalConcurrency: true,
    });
    expect(() => parseProjectVersionVerifierArgs(["--mode", "apply"])).toThrow(/--confirm-local-apply/u);
    expect(parseProjectVersionVerifierArgs(["--mode", "apply", "--confirm-local-apply"])).toEqual({
      mode: "apply",
      confirmLocalApply: true,
    });
  });

  it("runs a catalog-aware read-only preflight and separates blocking issues from legacy warnings", async () => {
    const statements: string[] = [];
    const results = [
      [{ versions_table: true, work_items_table: true, project_version_id: true,
        predecessor_version_id: false, is_release_target: false, is_backlog: true, semver: false }],
      [{ missing_binding_count: 2 }],
      [{ multiple_execution_project_count: 1 }],
      [{ legacy_non_semver_label_count: 3 }],
      [{ normalized_semver_collision_count: 4 }],
    ];
    const client = {
      unsafe: async (statement: string) => {
        statements.push(statement);
        return results.shift() ?? [];
      },
    };

    await expect(readProjectVersionContractPreflight(client)).resolves.toEqual({
      mode: "preflight",
      ok: false,
      blockingIssueCount: 7,
      warningCount: 3,
      blocking: {
        missingBindings: 2,
        multipleExecutionProjects: 1,
        normalizedSemverCollisions: 4,
        predecessorSelfReferences: 0,
        predecessorMissingTargets: 0,
        predecessorCrossProjectReferences: 0,
        predecessorNonCanonicalSemverReferences: 0,
        predecessorNonIncreasingReferences: 0,
        predecessorCycles: 0,
        duplicateReleaseTargetProjects: 0,
      },
      warnings: { legacyNonSemverLabels: 3 },
    });
    expect(statements).toHaveLength(5);
    expect(statements.join("\n")).not.toMatch(/\b(insert|update|delete|alter|create|drop|truncate)\b/iu);
    expect(statements.join("\n")).toMatch(/normalized_semver_collision_count[\s\S]*having count\(\*\) > 1/iu);
    expect(statements.slice(1).join("\n")).not.toContain("predecessor_version_id = version.id");
    expect(statements.slice(1).join("\n")).not.toContain("is_release_target");
  });

  it("preflight tolerates missing v1 tables and columns while returning all zero counts", async () => {
    const results = [[{
      versions_table: false,
      work_items_table: false,
      project_version_id: false,
      predecessor_version_id: false,
      is_release_target: false,
      is_backlog: false,
      semver: false,
    }]];
    const client = { unsafe: async () => results.shift() ?? [] };
    await expect(readProjectVersionContractPreflight(client)).resolves.toMatchObject({
      mode: "preflight",
      ok: true,
      blockingIssueCount: 0,
      warningCount: 0,
      blocking: {
        missingBindings: 0,
        multipleExecutionProjects: 0,
        normalizedSemverCollisions: 0,
        predecessorSelfReferences: 0,
        predecessorMissingTargets: 0,
        predecessorCrossProjectReferences: 0,
        predecessorNonCanonicalSemverReferences: 0,
        predecessorNonIncreasingReferences: 0,
        predecessorCycles: 0,
        duplicateReleaseTargetProjects: 0,
      },
      warnings: { legacyNonSemverLabels: 0 },
    });
  });

  it("reports predecessor and release-target issues when v1 columns are present", async () => {
    const results = [
      [{ versions_table: true, work_items_table: false, project_version_id: false,
        predecessor_version_id: true, is_release_target: true, is_backlog: true, semver: true }],
      [{ multiple_execution_project_count: 0 }],
      [{ legacy_non_semver_label_count: 7 }],
      [{ normalized_semver_collision_count: 3 }],
      [{ predecessor_self_count: 4, predecessor_missing_target_count: 2,
        predecessor_cross_project_count: 5, predecessor_non_canonical_semver_count: 9,
        predecessor_non_increasing_count: 6 }],
      [{ predecessor_cycle_count: 8 }],
      [{ duplicate_release_target_project_count: 6 }],
    ];
    const client = { unsafe: async () => results.shift() ?? [] };
    await expect(readProjectVersionContractPreflight(client)).resolves.toMatchObject({
      ok: false,
      blockingIssueCount: 43,
      warningCount: 7,
      blocking: {
        normalizedSemverCollisions: 3,
        predecessorSelfReferences: 4,
        predecessorMissingTargets: 2,
        predecessorCrossProjectReferences: 5,
        predecessorNonCanonicalSemverReferences: 9,
        predecessorNonIncreasingReferences: 6,
        predecessorCycles: 8,
        duplicateReleaseTargetProjects: 6,
      },
      warnings: { legacyNonSemverLabels: 7 },
    });
    expect(results).toHaveLength(0);
  });

  it("allows legacy non-SemVer warnings but refuses apply on every blocking preflight issue", () => {
    expect(() => assertProjectVersionPreflightAllowsApply({
      mode: "preflight", ok: true, blockingIssueCount: 0, warningCount: 2,
      blocking: {
        missingBindings: 0, multipleExecutionProjects: 0, normalizedSemverCollisions: 0,
        predecessorSelfReferences: 0, predecessorMissingTargets: 0,
        predecessorCrossProjectReferences: 0, predecessorNonIncreasingReferences: 0,
        predecessorNonCanonicalSemverReferences: 0,
        predecessorCycles: 0, duplicateReleaseTargetProjects: 0,
      },
      warnings: { legacyNonSemverLabels: 2 },
    })).not.toThrow();
    expect(() => assertProjectVersionPreflightAllowsApply({
      mode: "preflight", ok: false, blockingIssueCount: 1, warningCount: 0,
      blocking: {
        missingBindings: 0, multipleExecutionProjects: 0, normalizedSemverCollisions: 1,
        predecessorSelfReferences: 0, predecessorMissingTargets: 0,
        predecessorCrossProjectReferences: 0, predecessorNonIncreasingReferences: 0,
        predecessorNonCanonicalSemverReferences: 0,
        predecessorCycles: 0, duplicateReleaseTargetProjects: 0,
      },
      warnings: { legacyNonSemverLabels: 0 },
    })).toThrow(/preflight blocked apply[\s\S]*normalizedSemverCollisions/u);
  });

  it("fails preflight safely when database configuration is absent", async () => {
    const databaseUrl = process.env.OBSERVATORY_DATABASE_URL;
    const localDatabaseUrl = process.env.OBSERVATORY_LOCAL_DB_URL;
    delete process.env.OBSERVATORY_DATABASE_URL;
    delete process.env.OBSERVATORY_LOCAL_DB_URL;
    try {
      await expect(runProjectVersionContractVerifier({ mode: "preflight" })).rejects.toThrow(
        /^Database preflight mode requires OBSERVATORY_DATABASE_URL or OBSERVATORY_LOCAL_DB_URL\.$/u,
      );
    } finally {
      if (databaseUrl === undefined) delete process.env.OBSERVATORY_DATABASE_URL;
      else process.env.OBSERVATORY_DATABASE_URL = databaseUrl;
      if (localDatabaseUrl === undefined) delete process.env.OBSERVATORY_LOCAL_DB_URL;
      else process.env.OBSERVATORY_LOCAL_DB_URL = localDatabaseUrl;
    }
  });

  it("fails safely on unknown options or non-loopback apply targets", () => {
    expect(() => parseProjectVersionVerifierArgs(["--wat"])).toThrow(/unknown/u);
    expect(() => assertLocalProjectVersionApplyTarget("postgresql://example.com/db")).toThrow(/loopback/u);
  });

  it("redacts database URLs from failure output", () => {
    const output = formatProjectVersionVerifierError(
      new Error("connect failed: postgresql://operator:sensitive@example.com/db"),
    );
    expect(output).toContain("[DATABASE_URL_REDACTED]");
    expect(output).not.toContain("sensitive");
    expect(output).not.toContain("operator");
  });

  it("validates structural source semantics without database credentials", async () => {
    const result = await verifyProjectVersionContractSource();
    expect(result.mode).toBe("source");
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      "transaction boundary",
      "schema contract",
      "preflight guards",
      "lifecycle and release gates",
      "terminal work item scope",
      "security and audit",
      "rollback guidance",
    ]));
    expect(result.rollbackGuidance).toMatch(/forward-only[\s\S]*keep the current application[\s\S]*corrective compatibility migration[\s\S]*before application rollback/iu);
    expect(result.rollbackGuidance).toMatch(/never drop the schema[\s\S]*rewrite migration history/iu);
  });

  it("reports a bounded source failure without exposing source contents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "version-contract-source-"));
    const path = join(directory, "bad.sql");
    await writeFile(path, "begin; commit;\n", "utf8");
    await expect(verifyProjectVersionContractSource(path)).rejects.toThrow(
      /schema contract/u,
    );
  });

  it("source verification rejects weakened concurrency and constraint contracts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "version-contract-weakened-"));
    const source = await readFile(
      join(process.cwd(), "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql"),
      "utf8",
    );
    const weakenedCases = [
      source.replace("for each statement execute function public.lock_observatory_project_version_graph();", "for each statement execute function public.validate_observatory_project_version_predecessor();"),
      source.replace("before insert or update of state,", "before insert or update of"),
      source.replace("perform pg_catalog.pg_advisory_xact_lock(20960902000300);", "perform true;"),
      source.replace("(released_at is not null and actual_date is not null)", "released_at is not null"),
      source.replace("if p_expected_version is null then raise exception 'OBSERVATORY_PROJECT_VERSION_CONFLICT' using errcode='40001'; end if;", ""),
      source.replace("existing_item.project_version_id is distinct from p_project_version_id", "existing_item.project_version_id is distinct from selected_version.id"),
      source.replace("'version_binding_kind',created_item.version_binding_kind", "'idempotency_key',created_item.idempotency_key"),
      source.replace("conname = 'observatory_project_versions_check'", "conname like '%status%released_at%'"),
    ];
    for (const [index, weakened] of weakenedCases.entries()) {
      const path = join(directory, `weakened-${index}.sql`);
      await writeFile(path, weakened, "utf8");
      await expect(verifyProjectVersionContractSource(path)).rejects.toThrow(/Source verification failed/u);
    }
  });

  it("checks database constraints, all bounded RPCs, exact security, and recursive predecessor integrity", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/observatory/verify-project-version-contract-v1.ts"),
      "utf8",
    );
    expect(source).toContain("observatory_project_versions_status_check");
    expect(source).toContain("observatory_project_versions_backlog_release_target_check");
    expect(source).toContain("observatory_work_items_version_binding_kind_check");
    expect(source).toMatch(/pg_get_constraintdef\(constraint_catalog\.oid\)[\s\S]*observatory_project_versions_semver_check/iu);
    expect(source).toMatch(/observatory_project_versions_release_timestamp_check[\s\S]*released_at[\s\S]*actual_date/iu);
    expect(source).toMatch(/tgname='observatory_work_items_validate_project_version'[\s\S]*tgenabled in \('O','A'\)[\s\S]*validate_observatory_work_item_project_version/iu);
    expect(source).toMatch(/as graph_lock_trigger[\s\S]*as graph_lock_function[\s\S]*as work_item_validator_lock[\s\S]*as version_update_lock_order[\s\S]*as version_transition_lock_order[\s\S]*as predecessor_validator_lock/iu);
    expect(source).toMatch(/pg_get_triggerdef[\s\S]*observatory_project_versions_lock_graph/iu);
    expect(source).toMatch(/pg_get_functiondef[\s\S]*pg_advisory_xact_lock[\s\S]*for key share/iu);
    for (const rpc of [
      "create_observatory_project_version",
      "ensure_observatory_project_backlog_versions",
      "update_observatory_project_version",
      "transition_observatory_project_version",
      "create_observatory_work_item",
      "update_observatory_work_item",
    ]) expect(source).toContain(rpc);
    expect(source).toMatch(/observatory_project_version_events[\s\S]*relrowsecurity/iu);
    expect(source).toMatch(/with recursive predecessor_chain/iu);
    expect(source).toMatch(/table_acl_expectations[\s\S]*'public'[\s\S]*'anon'[\s\S]*'authenticated'[\s\S]*'service_role'/iu);
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      expect(source).toContain(`'${privilege}'`);
    }
    expect(source).toMatch(/policy_expectations[\s\S]*observatory_project_versions_select_admin[\s\S]*observatory_project_version_events_select_admin/iu);
    expect(source).toMatch(/polcmd<>'r'[\s\S]*is_current_user_admin\(\)[\s\S]*polwithcheck is not null/iu);
    for (const signature of [
      "create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)",
      "ensure_observatory_project_backlog_versions(text[])",
      "update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)",
      "transition_observatory_project_version(uuid,integer,text)",
      "create_observatory_work_item(text,text,text,text,text,uuid,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text)",
    ]) {
      expect(source).toContain(`public.${signature}`);
    }
    expect(source).toMatch(/rpc_acl_expectations[\s\S]*'public'[\s\S]*'anon'[\s\S]*'authenticated'[\s\S]*'service_role'/iu);
    expect(source).toMatch(/prosecdef[\s\S]*search_path=pg_catalog[\s\S]*administrator access required/iu);
    expect(source).toMatch(/not exists\(select 1 from superseded_rpc_signatures where to_regprocedure\(signature\) is not null\)/iu);
    expect(source).toMatch(/options\.mode === "apply"[\s\S]*readProjectVersionContractPreflight\(preflightClient\)[\s\S]*assertProjectVersionPreflightAllowsApply\(preflight\)[\s\S]*applyMigration\(sql\)/u);
    expect(source).not.toContain('argument === "--database-url"');
    expect(source).toMatch(/options\.mode === "concurrency"[\s\S]*OBSERVATORY_LOCAL_DB_URL[\s\S]*assertLocalProjectVersionApplyTarget[\s\S]*exerciseProjectVersionReleaseConcurrency/iu);
  });

  it.each([
    "graph_lock_trigger",
    "graph_lock_function",
    "work_item_validator_lock",
    "version_update_lock_order",
    "version_transition_lock_order",
    "predecessor_validator_lock",
    "table_acls_exact",
    "admin_select_policies_exact",
    "rpc_acls_exact",
    "admin_rpc_definitions_exact",
  ])("fails database status when %s is weakened or missing", async (failedCheck) => {
    const sql = (() => Promise.resolve([{ [failedCheck]: false }])) as never;
    await expect(readProjectVersionContractStatus(sql)).rejects.toThrow(
      new RegExp(`Database status verification failed: ${failedCheck}`, "u"),
    );
  });

  it("keeps exact disjoint current and superseded RPC inventories covering every migration drop", async () => {
    const [verifierSource, migrationSource] = await Promise.all([
      readFile(join(process.cwd(), "scripts/observatory/verify-project-version-contract-v1.ts"), "utf8"),
      readFile(join(process.cwd(), "supabase/migrations/20260902000300_work_tracker_project_version_contract_v1.sql"), "utf8"),
    ]);
    const current = normalizedSignatures(
      verifierSource,
      "bounded_rpc_signatures(signature) as (values",
      "), superseded_rpc_signatures(signature) as (values",
    );
    const superseded = normalizedSignatures(
      verifierSource,
      "superseded_rpc_signatures(signature) as (values",
      "), resolved_bounded_rpcs as (",
    );

    expect(current).toEqual([
      "create_observatory_project_version(text,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)",
      "create_observatory_work_item(text,text,text,text,text,uuid,text,text)",
      "ensure_observatory_project_backlog_versions(text[])",
      "transition_observatory_project_version(uuid,integer,text)",
      "update_observatory_project_version(uuid,integer,text,text,text,text,date,boolean,text,uuid,text,text,text,date,text,boolean,boolean,boolean,boolean,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid,text)",
    ].sort());
    expect(superseded).toEqual([
      "create_observatory_project_version(text,text,text,text,date)",
      "create_observatory_work_item(text,text,text,text,text)",
      "create_observatory_work_item(text,text,text,text,text,text)",
      "create_observatory_work_item(text,text,text,text,text,uuid,text)",
      "update_observatory_project_version(uuid,integer,text,text,text,date)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,integer,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text)",
      "update_observatory_work_item(uuid,integer,text,text,text,text,text,uuid,text,text,text,text,integer,text,text,uuid)",
    ].sort());
    expect(current.filter((signature) => superseded.includes(signature))).toEqual([]);

    const represented = new Set([...current, ...superseded]);
    const dropped = [...migrationSource.matchAll(/drop function if exists public\.([^;]+);/giu)]
      .map((match) => match[1].replace(/\s+/gu, ""));
    expect(dropped.filter((signature) => !represented.has(signature))).toEqual([]);
  });
});
