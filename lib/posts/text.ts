type SlugOptions = {
  maxLength?: number;
  fallback?: string;
};

type UniqueSlugOptions = SlugOptions & {
  isTaken: (candidate: string) => boolean;
  suffix: () => string;
};

const defaultSlugMaxLength = 64;

function normalizeTokenText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function trimToken(value: string, maxLength: number) {
  return value.slice(0, maxLength).replace(/-+$/g, "");
}

export function slugifyTitle(title: string, options: SlugOptions = {}) {
  const maxLength = options.maxLength ?? defaultSlugMaxLength;
  const fallback = options.fallback ?? "post";
  const slug = normalizeTokenText(title);

  return trimToken(slug || fallback, maxLength) || fallback.slice(0, maxLength);
}

export function createUniqueSlug(title: string, options: UniqueSlugOptions) {
  const maxLength = options.maxLength ?? defaultSlugMaxLength;
  const base = slugifyTitle(title, {
    maxLength,
    fallback: options.fallback,
  });

  if (!options.isTaken(base)) {
    return base;
  }

  const suffix = normalizeTokenText(options.suffix()).slice(0, maxLength);
  const separatorLength = 1;
  const baseMaxLength = Math.max(1, maxLength - suffix.length - separatorLength);
  const trimmedBase = trimToken(base, baseMaxLength);

  return `${trimmedBase}-${suffix}`;
}

function stripCodeBlocks(markdown: string) {
  return markdown.replace(/```[\s\S]*?```/g, " ");
}

export function createExcerpt(markdown: string, maxLength = 140) {
  const normalized = stripCodeBlocks(markdown)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\s>*+-]+/gm, "")
    .replace(/[*_~>#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const candidate = normalized.slice(0, maxLength).trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const trimmed =
    lastSpace > 0 ? candidate.slice(0, lastSpace).trimEnd() : candidate;

  return `${trimmed}...`;
}
