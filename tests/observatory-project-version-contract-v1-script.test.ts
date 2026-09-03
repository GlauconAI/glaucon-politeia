import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertLocalProjectVersionApplyTarget,
  formatProjectVersionVerifierError,
  parseProjectVersionVerifierArgs,
  readProjectVersionContractPreflight,
  runProjectVersionContractVerifier,
  verifyProjectVersionContractSource,
} from "@/scripts/observatory/verify-project-version-contract-v1";

describe("Project Version contract v1 verifier", () => {
  it("defaults to offline source verification and requires explicit apply intent", () => {
    expect(parseProjectVersionVerifierArgs([])).toEqual({ mode: "source" });
    expect(parseProjectVersionVerifierArgs(["--mode", "preflight"])).toEqual({ mode: "preflight" });
    expect(parseProjectVersionVerifierArgs(["--mode", "status"])).toEqual({ mode: "status" });
    expect(() => parseProjectVersionVerifierArgs(["--mode", "apply"])).toThrow(/--confirm-local-apply/u);
    expect(parseProjectVersionVerifierArgs(["--mode", "apply", "--confirm-local-apply"])).toEqual({
      mode: "apply",
      confirmLocalApply: true,
    });
  });

  it("runs a catalog-aware read-only preflight and reports every issue count", async () => {
    const statements: string[] = [];
    const results = [
      [{ versions_table: true, work_items_table: true, project_version_id: true,
        predecessor_version_id: false, is_release_target: false, is_backlog: true }],
      [{ missing_binding_count: 2 }],
      [{ multiple_execution_project_count: 1 }],
      [{ invalid_formal_label_count: 3 }],
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
      counts: {
        missingBindings: 2,
        multipleExecutionProjects: 1,
        invalidFormalLabels: 3,
        predecessorSelfReferences: 0,
        predecessorCrossProjectReferences: 0,
        duplicateReleaseTargetProjects: 0,
      },
    });
    expect(statements).toHaveLength(4);
    expect(statements.join("\n")).not.toMatch(/\b(insert|update|delete|alter|create|drop|truncate)\b/iu);
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
    }]];
    const client = { unsafe: async () => results.shift() ?? [] };
    await expect(readProjectVersionContractPreflight(client)).resolves.toMatchObject({
      mode: "preflight",
      ok: true,
      counts: {
        missingBindings: 0,
        multipleExecutionProjects: 0,
        invalidFormalLabels: 0,
        predecessorSelfReferences: 0,
        predecessorCrossProjectReferences: 0,
        duplicateReleaseTargetProjects: 0,
      },
    });
  });

  it("reports predecessor and release-target issues when v1 columns are present", async () => {
    const results = [
      [{ versions_table: true, work_items_table: false, project_version_id: false,
        predecessor_version_id: true, is_release_target: true, is_backlog: true }],
      [{ multiple_execution_project_count: 0 }],
      [{ invalid_formal_label_count: 0 }],
      [{ predecessor_self_count: 4, predecessor_cross_project_count: 5 }],
      [{ duplicate_release_target_project_count: 6 }],
    ];
    const client = { unsafe: async () => results.shift() ?? [] };
    await expect(readProjectVersionContractPreflight(client)).resolves.toMatchObject({
      ok: false,
      counts: {
        predecessorSelfReferences: 4,
        predecessorCrossProjectReferences: 5,
        duplicateReleaseTargetProjects: 6,
      },
    });
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
    expect(result.rollbackGuidance).toMatch(/forward-only[\s\S]*no destructive schema drop/iu);
  });

  it("reports a bounded source failure without exposing source contents", async () => {
    const directory = await mkdtemp(join(tmpdir(), "version-contract-source-"));
    const path = join(directory, "bad.sql");
    await writeFile(path, "begin; commit;\n", "utf8");
    await expect(verifyProjectVersionContractSource(path)).rejects.toThrow(
      /schema contract/u,
    );
  });

  it("checks database constraints, all bounded RPCs, exact security, and recursive predecessor integrity", async () => {
    const source = await readFile(
      join(process.cwd(), "scripts/observatory/verify-project-version-contract-v1.ts"),
      "utf8",
    );
    expect(source).toContain("observatory_project_versions_status_check");
    expect(source).toContain("observatory_work_items_version_binding_kind_check");
    for (const rpc of [
      "create_observatory_project_version",
      "update_observatory_project_version",
      "transition_observatory_project_version",
      "create_observatory_work_item",
      "update_observatory_work_item",
    ]) expect(source).toContain(rpc);
    expect(source).toMatch(/observatory_project_version_events[\s\S]*relrowsecurity/iu);
    expect(source).toMatch(/with recursive predecessor_chain/iu);
    expect(source).toMatch(/not has_table_privilege\('anon'/iu);
    expect(source).not.toContain('argument === "--database-url"');
  });
});
