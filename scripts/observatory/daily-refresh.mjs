#!/usr/bin/env node
// Deterministic command payload. The scheduler delivers stdout; no model or second notifier.
import { readFile, mkdir, writeFile, rename, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ObservatoryCollectionEnvelopeSchema } from "../../lib/observatory/collection-schema.ts";
import { acquireObservatoryRefreshLock } from "../../lib/observatory/refresh-files.ts";
import { computeObservatorySnapshotDigest } from "../../lib/observatory/collector.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = process.argv[2];
let stage = "configuration";
let release;
try {
  if (!configPath) throw new Error();
  const config = JSON.parse(await readFile(configPath, "utf8"));
  for (const key of ["stateDir", "envFile", "migrationStatePath", "registryPath", "workspaceRoot", "vaultRoot", "configPath", "projectExecutionPath", "projectControlPath", "projectionRepository", "mirrorPath"]) {
    if (typeof config[key] !== "string" || !config[key].startsWith("/")) throw new Error();
  }
  const migration = JSON.parse(await readFile(config.migrationStatePath, "utf8"));
  if (migration.schema !== "multi-agent-system-state-v1" || migration.phase !== "ACTIVE" || migration.active_host_id !== "home-mac-mini") throw new Error();
  const env = { ...process.env };
  const text = await readFile(config.envFile, "utf8");
  // Parse a dotenv file as data, never execute it as a shell script.
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^(?:export\s+)?([A-Z_][A-Z0-9_]*)=(.*)$/u);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"].includes(match[1])) env[match[1]] = value;
  }
  env.SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SECRET_KEY;
  env.OBSERVATORY_STATE_DIR = config.stateDir;
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error();
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const latest = async () => {
    const response = await fetch(`${url.origin}/rest/v1/observatory_snapshots?select=payload&status=eq.success&order=generated_at.desc&limit=1`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error();
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error();
    if (!rows.length) return null;
    const snapshot = ObservatoryCollectionEnvelopeSchema.parse(rows[0].payload);
    if (computeObservatorySnapshotDigest(snapshot) !== snapshot.source_digest) throw new Error();
    return snapshot;
  };
  await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  const lock = await acquireObservatoryRefreshLock(resolve(config.stateDir, "daily.lock"));
  if (!lock.acquired) { process.stdout.write("Dashboard 更新跳过：另一轮更新仍在运行。\n"); process.exit(0); }
  release = lock.release;
  stage = "baseline";
  const baselinePath = resolve(config.stateDir, "observatory-snapshot.json");
  const baseline = await latest();
  if (baseline) {
    await writeFile(`${baselinePath}.tmp`, JSON.stringify(baseline), { mode: 0o600 });
    await rename(`${baselinePath}.tmp`, baselinePath);
  }
  stage = "projections";
  // Read released main, never the branch currently checked out in another owner's workspace.
  const projectionDir = resolve(config.stateDir, "released-projections");
  await mkdir(projectionDir, { recursive: true, mode: 0o700 });
  const revision = spawnSync("git", ["rev-parse", "main"], { cwd: config.projectionRepository, encoding: "utf8" });
  if (revision.status !== 0 || !/^[a-f0-9]{40}\s*$/u.test(revision.stdout)) throw new Error();
  for (const file of ["agent-endpoints.yaml", "execution-flows.yaml", "functional-roles.yaml", "orchestration-policy.yaml", "project-registry.yaml", "scene-registry.yaml"]) {
    const result = spawnSync("git", ["show", `${revision.stdout.trim()}:runtime-control/${file}`], { cwd: config.projectionRepository, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    if (result.status !== 0) throw new Error();
    await writeFile(resolve(projectionDir, file), result.stdout, { mode: 0o600 });
  }
  stage = "refresh";
  const reportPath = resolve(config.stateDir, "latest-refresh-report.txt");
  const started = Date.now();
  const child = spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/observatory/refresh.ts", config.registryPath, config.workspaceRoot, config.vaultRoot, config.configPath, config.projectExecutionPath, config.projectControlPath, projectionDir, config.mirrorPath], { cwd: root, env, encoding: "utf8", timeout: 23 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  if (child.status !== 0 || !child.stdout.includes("OBSERVATORY_REFRESH_OK")) throw new Error();
  stage = "readback";
  const current = JSON.parse(await readFile(baselinePath, "utf8"));
  const published = await latest();
  if (!published || published.source_digest !== current.source_digest || (await stat(reportPath)).mtimeMs < started) throw new Error();
  process.stdout.write(await readFile(reportPath, "utf8"));
} catch {
  process.stdout.write(`Dashboard 每日更新失败\n阶段：${stage}\n本次未确认更新成功，变更数量未知；页面保留最近有效快照。\n下一次将按日程重试。\n`);
  process.exitCode = 1;
} finally { await release?.(); }
