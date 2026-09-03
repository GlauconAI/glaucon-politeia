import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertLocalProjectVersionApplyTarget,
  formatProjectVersionVerifierError,
  parseProjectVersionVerifierArgs,
  verifyProjectVersionContractSource,
} from "@/scripts/observatory/verify-project-version-contract-v1";

describe("Project Version contract v1 verifier", () => {
  it("defaults to offline source verification and requires explicit apply intent", () => {
    expect(parseProjectVersionVerifierArgs([])).toEqual({ mode: "source" });
    expect(parseProjectVersionVerifierArgs(["--mode", "status"])).toEqual({ mode: "status" });
    expect(() => parseProjectVersionVerifierArgs(["--mode", "apply"])).toThrow(/--confirm-local-apply/u);
    expect(parseProjectVersionVerifierArgs(["--mode", "apply", "--confirm-local-apply"])).toEqual({
      mode: "apply",
      confirmLocalApply: true,
    });
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
