import { describe, expect, it } from "vitest";

import { scanObservatoryPrivacy } from "@/lib/observatory/privacy-scan";

describe("scanObservatoryPrivacy", () => {
  it("returns zero category counts for safe logical metadata", () => {
    expect(
      scanObservatoryPrivacy({
        id: "skill:plato:example",
        kind: "skill",
        source: { logical_reference: "workspace:plato/skills/example" },
        labels: [{ key: "state", value: "eligible" }],
      }),
    ).toEqual({
      absolute_or_private_path: 0,
      browser_data: 0,
      config_or_payload_data: 0,
      email: 0,
      raw_content: 0,
      secret_key: 0,
      secret_value: 0,
      session_data: 0,
    });
  });

  it("counts dangerous categories without returning their values", () => {
    const forbidden = "sensitive@example.com";
    const result = scanObservatoryPrivacy({
      api_token: "Bearer abcdefghijklmnopqrstuvwxyz",
      message: forbidden,
      cookie: "browser-secret",
      path: "/Users/private/.openclaw/config.json",
      sessionKey: "agent:plato:main",
    });

    expect(Object.values(result).some((count) => count > 0)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(forbidden);
    expect(Object.values(result).every(Number.isSafeInteger)).toBe(true);
  });
});
