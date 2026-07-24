import type {
  ObservatorySourceDomain,
  ObservatorySourceHealth,
} from "#observatory-asset-schema";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1_000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1_000;

const thresholdByDomain: Record<ObservatorySourceDomain, number> = {
  core: TWENTY_FOUR_HOURS_MS,
  skills: TWENTY_FOUR_HOURS_MS,
  tools_profiles: TWENTY_FOUR_HOURS_MS,
  rules_config: TWENTY_FOUR_HOURS_MS,
  knowledge_agenda: TWENTY_FOUR_HOURS_MS,
  operations: FIFTEEN_MINUTES_MS,
  source_repositories: TWENTY_FOUR_HOURS_MS,
};

export function deriveFreshness(
  domain: ObservatorySourceDomain,
  collectedAt: string,
  now = new Date(),
): "fresh" | "stale" | "unknown" {
  const collectedTime = Date.parse(collectedAt);
  const nowTime = now.getTime();
  if (
    !Number.isFinite(collectedTime) ||
    !Number.isFinite(nowTime) ||
    collectedTime > nowTime
  ) {
    return "unknown";
  }
  return nowTime - collectedTime < thresholdByDomain[domain]
    ? "fresh"
    : "stale";
}

export function rollupSourceHealth(input: {
  domain: ObservatorySourceDomain;
  collectedAt: string;
  lastSuccessAt: string | null;
  assetCount: number;
  failed?: boolean;
  disabled?: boolean;
  errorCode?: string;
  now?: Date;
}): ObservatorySourceHealth {
  if (input.failed) {
    return {
      domain: input.domain,
      status: "failed",
      health: "failed",
      collected_at: input.collectedAt,
      last_success_at: input.lastSuccessAt,
      asset_count: input.assetCount,
      ...(input.errorCode ? { error_code: input.errorCode } : {}),
    };
  }
  const status = deriveFreshness(
    input.domain,
    input.collectedAt,
    input.now,
  );
  return {
    domain: input.domain,
    status,
    health: input.disabled
      ? "disabled"
      : status === "fresh"
        ? "healthy"
        : status === "stale"
          ? "degraded"
          : "unknown",
    collected_at: input.collectedAt,
    last_success_at: input.lastSuccessAt,
    asset_count: input.assetCount,
  };
}
