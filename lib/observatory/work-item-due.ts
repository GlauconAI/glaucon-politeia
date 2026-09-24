const VANCOUVER_TIME_ZONE = "America/Vancouver";

const vancouverDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VANCOUVER_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type WorkItemDueClass =
  | "missing"
  | "overdue"
  | "today"
  | "tomorrow"
  | "later";

export function vancouverDateAt(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Expected a valid instant.");
  }
  const parts = new Map(
    vancouverDayFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

function nextCalendarDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function classifyDueOn(
  dueOn: string | null,
  today: string,
): WorkItemDueClass {
  if (!dueOn) return "missing";
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  if (dueOn === nextCalendarDay(today)) return "tomorrow";
  return "later";
}

export function formatDueLabel(
  dueOn: string | null,
  today: string,
): string | null {
  switch (classifyDueOn(dueOn, today)) {
    case "missing":
      return null;
    case "overdue":
      return `Overdue · ${dueOn}`;
    case "today":
      return "Due today";
    case "tomorrow":
      return "Due tomorrow";
    case "later":
      return `Due ${dueOn}`;
  }
}
