type UsernameOptions = {
  maxLength?: number;
  fallback?: string;
};

type UniqueUsernameOptions = UsernameOptions & {
  isTaken: (candidate: string) => boolean;
  suffix: () => string;
};

const defaultUsernameMaxLength = 32;

function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function trimUsername(value: string, maxLength: number) {
  return value.slice(0, maxLength).replace(/-+$/g, "");
}

export function usernameFromEmail(email: string, options: UsernameOptions = {}) {
  const maxLength = options.maxLength ?? defaultUsernameMaxLength;
  const fallback = options.fallback ?? "user";
  const prefix = (email.split("@")[0] ?? "").split("+")[0] ?? "";
  const username = normalizeUsername(prefix);

  return (
    trimUsername(username || fallback, maxLength) || fallback.slice(0, maxLength)
  );
}

export function createUniqueUsername(
  email: string,
  options: UniqueUsernameOptions,
) {
  const maxLength = options.maxLength ?? defaultUsernameMaxLength;
  const base = usernameFromEmail(email, {
    maxLength,
    fallback: options.fallback,
  });

  if (!options.isTaken(base)) {
    return base;
  }

  const suffix = normalizeUsername(options.suffix()).slice(0, maxLength);
  const separatorLength = 1;
  const baseMaxLength = Math.max(1, maxLength - suffix.length - separatorLength);
  const trimmedBase = trimUsername(base, baseMaxLength);

  return `${trimmedBase}-${suffix}`;
}
