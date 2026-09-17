import { CronExpressionParser } from "cron-parser";

import type { DashboardCronEntry } from "@/lib/observatory/dashboard-directory";

export const CRON_OPERATIONS_TIMEZONE = "America/Vancouver";
export const CRON_OPERATIONS_HORIZON_DAYS = 7;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CROWDED_WINDOW_MS = 15 * MINUTE_MS;

export type CronOccurrence = {
  occurrenceId: string;
  job: DashboardCronEntry;
  startsAt: string;
  minuteKey: string;
  localDayKey: string;
  localDayLabel: string;
  localTimeLabel: string;
};

export type CronRiskGroup = {
  id: string;
  level: "hard" | "crowded";
  startsAt: string;
  endsAt: string;
  occurrences: CronOccurrence[];
  jobCount: number;
  agentCount: number;
};

export type CronProjectionIssue = {
  assetId: string;
  name: string;
  reason:
    | "missing-anchor"
    | "invalid-expression"
    | "invalid-interval"
    | "invalid-timezone"
    | "occurrence-cap";
};

export type CronDayGroup = {
  dayKey: string;
  dayLabel: string;
  occurrences: CronOccurrence[];
};

export type CronAgentSummary = {
  owner: string;
  jobs: DashboardCronEntry[];
  nextRunAt: string | null;
  hardConflictCount: number;
  crowdedWindowCount: number;
  attentionCount: number;
};

export type CronOperationsModel = {
  from: string;
  through: string;
  recurringJobs: DashboardCronEntry[];
  occurrences: CronOccurrence[];
  dayGroups: CronDayGroup[];
  hardConflicts: CronRiskGroup[];
  crowdedWindows: CronRiskGroup[];
  agentSummaries: CronAgentSummary[];
  issues: CronProjectionIssue[];
};

export type BuildCronOperationsOptions = {
  from: string;
  horizonDays?: number;
  displayTimeZone?: string;
  maxOccurrencesPerJob?: number;
  maxOccurrencesTotal?: number;
};

export function isEnabledRecurringCron(cron: DashboardCronEntry): boolean {
  return (
    cron.enabled === true &&
    (cron.scheduleType === "cron" || cron.scheduleType === "every")
  );
}

function isAttention(cron: DashboardCronEntry): boolean {
  return (
    cron.health === "failed" ||
    cron.health === "degraded" ||
    (cron.consecutiveErrors ?? 0) > 0
  );
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function localParts(
  date: Date,
  displayTimeZone: string,
): Pick<
  CronOccurrence,
  "localDayKey" | "localDayLabel" | "localTimeLabel"
> {
  const dayKeyParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: displayTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    dayKeyParts.find((candidate) => candidate.type === type)?.value ?? "";
  return {
    localDayKey: `${part("year")}-${part("month")}-${part("day")}`,
    localDayLabel: new Intl.DateTimeFormat("en-CA", {
      timeZone: displayTimeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(date),
    localTimeLabel: new Intl.DateTimeFormat("en-CA", {
      timeZone: displayTimeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date),
  };
}

function occurrence(
  job: DashboardCronEntry,
  timestamp: number,
  displayTimeZone: string,
): CronOccurrence {
  const date = new Date(timestamp);
  const startsAt = date.toISOString();
  return {
    occurrenceId: `${job.assetId}:${startsAt}`,
    job,
    startsAt,
    minuteKey: new Date(Math.floor(timestamp / MINUTE_MS) * MINUTE_MS).toISOString(),
    ...localParts(date, displayTimeZone),
  };
}

function issue(
  job: DashboardCronEntry,
  reason: CronProjectionIssue["reason"],
): CronProjectionIssue {
  return { assetId: job.assetId, name: job.name, reason };
}

function projectCalendar(
  job: DashboardCronEntry,
  fromMs: number,
  throughMs: number,
  displayTimeZone: string,
  maxOccurrences: number,
): { occurrences: CronOccurrence[]; issue?: CronProjectionIssue } {
  if (!job.scheduleValue) {
    return { occurrences: [], issue: issue(job, "invalid-expression") };
  }
  const timeZone = job.timezone ?? "UTC";
  if (!isValidTimeZone(timeZone)) {
    return { occurrences: [], issue: issue(job, "invalid-timezone") };
  }

  try {
    const interval = CronExpressionParser.parse(job.scheduleValue, {
      currentDate: new Date(fromMs),
      tz: timeZone,
    });
    const occurrences: CronOccurrence[] = [];
    while (true) {
      const next = interval.next().toDate().getTime();
      if (!Number.isFinite(next) || next >= throughMs) break;
      if (occurrences.length >= maxOccurrences) {
        return {
          occurrences,
          issue: issue(job, "occurrence-cap"),
        };
      }
      occurrences.push(occurrence(job, next, displayTimeZone));
    }
    return { occurrences };
  } catch {
    return { occurrences: [], issue: issue(job, "invalid-expression") };
  }
}

function projectInterval(
  job: DashboardCronEntry,
  fromMs: number,
  throughMs: number,
  displayTimeZone: string,
  maxOccurrences: number,
): { occurrences: CronOccurrence[]; issue?: CronProjectionIssue } {
  if (!job.nextRunAt) {
    return { occurrences: [], issue: issue(job, "missing-anchor") };
  }
  const intervalMs = Number(job.scheduleValue);
  if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
    return { occurrences: [], issue: issue(job, "invalid-interval") };
  }
  let nextMs = new Date(job.nextRunAt).getTime();
  if (!Number.isFinite(nextMs)) {
    return { occurrences: [], issue: issue(job, "missing-anchor") };
  }
  if (nextMs < fromMs) {
    nextMs += Math.ceil((fromMs - nextMs) / intervalMs) * intervalMs;
  }

  const occurrences: CronOccurrence[] = [];
  while (nextMs < throughMs) {
    if (occurrences.length >= maxOccurrences) {
      return { occurrences, issue: issue(job, "occurrence-cap") };
    }
    occurrences.push(occurrence(job, nextMs, displayTimeZone));
    nextMs += intervalMs;
  }
  return { occurrences };
}

function riskGroup(
  level: CronRiskGroup["level"],
  occurrences: CronOccurrence[],
): CronRiskGroup {
  const sorted = [...occurrences].sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt),
  );
  const startsAt = sorted[0]!.startsAt;
  const endsAt = sorted.at(-1)!.startsAt;
  return {
    id: `${level}:${startsAt}:${endsAt}`,
    level,
    startsAt,
    endsAt,
    occurrences: sorted,
    jobCount: new Set(sorted.map((candidate) => candidate.job.assetId)).size,
    agentCount: new Set(sorted.map((candidate) => candidate.job.owner)).size,
  };
}

function hardConflicts(occurrences: CronOccurrence[]): CronRiskGroup[] {
  const byMinute = new Map<string, CronOccurrence[]>();
  for (const candidate of occurrences) {
    const values = byMinute.get(candidate.minuteKey) ?? [];
    values.push(candidate);
    byMinute.set(candidate.minuteKey, values);
  }
  return [...byMinute.values()]
    .filter(
      (values) =>
        new Set(values.map((candidate) => candidate.job.assetId)).size >= 2,
    )
    .map((values) => riskGroup("hard", values))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function crowdedWindows(occurrences: CronOccurrence[]): CronRiskGroup[] {
  const byMinute = new Map<string, CronOccurrence[]>();
  for (const candidate of occurrences) {
    const values = byMinute.get(candidate.minuteKey) ?? [];
    values.push(candidate);
    byMinute.set(candidate.minuteKey, values);
  }
  const buckets = [...byMinute.entries()]
    .map(([minuteKey, values]) => ({
      minuteKey,
      timestamp: new Date(minuteKey).getTime(),
      occurrences: values,
    }))
    .sort((left, right) => left.timestamp - right.timestamp);

  const raw: CronOccurrence[][] = [];
  for (let start = 0; start < buckets.length; start += 1) {
    const values: CronOccurrence[] = [];
    let distinctMinutes = 0;
    for (let end = start; end < buckets.length; end += 1) {
      if (buckets[end]!.timestamp - buckets[start]!.timestamp > CROWDED_WINDOW_MS) {
        break;
      }
      distinctMinutes += 1;
      values.push(...buckets[end]!.occurrences);
    }
    if (
      distinctMinutes >= 2 &&
      new Set(values.map((candidate) => candidate.job.assetId)).size >= 2
    ) {
      raw.push(values);
    }
  }

  const merged: CronOccurrence[][] = [];
  for (const values of raw) {
    const currentIds = new Set(values.map((candidate) => candidate.occurrenceId));
    const existing = merged.find((candidate) =>
      candidate.some((occurrenceValue) => currentIds.has(occurrenceValue.occurrenceId)),
    );
    if (!existing) {
      merged.push([...values]);
      continue;
    }
    const existingIds = new Set(existing.map((candidate) => candidate.occurrenceId));
    for (const value of values) {
      if (!existingIds.has(value.occurrenceId)) existing.push(value);
    }
  }

  return merged
    .map((values) => riskGroup("crowded", values))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function dayGroups(occurrences: CronOccurrence[]): CronDayGroup[] {
  const groups = new Map<string, CronDayGroup>();
  for (const candidate of occurrences) {
    const group = groups.get(candidate.localDayKey) ?? {
      dayKey: candidate.localDayKey,
      dayLabel: candidate.localDayLabel,
      occurrences: [],
    };
    group.occurrences.push(candidate);
    groups.set(candidate.localDayKey, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      occurrences: group.occurrences.sort((left, right) =>
        left.startsAt.localeCompare(right.startsAt),
      ),
    }))
    .sort((left, right) => left.dayKey.localeCompare(right.dayKey));
}

function containsOwner(group: CronRiskGroup, owner: string): boolean {
  return group.occurrences.some((candidate) => candidate.job.owner === owner);
}

function agentSummaries(
  jobs: DashboardCronEntry[],
  occurrences: CronOccurrence[],
  hard: CronRiskGroup[],
  crowded: CronRiskGroup[],
): CronAgentSummary[] {
  const owners = [...new Set(jobs.map((job) => job.owner))].sort();
  return owners.map((owner) => {
    const ownerJobs = jobs.filter((job) => job.owner === owner);
    const ownerOccurrences = occurrences.filter(
      (candidate) => candidate.job.owner === owner,
    );
    const nextByJob = new Map<string, string>();
    for (const candidate of ownerOccurrences) {
      if (!nextByJob.has(candidate.job.assetId)) {
        nextByJob.set(candidate.job.assetId, candidate.startsAt);
      }
    }
    const sortedJobs = [...ownerJobs].sort((left, right) => {
      const leftNext = nextByJob.get(left.assetId) ?? left.nextRunAt ?? "9999";
      const rightNext = nextByJob.get(right.assetId) ?? right.nextRunAt ?? "9999";
      return leftNext.localeCompare(rightNext) || left.name.localeCompare(right.name);
    });
    return {
      owner,
      jobs: sortedJobs,
      nextRunAt:
        ownerOccurrences[0]?.startsAt ?? sortedJobs[0]?.nextRunAt ?? null,
      hardConflictCount: hard.filter((group) => containsOwner(group, owner)).length,
      crowdedWindowCount: crowded.filter((group) =>
        containsOwner(group, owner),
      ).length,
      attentionCount: ownerJobs.filter(isAttention).length,
    };
  });
}

export function buildCronOperations(
  crons: DashboardCronEntry[],
  options: BuildCronOperationsOptions,
): CronOperationsModel {
  const fromMs = new Date(options.from).getTime();
  if (!Number.isFinite(fromMs)) {
    throw new Error("Cron operations projection requires a valid from timestamp.");
  }
  const horizonDays = options.horizonDays ?? CRON_OPERATIONS_HORIZON_DAYS;
  const throughMs = fromMs + horizonDays * DAY_MS;
  const displayTimeZone = options.displayTimeZone ?? CRON_OPERATIONS_TIMEZONE;
  if (!isValidTimeZone(displayTimeZone)) {
    throw new Error(`Invalid display timezone: ${displayTimeZone}`);
  }
  const maxOccurrencesPerJob = options.maxOccurrencesPerJob ?? 1_000;
  const maxOccurrencesTotal = options.maxOccurrencesTotal ?? 10_000;
  const recurringJobs = crons.filter(isEnabledRecurringCron);
  const occurrences: CronOccurrence[] = [];
  const issues: CronProjectionIssue[] = [];

  for (const job of recurringJobs) {
    const result =
      job.scheduleType === "cron"
        ? projectCalendar(
            job,
            fromMs,
            throughMs,
            displayTimeZone,
            maxOccurrencesPerJob,
          )
        : projectInterval(
            job,
            fromMs,
            throughMs,
            displayTimeZone,
            maxOccurrencesPerJob,
          );
    if (result.issue) issues.push(result.issue);
    const remaining = maxOccurrencesTotal - occurrences.length;
    occurrences.push(...result.occurrences.slice(0, Math.max(remaining, 0)));
    if (result.occurrences.length > remaining) {
      if (!issues.some((candidate) => candidate.assetId === job.assetId)) {
        issues.push(issue(job, "occurrence-cap"));
      }
      break;
    }
  }

  occurrences.sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt) ||
    left.job.name.localeCompare(right.job.name),
  );
  const hard = hardConflicts(occurrences);
  const crowded = crowdedWindows(occurrences);
  return {
    from: new Date(fromMs).toISOString(),
    through: new Date(throughMs).toISOString(),
    recurringJobs,
    occurrences,
    dayGroups: dayGroups(occurrences),
    hardConflicts: hard,
    crowdedWindows: crowded,
    agentSummaries: agentSummaries(recurringJobs, occurrences, hard, crowded),
    issues,
  };
}
