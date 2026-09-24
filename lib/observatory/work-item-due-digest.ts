import { classifyDueOn, type WorkItemDueClass } from "#observatory-work-item-due";
import type {
  ObservatoryWorkItemPriority,
  ObservatoryWorkItemState,
} from "@/lib/observatory/work-items";

export type WorkItemDueDigestItem = {
  id: string;
  title: string;
  projectRef: string | null;
  owner: string | null;
  assignedAgentId: string;
  state: ObservatoryWorkItemState;
  priority: ObservatoryWorkItemPriority | null;
  dueOn: string | null;
};

type DigestGroup = Exclude<WorkItemDueClass, "missing" | "later">;

const groupOrder: Record<DigestGroup, number> = {
  overdue: 0,
  today: 1,
  tomorrow: 2,
};

const groupLabels: Record<DigestGroup, string> = {
  overdue: "已逾期",
  today: "今天到期",
  tomorrow: "明天到期",
};

const priorityOrder: Record<ObservatoryWorkItemPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function plainText(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized || fallback;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function stateLabel(state: ObservatoryWorkItemState): string {
  return state
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderWorkItemDueDigest(input: {
  items: readonly WorkItemDueDigestItem[];
  today: string;
  baseUrl: string;
  maxItems?: number;
  maxBytes?: number;
  totalMatchingItems?: number;
}): string {
  const candidates = input.items
    .filter((item) => item.state !== "done")
    .map((item) => ({
      item,
      group: classifyDueOn(item.dueOn, input.today),
    }))
    .filter(
      (entry): entry is { item: WorkItemDueDigestItem; group: DigestGroup } =>
        entry.group === "overdue" ||
        entry.group === "today" ||
        entry.group === "tomorrow",
    )
    .sort((left, right) => {
      const groupDifference = groupOrder[left.group] - groupOrder[right.group];
      if (groupDifference !== 0) return groupDifference;
      const dateDifference = (left.item.dueOn ?? "").localeCompare(
        right.item.dueOn ?? "",
        "en",
      );
      if (dateDifference !== 0) return dateDifference;
      const priorityDifference =
        (left.item.priority ? priorityOrder[left.item.priority] : 4) -
        (right.item.priority ? priorityOrder[right.item.priority] : 4);
      if (priorityDifference !== 0) return priorityDifference;
      const projectDifference = plainText(left.item.projectRef, "No Project").localeCompare(
        plainText(right.item.projectRef, "No Project"),
        "zh-Hans",
      );
      if (projectDifference !== 0) return projectDifference;
      return plainText(left.item.title, "Untitled").localeCompare(
        plainText(right.item.title, "Untitled"),
        "zh-Hans",
      ) || left.item.id.localeCompare(right.item.id, "en");
    });

  if (candidates.length === 0) return "";

  const maxItems = Math.max(1, input.maxItems ?? 30);
  const maxBytes = Math.max(256, input.maxBytes ?? 3_500);
  const selected = candidates.slice(0, maxItems);
  const totalMatchingItems = Math.max(
    candidates.length,
    input.totalMatchingItems ?? candidates.length,
  );

  function render(entries: typeof selected): string {
    const sections: string[] = [`Work Tracker｜到期事项 · ${input.today}`];
    for (const group of ["overdue", "today", "tomorrow"] as const) {
      const groupEntries = entries.filter((entry) => entry.group === group);
      if (groupEntries.length === 0) continue;
      sections.push(
        `${groupLabels[group]}（${groupEntries.length}）\n${groupEntries
          .map(({ item }) => {
            const priority = (item.priority ?? "none").toUpperCase();
            const project = plainText(item.projectRef, "No Project");
            const title = plainText(item.title, "Untitled");
            const owner = plainText(item.owner, "Owner 未分配");
            const due = group === "overdue" ? `原定 ${item.dueOn}` : groupLabels[group].replace("到期", "");
            return `- [${priority}] ${project} / ${title}｜${owner}｜${stateLabel(item.state)}｜${due}`;
          })
          .join("\n")}`,
      );
    }
    const omitted = totalMatchingItems - entries.length;
    if (omitted > 0) sections.push(`另有 ${omitted} 项未展开。`);
    sections.push(`查看 Work Tracker：${input.baseUrl}`);
    return sections.join("\n\n");
  }

  let output = render(selected);
  while (byteLength(output) > maxBytes && selected.length > 0) {
    selected.pop();
    output = render(selected);
  }
  if (byteLength(output) <= maxBytes) return output;

  const fallback = `Work Tracker｜到期事项 · ${input.today}\n\n共 ${totalMatchingItems} 项，请查看：${input.baseUrl}`;
  if (byteLength(fallback) <= maxBytes) return fallback;
  throw new RangeError("Digest byte budget is too small for its fixed content.");
}
