import { describe, expect, it } from "vitest";

import {
  OBSERVATORY_ASSET_KINDS,
  ObservatoryAssetInventorySchema,
} from "@/lib/observatory/asset-schema";

const asset = {
  id: "skill:plato:ai-intel-weekly-brief",
  kind: "skill",
  name: "ai-intel-weekly-brief",
  owner: "plato",
  authority: "declared",
  source: "workspace/plato/skills/ai-intel-weekly-brief/SKILL.md",
  collected_at: "2026-07-22T22:00:00.000Z",
  freshness: "fresh",
  health: "healthy",
  summary: "Ready",
  labels: [{ key: "eligibility", value: "ready" }],
} as const;

describe("ObservatoryAssetInventorySchema", () => {
  it("supports every approved System Observatory asset kind", () => {
    expect(OBSERVATORY_ASSET_KINDS).toEqual([
      "skill",
      "tool",
      "profile",
      "rule",
      "config",
      "knowledge",
      "agenda",
      "cron",
      "gateway",
      "runtime",
    ]);

    const inventory = {
      assets: OBSERVATORY_ASSET_KINDS.map((kind, index) => ({
        ...asset,
        id: `${kind}:asset-${index}`,
        kind,
      })),
      core_endpoint_ids: ["agent:plato"],
      relationships: [
        {
          from: "agent:plato",
          to: "skill:asset-0",
          kind: "declares",
          authority: "observed",
          source: "openclaw/skills-list",
        },
      ],
      source_health: [
        {
          domain: "skills",
          status: "fresh",
          health: "healthy",
          collected_at: "2026-07-22T22:00:00.000Z",
          last_success_at: "2026-07-22T22:00:00.000Z",
          asset_count: 1,
        },
      ],
    };

    expect(ObservatoryAssetInventorySchema.parse(inventory)).toEqual(inventory);
  });

  it("rejects private absolute and traversal sources", () => {
    for (const source of [
      "/Users/private/.openclaw/openclaw.json",
      "workspace/plato/../../private",
      "C:\\Users\\private\\openclaw.json",
    ]) {
      const result = ObservatoryAssetInventorySchema.safeParse({
        assets: [{ ...asset, source }],
        core_endpoint_ids: [],
        relationships: [],
        source_health: [],
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects unknown asset fields and oversized labels", () => {
    const unknown = ObservatoryAssetInventorySchema.safeParse({
      assets: [{ ...asset, token: "secret" }],
      core_endpoint_ids: [],
      relationships: [],
      source_health: [],
    });
    const oversized = ObservatoryAssetInventorySchema.safeParse({
      assets: [
        {
          ...asset,
          labels: Array.from({ length: 17 }, (_, index) => ({
            key: `k-${index}`,
            value: "v",
          })),
        },
      ],
      core_endpoint_ids: [],
      relationships: [],
      source_health: [],
    });

    expect(unknown.success).toBe(false);
    expect(oversized.success).toBe(false);
  });

  it("rejects duplicate asset ids and dangling relationship endpoints", () => {
    const duplicate = ObservatoryAssetInventorySchema.safeParse({
      assets: [asset, asset],
      core_endpoint_ids: [],
      relationships: [],
      source_health: [],
    });
    const dangling = ObservatoryAssetInventorySchema.safeParse({
      assets: [asset],
      core_endpoint_ids: ["agent:plato"],
      relationships: [
        {
          from: "agent:plato",
          to: "skill:missing",
          kind: "declares",
          authority: "observed",
          source: "openclaw/skills-list",
        },
      ],
      source_health: [],
    });

    expect(duplicate.success).toBe(false);
    expect(dangling.success).toBe(false);
  });

  it("rejects duplicate source health domains and unsafe diagnostic text", () => {
    const health = {
      domain: "operations",
      status: "failed",
      health: "failed",
      collected_at: "2026-07-22T22:00:00.000Z",
      last_success_at: null,
      asset_count: 0,
      error_code: "COMMAND_FAILED",
    } as const;

    const duplicate = ObservatoryAssetInventorySchema.safeParse({
      assets: [],
      core_endpoint_ids: [],
      relationships: [],
      source_health: [health, health],
    });
    const unsafe = ObservatoryAssetInventorySchema.safeParse({
      assets: [],
      core_endpoint_ids: [],
      relationships: [],
      source_health: [{ ...health, error_code: "/Users/private/token=abc" }],
    });

    expect(duplicate.success).toBe(false);
    expect(unsafe.success).toBe(false);
  });
});
