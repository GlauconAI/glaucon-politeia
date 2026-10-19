import type { ObservatoryCollectionEnvelope } from "./collection-schema";
import { deriveFreshness } from "./freshness";

// A read-time view only: never persist this derived object or use its digest for publication.
export function ageObservatorySnapshot(snapshot: ObservatoryCollectionEnvelope, now = new Date()): ObservatoryCollectionEnvelope {
  const view = structuredClone(snapshot);
  const age = deriveFreshness("core", view.generated_at, now);
  if (age !== "fresh") {
    view.registry.source.freshness = age;
    view.summary.freshness = age;
  }
  if ("source_health" in view) {
    for (const source of view.source_health) {
      if (source.status === "failed" || source.health === "disabled" || source.error_code) continue;
      const freshness = deriveFreshness(source.domain, source.collected_at, now);
      if (freshness !== "fresh") {
        source.status = freshness;
        source.health = freshness === "stale" ? "degraded" : "unknown";
      }
    }
  }
  function ageNested(value: unknown, inheritedAt = view.generated_at): void {
    if (Array.isArray(value)) { value.forEach(item => ageNested(item, inheritedAt)); return; }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const observedAt = typeof item.collected_at === "string" ? item.collected_at : inheritedAt;
    if (typeof item.domain === "string" && item.status === "fresh" && item.health === "healthy") {
      const freshness = deriveFreshness("core", observedAt, now);
      if (freshness !== "fresh") { item.status = freshness; item.health = freshness === "stale" ? "degraded" : "unknown"; }
    }
    if (typeof item.freshness === "string" && item.freshness === "fresh") {
      const timestamp = observedAt;
      const freshness = deriveFreshness("core", timestamp, now);
      if (freshness !== "fresh") {
        item.freshness = freshness;
        if (item.health === "healthy") item.health = freshness === "stale" ? "degraded" : "unknown";
      }
    }
    Object.values(item).forEach(child => ageNested(child, observedAt));
  }
  ageNested(view);
  return view;
}
