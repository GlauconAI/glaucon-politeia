import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

interface LocalSupabaseConfig {
  API_URL?: string;
  SERVICE_ROLE_KEY?: string;
}

function spawnBounded(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 64 * 1024) child.kill("SIGTERM");
      else chunks.push(chunk);
    });
    child.once("error", rejectResult);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (bytes > 64 * 1024) {
        rejectResult(new Error("Bounded output limit exceeded."));
        return;
      }
      resolveResult({
        code: code ?? -1,
        stdout: Buffer.concat(chunks).toString("utf8"),
      });
    });
  });
}

async function localConfig(): Promise<LocalSupabaseConfig> {
  const result = await spawnBounded(
    "supabase",
    ["status", "-o", "json"],
    process.env,
    30_000,
  );
  if (result.code !== 0) throw new Error("Local Supabase is unavailable.");
  return JSON.parse(result.stdout) as LocalSupabaseConfig;
}

async function unlinkIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const [
    registryPath,
    workspaceRoot,
    vaultRoot,
    configPath,
    projectExecutionPath,
  ] = process.argv.slice(2);
  if (
    !registryPath ||
    !workspaceRoot ||
    !vaultRoot ||
    !configPath ||
    !projectExecutionPath
  ) {
    throw new Error("Missing local refresh verification roots.");
  }
  const local = await localConfig();
  if (
    local.API_URL !== "http://127.0.0.1:54321" ||
    typeof local.SERVICE_ROLE_KEY !== "string" ||
    local.SERVICE_ROLE_KEY.length < 32
  ) {
    throw new Error("Refusing a non-loopback or incomplete Supabase target.");
  }
  await unlinkIfPresent(resolve(".observatory/refresh-state.json"));
  await unlinkIfPresent(resolve(".observatory/refresh.lock"));
  const environment = {
    ...process.env,
    SUPABASE_URL: local.API_URL,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  };
  const refreshScript = resolve("scripts/observatory/refresh.ts");
  const commonArgs = [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    refreshScript,
  ];
  const missing = resolve(".observatory/missing-registry.html");
  const failureOutputs: string[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await spawnBounded(
      process.execPath,
      [
        commonArgs[0],
        commonArgs[1],
        missing,
        workspaceRoot,
        vaultRoot,
        configPath,
        projectExecutionPath,
      ],
      environment,
      30_000,
    );
    if (result.code === 0) throw new Error("Failure drill unexpectedly succeeded.");
    failureOutputs.push(result.stdout);
  }
  const recovered = await spawnBounded(
    process.execPath,
    [
      commonArgs[0],
      commonArgs[1],
      registryPath,
      workspaceRoot,
      vaultRoot,
      configPath,
      projectExecutionPath,
    ],
    environment,
    6 * 60 * 1000,
  );
  const checks = {
    first_two_failures_quiet:
      !failureOutputs[0]?.includes("OBSERVATORY_REFRESH_FAILURE") &&
      !failureOutputs[1]?.includes("OBSERVATORY_REFRESH_FAILURE"),
    third_failure_notified:
      failureOutputs[2]?.includes("OBSERVATORY_REFRESH_FAILURE") === true,
    recovery_notified:
      recovered.code === 0 &&
      recovered.stdout.includes("OBSERVATORY_REFRESH_RECOVERY") &&
      recovered.stdout.includes("OBSERVATORY_REFRESH_OK"),
  };
  process.stdout.write(`${JSON.stringify({ status: "pass", checks }, null, 2)}\n`);
  if (Object.values(checks).some((passed) => !passed)) process.exitCode = 1;
}

main().catch(() => {
  process.stderr.write(
    "OBSERVATORY_LOCAL_REFRESH_VERIFY_FAILED: Local refresh verification failed.\n",
  );
  process.exitCode = 1;
});
