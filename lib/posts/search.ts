export function normalizeSearchQuery(query: string | null | undefined) {
  return (query ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function toSafeIlikePattern(query: string) {
  const escaped = normalizeSearchQuery(query).replace(/[%_\\]/g, (value) => `\\${value}`);
  return `%${escaped}%`;
}

export function buildSearchOrFilter(query: string) {
  const pattern = toSafeIlikePattern(query);

  return [
    `title.ilike.${pattern}`,
    `content_md.ilike.${pattern}`,
    `content_html.ilike.${pattern}`,
  ].join(",");
}

export function normalizeSearchType(type: string | null | undefined) {
  return type === "html" || type === "markdown" ? type : null;
}
