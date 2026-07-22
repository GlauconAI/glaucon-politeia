import { describe, expect, it } from "vitest";

import { parseObservatoryCollectOptions } from "@/lib/observatory/collect-options";

describe("parseObservatoryCollectOptions", () => {
  it("keeps the legacy positional v1 command", () => {
    expect(parseObservatoryCollectOptions(["registry.html", "snapshot.json"])).toEqual({
      registryPath: "registry.html",
      outputPath: "snapshot.json",
      systemRoots: null,
    });
  });

  it("requires both explicit roots for v2 and accepts an optional config path", () => {
    expect(
      parseObservatoryCollectOptions([
        "registry.html",
        "snapshot.json",
        "--workspace-root",
        "/explicit/workspace",
        "--vault-root",
        "/explicit/vault",
        "--config-path",
        "/explicit/openclaw.json",
      ]),
    ).toEqual({
      registryPath: "registry.html",
      outputPath: "snapshot.json",
      systemRoots: {
        workspaceRoot: "/explicit/workspace",
        vaultRoot: "/explicit/vault",
        configPath: "/explicit/openclaw.json",
      },
    });
    expect(() =>
      parseObservatoryCollectOptions([
        "registry.html",
        "snapshot.json",
        "--workspace-root",
        "/explicit/workspace",
      ]),
    ).toThrow(/both/u);
  });

  it("rejects missing registry and unknown flags", () => {
    expect(() => parseObservatoryCollectOptions([])).toThrow(/Usage/u);
    expect(() =>
      parseObservatoryCollectOptions(["registry.html", "snapshot.json", "--secret", "x"]),
    ).toThrow(/Unknown/u);
  });
});
