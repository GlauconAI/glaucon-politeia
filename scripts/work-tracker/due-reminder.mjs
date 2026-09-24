#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { vancouverDateAt } from "#observatory-work-item-due";
import { renderWorkItemDueDigest } from "#observatory-work-item-due-digest";

function parseEnv(source) {
  const result = {};
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function nextCalendarDay(day) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export async function runDueReminder(dependencies = {}) {
  const cwd = dependencies.cwd ?? process.cwd();
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const read = dependencies.readFile ?? readFile;
  const connect = dependencies.connect ?? ((databaseUrl) => postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 5,
    max: 1,
    ssl: "require",
    onnotice: () => undefined,
  }));
  let sql;

  try {
    const localEnv = parseEnv(await read(resolve(cwd, ".env.local"), "utf8"));
    const databaseUrl = process.env.SUPABASE_DB_URL ?? localEnv.SUPABASE_DB_URL;
    if (!databaseUrl) throw new Error("missing database configuration");

    const today = vancouverDateAt(dependencies.now ?? new Date());
    const tomorrow = nextCalendarDay(today);
    sql = connect(databaseUrl);
    const rows = await sql`
      select
        items.id,
        items.title,
        items.project_ref,
        coalesce(profiles.display_name, profiles.username) as owner,
        items.assigned_agent_id,
        items.state,
        items.priority,
        items.due_on::text as due_on,
        count(*) over() as total_matching_items
      from public.observatory_work_items items
      left join public.profiles profiles on profiles.user_id = items.owner_id
      where items.state <> 'done'
        and items.due_on is not null
        and items.due_on <= ${tomorrow}::date
      order by
        items.due_on,
        case items.priority
          when 'urgent' then 0
          when 'high' then 1
          when 'medium' then 2
          when 'low' then 3
          else 4
        end,
        items.project_ref,
        items.title,
        items.id
      limit 200
    `;

    const digest = renderWorkItemDueDigest({
      today,
      baseUrl: dependencies.baseUrl ?? "https://402v.com/work-tracker",
      maxItems: dependencies.maxItems,
      maxBytes: dependencies.maxBytes,
      totalMatchingItems: rows[0]?.total_matching_items
        ? Number(rows[0].total_matching_items)
        : 0,
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        projectRef: row.project_ref,
        owner: row.owner,
        assignedAgentId: row.assigned_agent_id,
        state: row.state,
        priority: row.priority,
        dueOn: row.due_on,
      })),
    });
    if (digest) stdout.write(`${digest}\n`);
    return 0;
  } catch {
    stderr.write("WORK_TRACKER_DUE_REMINDER_FAILED\n");
    return 1;
  } finally {
    if (sql?.end) await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runDueReminder();
}
