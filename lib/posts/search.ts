export function normalizeSearchQuery(query: string | null | undefined) {
  return (query ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function toSafeIlikePattern(query: string) {
  const escaped = normalizeSearchQuery(query).replace(/[%_\\]/g, (value) => `\\${value}`);
  return `%${escaped}%`;
}
