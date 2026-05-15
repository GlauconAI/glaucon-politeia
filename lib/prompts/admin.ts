export type PromptAdminFilters = {
  q: string;
  page: number;
  pageSize: number;
  marked?: boolean;
  sensitive?: boolean;
};

export type PromptExportRow = {
  id: string;
  created_at: string;
  source_url: string;
  user_id: string | null;
  content: string;
  marked: boolean;
  marked_reason: string | null;
  flags: unknown;
};

export type PromptHourlyInput = {
  created_at: string;
};

export function parsePromptAdminFilters(searchParams: URLSearchParams): PromptAdminFilters {
  return {
    q: (searchParams.get("q") ?? "").trim().slice(0, 200),
    page: clampInteger(searchParams.get("page"), 1, 9999, 1),
    pageSize: clampInteger(searchParams.get("pageSize"), 1, 100, 25),
    marked: parseBoolean(searchParams.get("marked")),
    sensitive: parseBoolean(searchParams.get("sensitive")),
  };
}

export function buildPromptCsv(rows: PromptExportRow[]) {
  const header = [
    "id",
    "created_at",
    "source_url",
    "user_id",
    "marked",
    "marked_reason",
    "flags",
    "content",
  ];

  return [
    header.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.created_at,
        row.source_url,
        row.user_id ?? "",
        String(row.marked),
        row.marked_reason ?? "",
        JSON.stringify(row.flags ?? {}),
        row.content,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

export function createHourlyPromptBuckets(
  rows: PromptHourlyInput[],
  now = new Date(),
) {
  const endHour = floorToHour(now);
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const hour = new Date(endHour.getTime() - (23 - index) * 60 * 60 * 1000);
    return { hour: hour.toISOString(), count: 0 };
  });
  const counts = new Map(buckets.map((bucket) => [bucket.hour, bucket]));

  for (const row of rows) {
    const hour = floorToHour(new Date(row.created_at)).toISOString();
    const bucket = counts.get(hour);
    if (bucket) {
      bucket.count += 1;
    }
  }

  return buckets;
}

export function verifyRetentionSecret(configured: string | undefined, provided: string | null) {
  return Boolean(configured && provided && configured === provided);
}

export function normalizeBulkAction(value: unknown) {
  return value === "mark" || value === "unmark" || value === "delete" ? value : null;
}

function parseBoolean(value: string | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function clampInteger(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function floorToHour(date: Date) {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  return next;
}
