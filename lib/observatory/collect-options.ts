export interface ObservatoryCollectOptions {
  registryPath: string;
  outputPath?: string;
  systemRoots: {
    workspaceRoot: string;
    vaultRoot: string;
    configPath?: string;
  } | null;
}

export function parseObservatoryCollectOptions(
  argv: readonly string[],
): ObservatoryCollectOptions {
  const [registryPath, outputPath, ...flags] = argv;
  if (!registryPath) {
    throw new Error(
      "Usage: observatory:collect <registry-path> [output-path] [--workspace-root PATH --vault-root PATH [--config-path PATH]]",
    );
  }
  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (
      !flag ||
      !["--workspace-root", "--vault-root", "--config-path"].includes(flag)
    ) {
      throw new Error(`Unknown System Observatory collection option: ${flag ?? "missing"}.`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}.`);
    }
    values.set(flag, value);
  }
  const workspaceRoot = values.get("--workspace-root");
  const vaultRoot = values.get("--vault-root");
  if (Boolean(workspaceRoot) !== Boolean(vaultRoot)) {
    throw new Error(
      "System Observatory v2 requires both --workspace-root and --vault-root.",
    );
  }
  return {
    registryPath,
    ...(outputPath ? { outputPath } : {}),
    systemRoots:
      workspaceRoot && vaultRoot
        ? {
            workspaceRoot,
            vaultRoot,
            ...(values.get("--config-path")
              ? { configPath: values.get("--config-path") }
              : {}),
          }
        : null,
  };
}
